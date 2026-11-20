/**
 * Index of one `CorePlayerView` for the bot (SWR-006 plan-backend §4.3). Everything is derived from the view
 * (the bot has no memory): unit types, own / visible enemy forces per system, adjacency and BFS distances,
 * leaders, the current activation and how many own moves it already had (from `view.log`).
 * Hidden enemy pieces (the `rebelBase` zone of the Empire's view) are only counted, never placed.
 */
import {
  opponentOf,
  type CoreLeaderView,
  type CorePlayerView,
  type CoreUnitView,
  type Faction,
  type UnitType,
} from '../schema';

/** Forces of one side in one system. */
export interface ForceSummary {
  /** All units (mobile and immobile). */
  readonly units: number;
  /** `arena: 'ground'` units (structures included). */
  readonly ground: number;
  /** `arena: 'space'` units. */
  readonly ships: number;
  /** Σ transport capacity of mobile ships that do not require transport. */
  readonly capacity: number;
  /** Mobile ground units (they all require transport). */
  readonly mobileGround: number;
}

/** The viewer's own running activation (`null` when none or when it belongs to the opponent). */
export interface OwnActivation {
  readonly leaderId: string;
  readonly systemId: string;
  /** Own `PIECES_MOVED` since the own `SYSTEM_ACTIVATED` that started it. */
  readonly moves: number;
}

export interface ViewModel {
  readonly view: CorePlayerView;
  readonly viewer: Faction;
  readonly opponent: Faction;
  /** Map order. */
  readonly systemIds: readonly string[];
  readonly systemIndex: ReadonlyMap<string, number>;
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
  readonly unitTypes: ReadonlyMap<string, UnitType>;
  typeOf(typeKey: string): UnitType | undefined;
  /** Own units per system (only `location.kind === 'system'`; map order of insertion = units order). */
  readonly ownUnitsBySystem: ReadonlyMap<string, readonly CoreUnitView[]>;
  /** Visible enemy units per system. */
  readonly enemyUnitsBySystem: ReadonlyMap<string, readonly CoreUnitView[]>;
  forcesOf(side: 'own' | 'enemy', systemId: string): ForceSummary;
  /** Enemy units in the hidden zone (`rebelBase` location). */
  readonly hiddenEnemyUnits: number;
  /** Enemy leaders in the hidden zone. */
  readonly hiddenEnemyLeaders: number;
  /** Own leaders in the pool that can activate (pool order = `view.leaders` order). */
  readonly ownPoolLeaders: readonly CoreLeaderView[];
  /** Own leaders on the map with their system. */
  readonly ownMapLeaders: readonly { leader: CoreLeaderView; systemId: string }[];
  /** Systems with an own leader (their units are pinned until the refresh). */
  readonly pinnedSystems: ReadonlySet<string>;
  readonly activation: OwnActivation | null;
  /** Own `SYSTEM_ACTIVATED` in the current command phase (since the last `PHASE_STARTED{command}`). */
  readonly activationsThisRound: number;
  /** BFS distance (number of jumps) between two systems; `Infinity` when unreachable / unknown. */
  distance(from: string, to: string): number;
  /** Own mobile ground units that can be brought into `systemId` by one move from each adjacent source. */
  deliverableGround(systemId: string): number;
  /** Own mobile ground units already in `systemId`. */
  ownGroundIn(systemId: string): number;
}

const EMPTY: ForceSummary = { units: 0, ground: 0, ships: 0, capacity: 0, mobileGround: 0 };

function summarize(units: readonly CoreUnitView[], types: ReadonlyMap<string, UnitType>) {
  let ground = 0;
  let ships = 0;
  let capacity = 0;
  let mobileGround = 0;
  for (const unit of units) {
    const type = types.get(unit.typeKey);
    if (!type) continue;
    if (type.arena === 'ground') ground += 1;
    else ships += 1;
    if (type.mobility === 'mobile') {
      if (type.requiresTransport) {
        if (type.arena === 'ground') mobileGround += 1;
      } else {
        capacity += type.transportCapacity;
      }
    }
  }
  return { units: units.length, ground, ships, capacity, mobileGround };
}

function groupBySystem(units: readonly CoreUnitView[]): Map<string, CoreUnitView[]> {
  const out = new Map<string, CoreUnitView[]>();
  for (const unit of units) {
    if (unit.location.kind !== 'system') continue;
    const list = out.get(unit.location.systemId);
    if (list) list.push(unit);
    else out.set(unit.location.systemId, [unit]);
  }
  return out;
}

function countOwnActivityInLog(view: CorePlayerView): { moves: number; activations: number } {
  let moves = 0;
  let activations = 0;
  for (const event of view.log) {
    if (event.type === 'PHASE_STARTED' && event.payload.phase === 'command') activations = 0;
    if (event.actor !== view.viewer) continue;
    if (event.type === 'SYSTEM_ACTIVATED') {
      activations += 1;
      moves = 0;
    } else if (event.type === 'PIECES_MOVED') {
      moves += 1;
    }
  }
  return { moves, activations };
}

export function buildViewModel(view: CorePlayerView): ViewModel {
  const viewer = view.viewer;
  const opponent = opponentOf(viewer);
  const systemIds = view.map.systems.map((s) => s.id);
  const systemIndex = new Map(systemIds.map((id, i) => [id, i]));
  const adjacency = new Map(view.map.systems.map((s) => [s.id, [...s.adjacentSystemIds]]));
  const unitTypes = new Map(view.unitTypes.map((t) => [t.typeKey, t]));

  const own = view.units.filter((u) => u.owner === viewer);
  const enemy = view.units.filter((u) => u.owner !== viewer);
  const ownUnitsBySystem = groupBySystem(own);
  const enemyUnitsBySystem = groupBySystem(enemy);
  const summaries = {
    own: new Map<string, ForceSummary>(),
    enemy: new Map<string, ForceSummary>(),
  };
  for (const [systemId, units] of ownUnitsBySystem)
    summaries.own.set(systemId, summarize(units, unitTypes));
  for (const [systemId, units] of enemyUnitsBySystem)
    summaries.enemy.set(systemId, summarize(units, unitTypes));

  const ownLeaders = view.leaders.filter((l) => l.owner === viewer);
  const ownPoolLeaders = ownLeaders.filter((l) => l.location.kind === 'pool' && l.canActivate);
  const ownMapLeaders: { leader: CoreLeaderView; systemId: string }[] = [];
  for (const leader of ownLeaders) {
    if (leader.location.kind === 'system')
      ownMapLeaders.push({ leader, systemId: leader.location.systemId });
  }
  const pinnedSystems = new Set(ownMapLeaders.map((l) => l.systemId));

  const counts = countOwnActivityInLog(view);
  const activation =
    view.activation !== null &&
    view.activation.side === viewer &&
    view.activation.location.kind === 'system'
      ? {
          leaderId: view.activation.leaderId,
          systemId: view.activation.location.systemId,
          moves: counts.moves,
        }
      : null;

  const bfsCache = new Map<string, Map<string, number>>();
  const bfs = (from: string): Map<string, number> => {
    const cached = bfsCache.get(from);
    if (cached) return cached;
    const dist = new Map<string, number>([[from, 0]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i] as string;
      const d = dist.get(current) ?? 0;
      for (const next of adjacency.get(current) ?? []) {
        if (dist.has(next)) continue;
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
    bfsCache.set(from, dist);
    return dist;
  };

  const ownGroundIn = (systemId: string) => (summaries.own.get(systemId) ?? EMPTY).mobileGround;

  return {
    view,
    viewer,
    opponent,
    systemIds,
    systemIndex,
    adjacency,
    unitTypes,
    typeOf: (typeKey) => unitTypes.get(typeKey),
    ownUnitsBySystem,
    enemyUnitsBySystem,
    forcesOf: (side, systemId) => summaries[side].get(systemId) ?? EMPTY,
    hiddenEnemyUnits: enemy.filter((u) => u.location.kind === 'rebelBase').length,
    hiddenEnemyLeaders: view.leaders.filter(
      (l) => l.owner !== viewer && l.location.kind === 'rebelBase',
    ).length,
    ownPoolLeaders,
    ownMapLeaders,
    pinnedSystems,
    activation,
    activationsThisRound: counts.activations,
    distance: (from, to) => {
      if (!systemIndex.has(from) || !systemIndex.has(to)) return Infinity;
      return bfs(from).get(to) ?? Infinity;
    },
    deliverableGround: (systemId) => {
      let total = 0;
      for (const source of adjacency.get(systemId) ?? []) {
        if (pinnedSystems.has(source)) continue;
        const forces = summaries.own.get(source);
        if (!forces) continue;
        total += Math.min(forces.mobileGround, forces.capacity);
      }
      return total;
    },
    ownGroundIn,
  };
}
