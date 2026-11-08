/**
 * Types of the static base-game data used by the `core-v1` engine (SWR-005, plan-backend §1.1 / BD-2 / BD-3).
 * Only SCHEMAS live here (web-reachable `./schema`); the data itself is server-only (`./scenario`, W2) and
 * cites `docs/game-rules/rebellion-reference.md`. Nothing here is secret: the rebel base location is never
 * part of the static data — it is chosen when a game is created and lives only in the state.
 *
 * `CoreDataSchema` checks integrity generically (unique ids, existing references, symmetric adjacency, …);
 * the concrete numbers (32 systems, 8 regions) are checked by the data test, not by the schema (AC-01).
 */
import { z } from 'zod';
import { FactionSchema, UnitArenaSchema, UnitMobilitySchema, type Faction } from './enums';

const IdSchema = z.string().min(1);

/** A region of the board (`r1`…`r8`; i18n `regions.<id>`; no official names, reference §1.2). */
export const RegionDataSchema = z.strictObject({
  id: IdSchema,
});
export type RegionData = z.infer<typeof RegionDataSchema>;

/** A system (i18n `systems.<id>`); `remote` = no resources/loyalty (reference §1.1; display only in core-v1, Q-33). */
export const SystemDataSchema = z.strictObject({
  id: IdSchema,
  regionId: IdSchema,
  adjacentSystemIds: z.array(IdSchema),
  remote: z.boolean(),
});
export type SystemData = z.infer<typeof SystemDataSchema>;

/**
 * A unit type of the component catalogue (reference §2; i18n `pieceTypes.<typeKey>`, `typeKey = unit.<owner>.<slug>`).
 * - `transportCapacity` — places for units that `requiresTransport` (ground units and TIE fighters, 1 place each);
 * - `requiresTransport` — moves only together with ships of enough capacity from the same system (R-5);
 * - `mobility: 'immobile'` — never moves (structures, Death Star under construction).
 * Whether a type reveals the rebel base is DERIVED, not stored (R-8, Q-BE-4): `unitTypeRevealsRebelBase`.
 */
export const UnitTypeSchema = z.strictObject({
  typeKey: z.string().regex(/^unit\.(rebels|empire)\.[a-z0-9-]+$/),
  owner: FactionSchema,
  arena: UnitArenaSchema,
  mobility: UnitMobilitySchema,
  transportCapacity: z.int().nonnegative(),
  requiresTransport: z.boolean(),
});
export type UnitType = z.infer<typeof UnitTypeSchema>;

/**
 * R-8 (Data clarifications Q-BE-4): only Imperial GROUND units reveal the rebel base (ships, the Death Star
 * and leaders never do). Derived from the type instead of a stored flag, so data cannot contradict the rule.
 */
export function unitTypeRevealsRebelBase(type: Pick<UnitType, 'owner' | 'arena'>): boolean {
  return type.owner === 'empire' && type.arena === 'ground';
}

/**
 * A leader (i18n `leaders.<id>`). `canActivate: false` = no tactic values, cannot activate a system
 * (R-4; of the starting leaders only Mon Mothma, reference §3).
 */
export const LeaderDataSchema = z.strictObject({
  id: IdSchema,
  owner: FactionSchema,
  canActivate: z.boolean(),
});
export type LeaderData = z.infer<typeof LeaderDataSchema>;

/** Where a starting unit stands: a system, or the Rebel base (resolved to the base system at creation, D-6). */
export const StartPlacementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('system'), systemId: IdSchema }),
  z.strictObject({ kind: z.literal('rebelBase') }),
]);
export type StartPlacement = z.infer<typeof StartPlacementSchema>;

/**
 * Fixed starting position (R-10, D-5: first-game setup, reference §4.2).
 * - `startingTime` / `startingReputation` — time and reputation markers (R-1: 1 and 14);
 * - `units` — in data order; unit ids `u-01…` follow this order and never depend on the base (plan-backend §2);
 * - `leaders` — the starting leader pools of both sides (D-7);
 * - `baseIneligibleSystemIds` — systems that can never hold the base by the first-game rule (Coruscant and
 *   the systems whose probe cards are removed). The eligible systems are DERIVED (`eligibleRebelBaseSystemIds`):
 *   additionally no system with, or adjacent to, a starting Imperial unit, and no system with a starting Rebel
 *   unit placed in it (R-10; SWR-005 CODE_REVIEW #1).
 */
export const StartSetupSchema = z.strictObject({
  startingTime: z.int().positive(),
  startingReputation: z.int().positive(),
  units: z.array(z.strictObject({ typeKey: z.string().min(1), at: StartPlacementSchema })),
  leaders: z.array(IdSchema),
  baseIneligibleSystemIds: z.array(IdSchema),
});
export type StartSetup = z.infer<typeof StartSetupSchema>;

const CoreDataObjectSchema = z.strictObject({
  /** Data set id (`rebellion-base-v1`), stored in the state as `scenarioId`. */
  id: IdSchema,
  regions: z.array(RegionDataSchema),
  systems: z.array(SystemDataSchema),
  unitTypes: z.array(UnitTypeSchema),
  leaders: z.array(LeaderDataSchema),
  startSetup: StartSetupSchema,
});
type CoreDataObject = z.infer<typeof CoreDataObjectSchema>;

/**
 * Systems that may hold the rebel base (R-10): not listed in `baseIneligibleSystemIds`, no starting Imperial
 * unit in it and none in an adjacent system, and no starting Rebel unit placed in it (`kind: 'system'`).
 * The last rule follows from D-6 (every Rebel unit in the base system is moved to the hidden zone): public
 * starting Rebel units "vanishing" from a system on the Empire's first screen would reveal the base
 * (SWR-005 CODE_REVIEW #1). Sorted by id (deterministic input of the base choice).
 * Pure; unknown references are ignored (integrity reports them).
 */
export function eligibleRebelBaseSystemIds(data: Omit<CoreDataObject, 'id' | 'regions'>): string[] {
  const owners = new Map<string, Faction>(data.unitTypes.map((t) => [t.typeKey, t.owner]));
  const imperial = new Set<string>();
  const rebel = new Set<string>();
  for (const unit of data.startSetup.units) {
    if (unit.at.kind !== 'system') continue;
    const owner = owners.get(unit.typeKey);
    if (owner === 'empire') imperial.add(unit.at.systemId);
    if (owner === 'rebels') rebel.add(unit.at.systemId);
  }
  const ineligible = new Set(data.startSetup.baseIneligibleSystemIds);
  return data.systems
    .filter(
      (s) =>
        !ineligible.has(s.id) &&
        !imperial.has(s.id) &&
        !rebel.has(s.id) &&
        !s.adjacentSystemIds.some((id) => imperial.has(id)),
    )
    .map((s) => s.id)
    .sort();
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dup.add(v);
    seen.add(v);
  }
  return [...dup];
}

function checkIntegrity(data: CoreDataObject, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  for (const [key, ids] of [
    ['regions', data.regions.map((r) => r.id)],
    ['systems', data.systems.map((s) => s.id)],
    ['unitTypes', data.unitTypes.map((t) => t.typeKey)],
    ['leaders', data.leaders.map((l) => l.id)],
  ] as const) {
    for (const id of duplicates(ids)) issue([key], `duplicate id ${id}`);
  }

  const regionIds = new Set(data.regions.map((r) => r.id));
  const systems = new Map(data.systems.map((s) => [s.id, s]));
  data.systems.forEach((s, i) => {
    if (!regionIds.has(s.regionId))
      issue(['systems', i, 'regionId'], `unknown region ${s.regionId}`);
    for (const id of duplicates(s.adjacentSystemIds)) {
      issue(['systems', i, 'adjacentSystemIds'], `duplicate neighbour ${id}`);
    }
    for (const id of s.adjacentSystemIds) {
      const other = systems.get(id);
      if (id === s.id) issue(['systems', i, 'adjacentSystemIds'], `${s.id} is adjacent to itself`);
      else if (!other) issue(['systems', i, 'adjacentSystemIds'], `unknown system ${id}`);
      else if (!other.adjacentSystemIds.includes(s.id)) {
        issue(['systems', i, 'adjacentSystemIds'], `asymmetric adjacency ${s.id} → ${id}`);
      }
    }
  });

  const types = new Map(data.unitTypes.map((t) => [t.typeKey, t]));
  data.unitTypes.forEach((t, i) => {
    if (!t.typeKey.startsWith(`unit.${t.owner}.`)) {
      issue(['unitTypes', i, 'typeKey'], `typeKey prefix does not match owner ${t.owner}`);
    }
    if (t.requiresTransport && t.transportCapacity > 0) {
      issue(['unitTypes', i], 'a unit that requires transport cannot carry others');
    }
    if (t.mobility === 'immobile' && (t.requiresTransport || t.transportCapacity > 0)) {
      issue(['unitTypes', i], 'an immobile unit neither carries nor requires transport');
    }
    if (t.arena === 'ground' && t.mobility === 'mobile' && !t.requiresTransport) {
      issue(['unitTypes', i, 'requiresTransport'], 'a mobile ground unit requires transport (R-5)');
    }
  });

  const setup = data.startSetup;
  if (setup.startingTime >= setup.startingReputation) {
    issue(['startSetup', 'startingTime'], 'startingTime must be below startingReputation');
  }
  setup.units.forEach((u, i) => {
    const type = types.get(u.typeKey);
    if (!type) issue(['startSetup', 'units', i, 'typeKey'], `unknown unit type ${u.typeKey}`);
    if (u.at.kind === 'system' && !systems.has(u.at.systemId)) {
      issue(['startSetup', 'units', i, 'at'], `unknown system ${u.at.systemId}`);
    }
    if (u.at.kind === 'rebelBase' && type && type.owner !== 'rebels') {
      issue(['startSetup', 'units', i, 'at'], 'only Rebel units start on the Rebel base');
    }
  });
  const leaderIds = new Set(data.leaders.map((l) => l.id));
  for (const id of duplicates(setup.leaders)) issue(['startSetup', 'leaders'], `duplicate ${id}`);
  setup.leaders.forEach((id, i) => {
    if (!leaderIds.has(id)) issue(['startSetup', 'leaders', i], `unknown leader ${id}`);
  });
  for (const id of duplicates(setup.baseIneligibleSystemIds)) {
    issue(['startSetup', 'baseIneligibleSystemIds'], `duplicate ${id}`);
  }
  setup.baseIneligibleSystemIds.forEach((id, i) => {
    if (!systems.has(id))
      issue(['startSetup', 'baseIneligibleSystemIds', i], `unknown system ${id}`);
  });
  if (eligibleRebelBaseSystemIds(data).length === 0) {
    issue(['startSetup'], 'no system is eligible for the rebel base (R-10)');
  }
}

/** The whole static data set of the base game (fail-fast `parse` when the server loads it). */
export const CoreDataSchema = CoreDataObjectSchema.superRefine(checkIntegrity);
export type CoreData = z.infer<typeof CoreDataSchema>;
