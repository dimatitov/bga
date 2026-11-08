/**
 * Web-safe id lists of the base-game data used by the `core-v1` engine (SWR-005 W2, AM-FE-2).
 * Public facts only (board names, component catalogue, starting leaders) — nothing secret: the rebel base is
 * chosen at game creation and never part of static data. The data itself (`./scenario`, server-only) is typed
 * with these ids, so a mismatch is a tsc error (and is also checked at runtime by the data test).
 * Facts: `docs/game-rules/rebellion-reference.md` (§1.2–§1.3 systems/regions, §2 units, §3 leaders).
 * i18n keys are derived from the ids: `systems.<id>`, `regions.<id>`, `pieceTypes.<typeKey>`, `leaders.<id>`.
 */

/** 32 systems (reference §1.3), kebab-case English board names, sorted alphabetically. */
export const CORE_SYSTEM_IDS = Object.freeze([
  'alderaan',
  'bespin',
  'bothawui',
  'cato-neimoidia',
  'corellia',
  'coruscant',
  'dagobah',
  'dantooine',
  'dathomir',
  'endor',
  'felucia',
  'geonosis',
  'hoth',
  'ilum',
  'kashyyyk',
  'kessel',
  'malastare',
  'mandalore',
  'mon-calamari',
  'mustafar',
  'mygeeto',
  'naboo',
  'nal-hutta',
  'ord-mantell',
  'rodia',
  'ryloth',
  'saleucami',
  'sullust',
  'tatooine',
  'toydaria',
  'utapau',
  'yavin',
] as const);
export type CoreSystemId = (typeof CORE_SYSTEM_IDS)[number];

/** 8 regions (reference §1.2: no official names; neutral ids). */
export const CORE_REGION_IDS = Object.freeze([
  'r1',
  'r2',
  'r3',
  'r4',
  'r5',
  'r6',
  'r7',
  'r8',
] as const);
export type CoreRegionId = (typeof CORE_REGION_IDS)[number];

/** The 8 starting leaders (reference §3; recruitable leaders are out of the core-v1 slice, D-7). */
export const CORE_LEADER_IDS = Object.freeze([
  'palpatine',
  'vader',
  'tarkin',
  'tagge',
  'mon-mothma',
  'leia',
  'dodonna',
  'rieekan',
] as const);
export type CoreLeaderId = (typeof CORE_LEADER_IDS)[number];

/** All 18 unit types of the base game (reference §2), `unit.<owner>.<slug>`: 9 Imperial, then 9 Rebel. */
export const CORE_UNIT_TYPE_KEYS = Object.freeze([
  'unit.empire.star-destroyer',
  'unit.empire.assault-carrier',
  'unit.empire.super-star-destroyer',
  'unit.empire.death-star',
  'unit.empire.death-star-under-construction',
  'unit.empire.tie-fighter',
  'unit.empire.stormtrooper',
  'unit.empire.at-st',
  'unit.empire.at-at',
  'unit.rebels.corellian-corvette',
  'unit.rebels.rebel-transport',
  'unit.rebels.mon-calamari-cruiser',
  'unit.rebels.x-wing',
  'unit.rebels.y-wing',
  'unit.rebels.rebel-trooper',
  'unit.rebels.airspeeder',
  'unit.rebels.shield-generator',
  'unit.rebels.ion-cannon',
] as const);
export type CoreUnitTypeKey = (typeof CORE_UNIT_TYPE_KEYS)[number];
