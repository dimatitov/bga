/**
 * Component catalogue for `core-v1`: unit types (both sides) and the starting leaders.
 * Source: `docs/game-rules/rebellion-reference.md`
 * - units — §2 (all 18 types incl. the Super Star Destroyer; arena by resource icon colour; transport capacity;
 *   the transport restriction of ground units and TIE Fighters; structures and DSUC are immobile).
 *   Imperial values: confidence high (faction sheet). Rebel capacities (Corvette 2, Transport 4, Mon Cal 4):
 *   // confidence: medium (reference §2, fan source GH-API; open question §8.3)
 * - leaders — §3 (starting leaders of both sides: confidence high). `canActivate: false` = no tactic values:
 *   of the starting leaders only Mon Mothma. // confidence: medium (reference §3, GH-API)
 * Attack/health are not used by the core-v1 slice and are not stored (spec Data clarifications Q-21).
 */
import {
  CORE_LEADER_IDS,
  CORE_UNIT_TYPE_KEYS,
  type CoreLeaderId,
  type CoreUnitTypeKey,
  type Faction,
  type LeaderData,
  type UnitArena,
  type UnitMobility,
  type UnitType,
} from '../../schema';

interface UnitTypeEntry {
  readonly arena: UnitArena;
  readonly mobility: UnitMobility;
  readonly transportCapacity: number;
  readonly requiresTransport: boolean;
}

const ship = (transportCapacity: number): UnitTypeEntry => ({
  arena: 'space',
  mobility: 'mobile',
  transportCapacity,
  requiresTransport: false,
});
/** TIE Fighter: a ship with the transport restriction icon (uses 1 capacity, reference §2). */
const restrictedFighter: UnitTypeEntry = {
  arena: 'space',
  mobility: 'mobile',
  transportCapacity: 0,
  requiresTransport: true,
};
const groundUnit: UnitTypeEntry = {
  arena: 'ground',
  mobility: 'mobile',
  transportCapacity: 0,
  requiresTransport: true,
};
const structure: UnitTypeEntry = {
  arena: 'ground',
  mobility: 'immobile',
  transportCapacity: 0,
  requiresTransport: false,
};

/** `Record` over all type keys: a missing or unknown type is a tsc error. */
const UNIT_TYPES: Readonly<Record<CoreUnitTypeKey, UnitTypeEntry>> = {
  'unit.empire.star-destroyer': ship(6),
  'unit.empire.assault-carrier': ship(4),
  'unit.empire.super-star-destroyer': ship(8),
  'unit.empire.death-star': ship(8),
  'unit.empire.death-star-under-construction': {
    arena: 'space',
    mobility: 'immobile',
    transportCapacity: 0,
    requiresTransport: false,
  },
  'unit.empire.tie-fighter': restrictedFighter,
  'unit.empire.stormtrooper': groundUnit,
  'unit.empire.at-st': groundUnit,
  'unit.empire.at-at': groundUnit,
  'unit.rebels.corellian-corvette': ship(2),
  'unit.rebels.rebel-transport': ship(4),
  'unit.rebels.mon-calamari-cruiser': ship(4),
  'unit.rebels.x-wing': ship(0),
  'unit.rebels.y-wing': ship(0),
  'unit.rebels.rebel-trooper': groundUnit,
  'unit.rebels.airspeeder': groundUnit,
  'unit.rebels.shield-generator': structure,
  'unit.rebels.ion-cannon': structure,
};

function ownerOf(typeKey: CoreUnitTypeKey): Faction {
  return typeKey.startsWith('unit.empire.') ? 'empire' : 'rebels';
}

/** In `CORE_UNIT_TYPE_KEYS` order. */
export const coreUnitTypes: UnitType[] = CORE_UNIT_TYPE_KEYS.map((typeKey) => ({
  typeKey,
  owner: ownerOf(typeKey),
  ...UNIT_TYPES[typeKey],
}));

const LEADERS: Readonly<Record<CoreLeaderId, Omit<LeaderData, 'id'>>> = {
  palpatine: { owner: 'empire', canActivate: true },
  vader: { owner: 'empire', canActivate: true },
  tarkin: { owner: 'empire', canActivate: true },
  tagge: { owner: 'empire', canActivate: true },
  'mon-mothma': { owner: 'rebels', canActivate: false },
  leia: { owner: 'rebels', canActivate: true },
  dodonna: { owner: 'rebels', canActivate: true },
  rieekan: { owner: 'rebels', canActivate: true },
};

/** In `CORE_LEADER_IDS` order. */
export const coreLeaders: LeaderData[] = CORE_LEADER_IDS.map((id) => ({ id, ...LEADERS[id] }));
