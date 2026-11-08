import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { create } from 'zustand';
import { activationKey, canActivateLeader, moveSourceFrom } from './viewModel';

/**
 * Local UI state of the `core-v1` turn flow (SWR-005 plan-frontend §3.2). Never a copy of the server view:
 * - `armedLeaderId` — leader taken for an activation (step 1 of the turn); dropped when the server no longer lists
 *   it in `ACTIVATE_SYSTEM.leaderIds`;
 * - `moveDraft` — checked units per source system (`MOVE_PIECES` panel); dropped when the activation changes,
 *   and per source after a successful move / 409 (`clearDraft`); ids the server no longer lists are filtered out;
 * - `lastOutcomeSeen` — `view.version` at which the game-over banner already took focus (focus once).
 */
export type MoveDraft = Readonly<Record<string, readonly string[]>>;

interface CoreUiState {
  armedLeaderId: string | null;
  moveDraft: MoveDraft;
  /** `activationKey(view)` the draft belongs to. */
  draftActivation: string | null;
  lastOutcomeSeen: number | null;
  arm(leaderId: string): void;
  disarm(): void;
  /** Checks / unchecks one unit of a source. */
  toggleDraftPiece(fromSystemId: string, pieceId: string): void;
  /** Replaces the selection of a source («select all» / «none»); `[]` removes the source. */
  setDraft(fromSystemId: string, pieceIds: readonly string[]): void;
  /** Clears one source (after its successful MOVE) or the whole draft (no argument: 409, new activation). */
  clearDraft(fromSystemId?: string): void;
  markOutcomeSeen(version: number): void;
  /** Aligns the local state with a new server view (call on every view change). */
  reconcile(view: PlayerViewCore): void;
  reset(): void;
}

const INITIAL = {
  armedLeaderId: null,
  moveDraft: {},
  draftActivation: null,
  lastOutcomeSeen: null,
} satisfies Partial<CoreUiState>;

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
  reconcile: (view) => {
    const s = get();
    const patch: Partial<CoreUiState> = {};
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
