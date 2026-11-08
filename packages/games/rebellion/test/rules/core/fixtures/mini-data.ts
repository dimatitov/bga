/**
 * Synthetic `CoreData` for the `core-v1` rules tests (SWR-005 W3). NOT base-game facts and independent of
 * the real data in `src/scenario` (W2): the numbers mirror the catalogue shapes the rules care about
 * (capacities 6/4/8/2/4, transport needs, immobile structures, a leader without tactic values).
 *
 * Map (8 systems, 4 regions; `epsilon`, `eta` remote):
 *
 *   alpha ── beta ── epsilon
 *     │       │         │
 *   gamma ── delta ── zeta ── eta ── theta
 *
 * Imperial start units in `alpha` and `gamma` → `alpha`, `beta`, `gamma`, `delta` are not eligible;
 * `theta` is listed as ineligible → eligible base systems: `epsilon`, `eta`, `zeta`.
 */
import type { CoreData, UnitType } from '../../../../src/schema';

export const T = {
  // Empire
  SD: 'unit.empire.star-destroyer',
  AC: 'unit.empire.assault-carrier',
  DS: 'unit.empire.death-star',
  DSUC: 'unit.empire.death-star-under-construction',
  TIE: 'unit.empire.tie-fighter',
  ST: 'unit.empire.stormtrooper',
  ATAT: 'unit.empire.at-at',
  // Rebels
  CC: 'unit.rebels.corellian-corvette',
  TR: 'unit.rebels.transport',
  XW: 'unit.rebels.x-wing',
  YW: 'unit.rebels.y-wing',
  RT: 'unit.rebels.rebel-trooper',
  AS: 'unit.rebels.airspeeder',
  SG: 'unit.rebels.shield-generator',
} as const;
export type TypeKey = (typeof T)[keyof typeof T];

function ship(typeKey: string, capacity: number): UnitType {
  return {
    typeKey,
    owner: typeKey.startsWith('unit.empire.') ? 'empire' : 'rebels',
    arena: 'space',
    mobility: 'mobile',
    transportCapacity: capacity,
    requiresTransport: false,
  };
}
function carried(typeKey: string, arena: 'space' | 'ground'): UnitType {
  return {
    typeKey,
    owner: typeKey.startsWith('unit.empire.') ? 'empire' : 'rebels',
    arena,
    mobility: 'mobile',
    transportCapacity: 0,
    requiresTransport: true,
  };
}
function structure(typeKey: string, arena: 'space' | 'ground'): UnitType {
  return {
    typeKey,
    owner: typeKey.startsWith('unit.empire.') ? 'empire' : 'rebels',
    arena,
    mobility: 'immobile',
    transportCapacity: 0,
    requiresTransport: false,
  };
}

export const SYSTEM_IDS = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
] as const;
export const ELIGIBLE_BASES = ['epsilon', 'eta', 'zeta'] as const;
export const EMPIRE_LEADERS = ['palpatine', 'vader', 'tarkin', 'tagge'] as const;
export const REBEL_LEADERS = ['mothma', 'leia', 'dodonna', 'rieekan'] as const;

export function miniData(): CoreData {
  return {
    id: 'mini-core-v1',
    regions: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }],
    systems: [
      { id: 'alpha', regionId: 'r1', adjacentSystemIds: ['beta', 'gamma'], remote: false },
      {
        id: 'beta',
        regionId: 'r1',
        adjacentSystemIds: ['alpha', 'delta', 'epsilon'],
        remote: false,
      },
      { id: 'gamma', regionId: 'r2', adjacentSystemIds: ['alpha', 'delta'], remote: false },
      { id: 'delta', regionId: 'r2', adjacentSystemIds: ['beta', 'gamma', 'zeta'], remote: false },
      { id: 'epsilon', regionId: 'r3', adjacentSystemIds: ['beta', 'zeta'], remote: true },
      { id: 'zeta', regionId: 'r3', adjacentSystemIds: ['delta', 'epsilon', 'eta'], remote: false },
      { id: 'eta', regionId: 'r4', adjacentSystemIds: ['zeta', 'theta'], remote: true },
      { id: 'theta', regionId: 'r4', adjacentSystemIds: ['eta'], remote: false },
    ],
    unitTypes: [
      ship(T.SD, 6),
      ship(T.AC, 4),
      ship(T.DS, 8),
      structure(T.DSUC, 'space'),
      carried(T.TIE, 'space'),
      carried(T.ST, 'ground'),
      carried(T.ATAT, 'ground'),
      ship(T.CC, 2),
      ship(T.TR, 4),
      ship(T.XW, 0),
      ship(T.YW, 0),
      carried(T.RT, 'ground'),
      carried(T.AS, 'ground'),
      structure(T.SG, 'ground'),
    ],
    leaders: [
      { id: 'palpatine', owner: 'empire', canActivate: true },
      { id: 'vader', owner: 'empire', canActivate: true },
      { id: 'tarkin', owner: 'empire', canActivate: true },
      { id: 'tagge', owner: 'empire', canActivate: true },
      { id: 'mothma', owner: 'rebels', canActivate: false },
      { id: 'leia', owner: 'rebels', canActivate: true },
      { id: 'dodonna', owner: 'rebels', canActivate: true },
      { id: 'rieekan', owner: 'rebels', canActivate: true },
      // A recruitable leader: in the catalogue, never in a game (D-7).
      { id: 'ackbar', owner: 'rebels', canActivate: true },
    ],
    startSetup: {
      startingTime: 1,
      startingReputation: 14,
      units: [
        { typeKey: T.SD, at: { kind: 'system', systemId: 'alpha' } },
        { typeKey: T.TIE, at: { kind: 'system', systemId: 'alpha' } },
        { typeKey: T.TIE, at: { kind: 'system', systemId: 'alpha' } },
        { typeKey: T.ST, at: { kind: 'system', systemId: 'alpha' } },
        { typeKey: T.ST, at: { kind: 'system', systemId: 'alpha' } },
        { typeKey: T.AC, at: { kind: 'system', systemId: 'gamma' } },
        { typeKey: T.ST, at: { kind: 'system', systemId: 'gamma' } },
        { typeKey: T.ATAT, at: { kind: 'system', systemId: 'gamma' } },
        { typeKey: T.CC, at: { kind: 'system', systemId: 'theta' } },
        { typeKey: T.TR, at: { kind: 'system', systemId: 'theta' } },
        { typeKey: T.XW, at: { kind: 'system', systemId: 'theta' } },
        { typeKey: T.RT, at: { kind: 'system', systemId: 'theta' } },
        { typeKey: T.RT, at: { kind: 'system', systemId: 'theta' } },
        { typeKey: T.XW, at: { kind: 'rebelBase' } },
        { typeKey: T.RT, at: { kind: 'rebelBase' } },
        { typeKey: T.AS, at: { kind: 'rebelBase' } },
        { typeKey: T.SG, at: { kind: 'rebelBase' } },
      ],
      leaders: [...EMPIRE_LEADERS, ...REBEL_LEADERS],
      baseIneligibleSystemIds: ['theta'],
    },
  };
}
