/**
 * The ONLY adapter between the `core-v1` wire view (`PlayerViewCore`, frozen schema `@bga/game-rebellion/schema`,
 * plan-backend §8.2 + spec rev. 2) and the `core-v1` table (SWR-005 plan-frontend §3.3). Pure functions, no React.
 *
 * Invariants (plan-frontend §0):
 * - nothing here evaluates game rules: what can be activated / moved / passed comes from `view.legalActions`,
 *   everything else is read from explicit view fields (`activation`, `passed`, `outcome`, `contestedSystemIds`,
 *   `map.systems[].remote`, `location`);
 * - the hidden rebel-base zone is exactly what the server sent (`location.kind === 'rebelBase'`,
 *   `rebelBase.systemId === null`); the UI never looks for the base system.
 * If the wire changes, only this file and its test change — components read the view only through it.
 */
import type {
  CoreLeaderView,
  CoreLegalAction,
  CoreSystemView,
  CoreUnitView,
  FactionId,
  OutcomeReason,
  PlayerViewCore,
  UnitType,
  ViewLocation,
} from '@bga/game-rebellion/schema';

type View = PlayerViewCore;
type ActionOf<T extends CoreLegalAction['type']> = Extract<CoreLegalAction, { type: T }>;

/** One `MOVE_PIECES` legal action: a source system adjacent to the activated one and its movable own units. */
export type MoveSource = ActionOf<'MOVE_PIECES'>;
export type MoveCandidate = MoveSource['pieces'][number];

/** Where something is shown: a system id, or `null` = the hidden rebel-base zone. */
export type ShownAt = string | null;

// ---------------------------------------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------------------------------------

function actionOf<T extends CoreLegalAction['type']>(view: View, type: T): ActionOf<T> | undefined {
  return view.legalActions.find((a): a is ActionOf<T> => a.type === type);
}

function actionsOf<T extends CoreLegalAction['type']>(view: View, type: T): ActionOf<T>[] {
  return view.legalActions.filter((a): a is ActionOf<T> => a.type === type);
}

/** It is the viewer's turn and it may act (`legalActions` is `[]` otherwise: not its turn, handoff, outcome). */
export function isMyTurn(view: View): boolean {
  return view.legalActions.length > 0;
}

/** Leaders of the viewer's pool that may activate a system now (`ACTIVATE_SYSTEM.leaderIds`), in server order. */
export function activatableLeaders(view: View): string[] {
  return actionOf(view, 'ACTIVATE_SYSTEM')?.leaderIds ?? [];
}

export function canActivateLeader(view: View, leaderId: string): boolean {
  return activatableLeaders(view).includes(leaderId);
}

/** Systems `leaderId` may activate (`ACTIVATE_SYSTEM.systemIds`); `[]` when the leader is not activatable. */
export function activationTargets(view: View, leaderId: string | null): string[] {
  const action = actionOf(view, 'ACTIVATE_SYSTEM');
  if (!action || leaderId === null || !action.leaderIds.includes(leaderId)) return [];
  return action.systemIds;
}

/** Whether `ACTIVATE_SYSTEM { leaderId, systemId }` is listed by the server. */
export function canActivate(view: View, leaderId: string | null, systemId: string): boolean {
  return activationTargets(view, leaderId).includes(systemId);
}

/** `MOVE_PIECES` sources of the viewer's activation, in server order (`[]` outside an own activation). */
export function moveSources(view: View): MoveSource[] {
  return actionsOf(view, 'MOVE_PIECES');
}

export function moveSourceFrom(view: View, fromSystemId: string): MoveSource | undefined {
  return moveSources(view).find((s) => s.fromSystemId === fromSystemId);
}

/** For drag on the map: the move a unit may take part in (`null` = the unit cannot be moved now). */
export function movableInDetail(
  view: View,
  pieceId: string,
): { fromSystemId: string; toSystemId: string; candidate: MoveCandidate } | null {
  for (const source of moveSources(view)) {
    const candidate = source.pieces.find((p) => p.pieceId === pieceId);
    if (candidate) {
      return { fromSystemId: source.fromSystemId, toSystemId: source.toSystemId, candidate };
    }
  }
  return null;
}

export function isMovable(view: View, pieceId: string): boolean {
  return movableInDetail(view, pieceId) !== null;
}

/**
 * Capacity PREVIEW for a selection of units of one source (Q-FE-2, plan-backend §8.2): sums the numbers the
 * server sent in `MOVE_PIECES.pieces`. Ids that are not candidates of `source` are ignored. The server alone
 * decides `insufficientCapacity` (422) — this is a hint, never a gate.
 */
export function capacityPreview(
  source: MoveSource,
  selectedPieceIds: readonly string[],
): { capacity: number; required: number; fits: boolean } {
  const selected = new Set(selectedPieceIds);
  let capacity = 0;
  let required = 0;
  for (const p of source.pieces) {
    if (!selected.has(p.pieceId)) continue;
    capacity += p.transportCapacity;
    if (p.requiresTransport) required += 1;
  }
  return { capacity, required, fits: required <= capacity };
}

export function canFinish(view: View): boolean {
  return actionOf(view, 'FINISH_ACTIVATION') !== undefined;
}

export function canPass(view: View): boolean {
  return actionOf(view, 'PASS') !== undefined;
}

// ---------------------------------------------------------------------------------------------------------
// Turn, phase, outcome
// ---------------------------------------------------------------------------------------------------------

export type CoreTurnState = 'over' | 'activation' | 'idle' | 'waiting';

/**
 * Coarse turn state for the turn panel (`turn-panel[data-state]` without the UI-only `armed`, plan-frontend §9):
 * `over` — `outcome` set; `activation` — the viewer may finish its own activation; `idle` — the viewer may
 * activate / pass; `waiting` — nothing to do (not its turn).
 */
export function turnState(view: View): CoreTurnState {
  if (view.outcome) return 'over';
  if (canFinish(view)) return 'activation';
  if (isMyTurn(view)) return 'idle';
  return 'waiting';
}

export function isGameOver(view: View): boolean {
  return view.outcome !== null;
}

export function outcomeOf(view: View): { winner: FactionId; reason: OutcomeReason } | null {
  return view.outcome;
}

/** R-6: whether `side` has passed for the rest of the current command phase (`view.passed`). */
export function hasPassed(view: View, side: FactionId): boolean {
  return view.passed[side];
}

export function opponentOf(side: FactionId): FactionId {
  return side === 'rebels' ? 'empire' : 'rebels';
}

/** Time / reputation markers (`round` = time, R-1). */
export function markers(view: View): { time: number; reputation: number } {
  return view.markers;
}

// ---------------------------------------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------------------------------------

/** Where a view location is shown: a system id or `null` (hidden rebel-base zone). */
export function shownAt(location: ViewLocation): ShownAt {
  return location.kind === 'system' ? location.systemId : null;
}

/** The current activation (either side). `systemId: null` = in the hidden rebel-base zone (Empire view). */
export function activationOf(
  view: View,
): { side: FactionId; leaderId: string; systemId: ShownAt } | null {
  const a = view.activation;
  return a ? { side: a.side, leaderId: a.leaderId, systemId: shownAt(a.location) } : null;
}

/** Activated system id when it is on the map; `null` when there is no activation or it is in the hidden zone. */
export function activatedSystemId(view: View): string | null {
  return activationOf(view)?.systemId ?? null;
}

/** Whether the viewer itself is in the middle of its own activation (any side may see the other's activation). */
export function isOwnActivation(view: View): boolean {
  return view.activation !== null && view.activation.side === view.viewer;
}

/** A stable key of the current activation (`null` = none): changes whenever a new activation starts. */
export function activationKey(view: View): string | null {
  const a = view.activation;
  if (!a) return null;
  return `${a.side}:${a.leaderId}:${shownAt(a.location) ?? '#rebelBase'}`;
}

// ---------------------------------------------------------------------------------------------------------
// Leaders
// ---------------------------------------------------------------------------------------------------------

/** Leaders in `side`'s pool (pools of both sides are public), in view order. */
export function poolOf(view: View, side: FactionId): CoreLeaderView[] {
  return view.leaders.filter((l) => l.owner === side && l.location.kind === 'pool');
}

/** Leaders on the map (in a system). Leaders in the hidden zone are NOT included — see `hiddenZone`. */
export function leadersOnMap(view: View): CoreLeaderView[] {
  return view.leaders.filter((l) => l.location.kind === 'system');
}

export function leadersAt(view: View, systemId: string): CoreLeaderView[] {
  return view.leaders.filter(
    (l) => l.location.kind === 'system' && l.location.systemId === systemId,
  );
}

export function leaderById(view: View, leaderId: string): CoreLeaderView | undefined {
  return view.leaders.find((l) => l.id === leaderId);
}

/** `leader-item-<id>[data-location]` (plan-frontend §9): `pool`, `rebelBase` or the system id. */
export function leaderLocationLabel(leader: CoreLeaderView): string {
  return leader.location.kind === 'system' ? leader.location.systemId : leader.location.kind;
}

// ---------------------------------------------------------------------------------------------------------
// Units and static data
// ---------------------------------------------------------------------------------------------------------

export function unitsAt(view: View, systemId: string): CoreUnitView[] {
  return view.units.filter((u) => u.location.kind === 'system' && u.location.systemId === systemId);
}

export function unitById(view: View, unitId: string): CoreUnitView | undefined {
  return view.units.find((u) => u.id === unitId);
}

/** Static type of a unit (arena / mobility / capacity) from the public `view.unitTypes`. */
export function unitTypeOf(view: View, typeKey: string): UnitType | undefined {
  return view.unitTypes.find((t) => t.typeKey === typeKey);
}

export function systemById(view: View, systemId: string): CoreSystemView | undefined {
  return view.map.systems.find((s) => s.id === systemId);
}

/** Systems grouped by region in `view.map.regions` order (Autocomplete groups, board list). */
export function systemsByRegion(
  view: View,
): Array<{ regionId: string; nameKey: string; systems: CoreSystemView[] }> {
  return view.map.regions.map((r) => ({
    regionId: r.id,
    nameKey: r.nameKey,
    systems: view.map.systems.filter((s) => s.regionId === r.id),
  }));
}

/** D-1: computed by the server after the redaction (never derived from units in the UI). */
export function contestedSystemIds(view: View): string[] {
  return view.contestedSystemIds;
}

export function isContested(view: View, systemId: string): boolean {
  return view.contestedSystemIds.includes(systemId);
}

export function remoteSystemIds(view: View): string[] {
  return view.map.systems.filter((s) => s.remote).map((s) => s.id);
}

export function isRemote(view: View, systemId: string): boolean {
  return systemById(view, systemId)?.remote === true;
}

// ---------------------------------------------------------------------------------------------------------
// Rebel base
// ---------------------------------------------------------------------------------------------------------

/**
 * The rebel-base system when the server shows it to the viewer (Rebels always; Empire after the reveal or the
 * end of the game, Q-14); `null` otherwise. Marks the system with `data-rebel-base="true"` (Q-37).
 */
export function visibleRebelBaseSystemId(view: View): string | null {
  return view.rebelBase.systemId;
}

/**
 * The hidden rebel-base zone «Rebel base — location unknown» (AM-BE-7): present exactly when the server hides the
 * base system from the viewer (`rebelBase.systemId === null`); lists what the server placed in it
 * (`location.kind === 'rebelBase'`). May be empty (all Rebel units left the base). `null` = no hidden zone.
 */
export function hiddenZone(
  view: View,
): { unitIds: string[]; leaderIds: string[]; activated: boolean } | null {
  if (view.rebelBase.systemId !== null) return null;
  return {
    unitIds: view.units.filter((u) => u.location.kind === 'rebelBase').map((u) => u.id),
    leaderIds: view.leaders.filter((l) => l.location.kind === 'rebelBase').map((l) => l.id),
    activated: view.activation?.location.kind === 'rebelBase',
  };
}
