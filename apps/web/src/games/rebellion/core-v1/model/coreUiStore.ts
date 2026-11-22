import type { FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import { create } from 'zustand';
import type { Arena } from './forces';
import {
  activationKey,
  canActivateLeader,
  hiddenZone,
  moveSourceFrom,
  systemById,
} from './viewModel';

/**
 * Local UI state of the `core-v1` turn flow (SWR-005 plan-frontend §3.2). Never a copy of the server view:
 * - `armedLeaderId` — leader taken for an activation (step 1 of the turn); dropped when the server no longer lists
 *   it in `ACTIVATE_SYSTEM.leaderIds`;
 * - `moveDraft` — checked units per source system (`MOVE_PIECES` panel); dropped when the activation changes,
 *   and per source after a successful move / 409 (`clearDraft`); ids the server no longer lists are filtered out;
 * - `lastOutcomeSeen` — `view.version` at which the game-over banner already took focus (focus once);
 * - `manifest` (SWR-009 K-6, plan §3.4) — the Unit Manifest asked for (a system or the hidden zone, optionally one
 *   group). The caller selects the same target in `selectionStore`; `UnitInspector` shows the manifest only while
 *   `manifest.target` matches the selection. Dropped when its target disappears from the view.
 */
export type MoveDraft = Readonly<Record<string, readonly string[]>>;

export type ManifestTarget = { kind: 'system'; systemId: string } | { kind: 'zone' };
export interface ManifestGroupRef {
  owner: FactionId;
  arena: Arena | 'all';
}
export interface ManifestRequest {
  target: ManifestTarget;
  group: ManifestGroupRef | null;
}

interface CoreUiState {
  armedLeaderId: string | null;
  moveDraft: MoveDraft;
  /** `activationKey(view)` the draft belongs to. */
  draftActivation: string | null;
  lastOutcomeSeen: number | null;
  manifest: ManifestRequest | null;
  arm(leaderId: string): void;
  disarm(): void;
  /** Checks / unchecks one unit of a source. */
  toggleDraftPiece(fromSystemId: string, pieceId: string): void;
  /** Replaces the selection of a source («select all» / «none»); `[]` removes the source. */
  setDraft(fromSystemId: string, pieceIds: readonly string[]): void;
  /** Clears one source (after its successful MOVE) or the whole draft (no argument: 409, new activation). */
  clearDraft(fromSystemId?: string): void;
  markOutcomeSeen(version: number): void;
  /** Opens the Unit Manifest of a system / the hidden zone, optionally highlighting one group. */
  openManifest(target: ManifestTarget, group?: ManifestGroupRef | null): void;
  closeManifest(): void;
  /** Aligns the local state with a new server view (call on every view change). */
  reconcile(view: PlayerViewCore): void;
  reset(): void;
}

const INITIAL = {
  armedLeaderId: null,
  moveDraft: {},
  draftActivation: null,
  lastOutcomeSeen: null,
  manifest: null,
} satisfies Partial<CoreUiState>;

function sameRequest(a: ManifestRequest | null, b: ManifestRequest): boolean {
  if (a === null) return false;
  const sameTarget =
    a.target.kind === b.target.kind &&
    (a.target.kind === 'zone' ||
      (b.target.kind === 'system' && a.target.systemId === b.target.systemId));
  const sameGroup =
    a.group === b.group ||
    (a.group !== null &&
      b.group !== null &&
      a.group.owner === b.group.owner &&
      a.group.arena === b.group.arena);
  return sameTarget && sameGroup;
}

/** The manifest target still exists in the view (system on the map / the zone still hidden). */
function targetExists(view: PlayerViewCore, target: ManifestTarget): boolean {
  return target.kind === 'zone'
    ? hiddenZone(view) !== null
    : systemById(view, target.systemId) !== undefined;
}

function withoutSource(draft: MoveDraft, fromSystemId: string): MoveDraft {
  if (!(fromSystemId in draft)) return draft;
  const next = { ...draft };
  delete next[fromSystemId];
  return next;
}

export const useCoreUiStore = create<CoreUiState>()((set, get) => ({
  ...INITIAL,
  arm: (leaderId) => {
    if (get().armedLeaderId !== leaderId) set({ armedLeaderId: leaderId });
  },
  disarm: () => {
    if (get().armedLeaderId !== null) set({ armedLeaderId: null });
  },
  toggleDraftPiece: (fromSystemId, pieceId) => {
    const current = get().moveDraft[fromSystemId] ?? [];
    const next = current.includes(pieceId)
      ? current.filter((id) => id !== pieceId)
      : [...current, pieceId];
    get().setDraft(fromSystemId, next);
  },
  setDraft: (fromSystemId, pieceIds) => {
    const draft = get().moveDraft;
    set({
      moveDraft:
        pieceIds.length === 0
          ? withoutSource(draft, fromSystemId)
          : { ...draft, [fromSystemId]: [...pieceIds] },
    });
  },
  clearDraft: (fromSystemId) => {
    const draft = get().moveDraft;
    if (fromSystemId === undefined) {
      if (Object.keys(draft).length > 0) set({ moveDraft: {} });
      return;
    }
    const next = withoutSource(draft, fromSystemId);
    if (next !== draft) set({ moveDraft: next });
  },
  markOutcomeSeen: (version) => {
    if (get().lastOutcomeSeen !== version) set({ lastOutcomeSeen: version });
  },
  openManifest: (target, group = null) => {
    const next: ManifestRequest = {
      target:
        target.kind === 'zone' ? { kind: 'zone' } : { kind: 'system', systemId: target.systemId },
      group: group ? { owner: group.owner, arena: group.arena } : null,
    };
    if (!sameRequest(get().manifest, next)) set({ manifest: next });
  },
  closeManifest: () => {
    if (get().manifest !== null) set({ manifest: null });
  },
  reconcile: (view) => {
    const s = get();
    const patch: Partial<CoreUiState> = {};
    if (s.manifest !== null && !targetExists(view, s.manifest.target)) patch.manifest = null;
    if (s.armedLeaderId !== null && !canActivateLeader(view, s.armedLeaderId)) {
      patch.armedLeaderId = null;
    }
    const key = activationKey(view);
    if (key !== s.draftActivation) {
      patch.draftActivation = key;
      if (Object.keys(s.moveDraft).length > 0) patch.moveDraft = {};
    } else {
      // Same activation: keep only what the server still lists as candidates of each source.
      let changed = false;
      const next: Record<string, readonly string[]> = {};
      for (const [from, ids] of Object.entries(s.moveDraft)) {
        const source = moveSourceFrom(view, from);
        const kept = source ? ids.filter((id) => source.pieces.some((p) => p.pieceId === id)) : [];
        if (kept.length !== ids.length) changed = true;
        if (kept.length > 0) next[from] = kept;
      }
      if (changed) patch.moveDraft = next;
    }
    if (Object.keys(patch).length > 0) set(patch);
  },
  reset: () => set({ ...INITIAL }),
}));
