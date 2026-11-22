import type { FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import type { ManifestGroupRef, ManifestRequest, ManifestTarget } from '../model/coreUiStore';
import {
  type Arena,
  type ForceGroup,
  type ForceLeader,
  forcesBySystem,
  zoneForces,
} from '../model/forces';
import { systemById, visibleRebelBaseSystemId } from '../model/viewModel';

/**
 * Unit Manifest view model (SWR-009 MF, plan §3.3). A pure function of the server `PlayerView` and the manifest
 * request (`coreUiStore.manifest`) only, built on `forces.ts`: a system's manifest is exactly `forcesBySystem`, the
 * hidden zone's is exactly `zoneForces` (§3.5) — nothing is inferred, the zone model carries no system / region.
 */

export type ManifestState = 'fleet' | 'fleetGround' | 'both' | 'leader' | 'empty' | 'restricted';

interface ManifestVmBase {
  state: ManifestState;
  /** Sides present (units or leaders), Empire first. */
  factions: FactionId[];
  /** Groups side × arena (empty groups omitted), order of `forces.ts`. */
  groups: ForceGroup[];
  leaders: ForceLeader[];
  /** Arenas that have units (distinguishes «fleet only» from «ground only» in state `fleet`). */
  arenas: Arena[];
  /** Number of units (leaders are counted separately). */
  total: number;
  /** The highlighted group (from the request), or `null`; never points at a group that is not shown. */
  selectedGroup: ManifestGroupRef | null;
}

export interface SystemManifestVm extends ManifestVmBase {
  target: { kind: 'system'; systemId: string };
  systemNameKey: string;
  regionId: string;
  regionNameKey: string | undefined;
  /** The rebel base is here — only from `visibleRebelBaseSystemId` (the server shows it). */
  isBase: boolean;
}

/** The hidden rebel-base zone: deliberately no system, region or base fields (§3.5 (c)). */
export interface ZoneManifestVm extends ManifestVmBase {
  target: { kind: 'zone' };
  state: 'restricted';
}

export type ManifestVm = SystemManifestVm | ZoneManifestVm;

const SIDES: readonly FactionId[] = ['empire', 'rebels'];

function selectedOf(groups: readonly ForceGroup[], ref: ManifestGroupRef | null) {
  if (ref === null) return null;
  const hit = groups.some(
    (g) => g.owner === ref.owner && (ref.arena === 'all' || g.arena === ref.arena),
  );
  return hit ? { owner: ref.owner, arena: ref.arena } : null;
}

/** Narrows a model to a system manifest. */
export function isSystemManifest(vm: ManifestVm): vm is SystemManifestVm {
  return vm.target.kind === 'system';
}

/** Is `group` the highlighted one of the model? */
export function isGroupSelected(vm: ManifestVm, group: ForceGroup): boolean {
  const ref = vm.selectedGroup;
  return (
    ref !== null && ref.owner === group.owner && (ref.arena === 'all' || ref.arena === group.arena)
  );
}

function stateOf(groups: readonly ForceGroup[], leaders: readonly ForceLeader[]): ManifestState {
  if (groups.length === 0) return leaders.length === 0 ? 'empty' : 'leader';
  const owners = new Set(groups.map((g) => g.owner));
  if (owners.size > 1) return 'both';
  const arenas = new Set(groups.map((g) => g.arena));
  return arenas.size > 1 ? 'fleetGround' : 'fleet';
}

function base(
  groups: ForceGroup[],
  leaders: ForceLeader[],
  ref: ManifestGroupRef | null,
): Omit<ManifestVmBase, 'state'> {
  const factions = SIDES.filter(
    (s) => groups.some((g) => g.owner === s) || leaders.some((l) => l.owner === s),
  );
  const arenas = (['space', 'ground'] as const).filter((a) => groups.some((g) => g.arena === a));
  return {
    factions,
    groups,
    leaders,
    arenas,
    total: groups.reduce((n, g) => n + g.count, 0),
    selectedGroup: selectedOf(groups, ref),
  };
}

/**
 * The manifest of `target` in `view`, or `null` when the target does not exist (system not on the map / the base
 * is not hidden from the viewer).
 */
export function manifestModel(
  view: PlayerViewCore,
  target: ManifestTarget,
  group: ManifestGroupRef | null = null,
): ManifestVm | null {
  if (target.kind === 'zone') {
    const set = zoneForces(view);
    if (set === null) return null;
    return {
      target: { kind: 'zone' },
      state: 'restricted',
      ...base(
        set.groups.map((g) => ({ ...g, unitIds: [...g.unitIds], types: [...g.types] })),
        [...set.leaders],
        group,
      ),
    };
  }
  const system = systemById(view, target.systemId);
  if (!system) return null;
  const set = forcesBySystem(view).get(system.id) ?? { groups: [], leaders: [] };
  const region = view.map.regions.find((r) => r.id === system.regionId);
  return {
    target: { kind: 'system', systemId: system.id },
    state: stateOf(set.groups, set.leaders),
    systemNameKey: system.nameKey,
    regionId: system.regionId,
    regionNameKey: region?.nameKey,
    isBase: visibleRebelBaseSystemId(view) === system.id,
    ...base(set.groups, set.leaders, group),
  };
}

/** Convenience: the model of a stored request. */
export function manifestOf(view: PlayerViewCore, request: ManifestRequest): ManifestVm | null {
  return manifestModel(view, request.target, request.group);
}

/** Does the manifest request point at the current selection (system id / the zone)? */
export function requestMatchesSelection(
  request: ManifestRequest | null,
  selection: { kind: string; systemId?: string },
): request is ManifestRequest {
  if (request === null) return false;
  if (request.target.kind === 'zone') return selection.kind === 'zone';
  return selection.kind === 'system' && selection.systemId === request.target.systemId;
}

/** Stable testid suffix of a group: `<side>-<arena>`. */
export function groupKey(group: Pick<ForceGroup, 'owner' | 'arena'>): string {
  return `${group.owner}-${group.arena}`;
}

/** `map-marker-<systemId>-<side>-<arena>` / `map-marker-zone-<side>-<arena>` (plan §5.4). */
export function markerTestId(
  target: ManifestTarget,
  group: Pick<ForceGroup, 'owner' | 'arena'>,
): string {
  const place = target.kind === 'zone' ? 'zone' : target.systemId;
  return `map-marker-${place}-${groupKey(group)}`;
}
