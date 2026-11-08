/**
 * MOCK SCENARIO — fictional, neutral names; NOT the real Rebellion map or setup.
 * Real map, names and starting forces arrive in a later stage (rights checked).
 * Visual coordinates are NOT here — see `./layout` (separate entry point).
 */
import type { Piece, Region, Scenario, System } from '@swr/contracts';

export const MOCK_SCENARIO_ID = 'mock-scenario-v1';

const regions: Region[] = [
  { id: 'reg-inner', nameKey: 'regions.reg-inner' },
  { id: 'reg-mid', nameKey: 'regions.reg-mid' },
  { id: 'reg-outer', nameKey: 'regions.reg-outer' },
];

function system(id: string, regionId: string, adjacentSystemIds: string[]): System {
  return { id, nameKey: `systems.${id}`, regionId, adjacentSystemIds };
}

const systems: System[] = [
  system('sys-aurelis', 'reg-inner', ['sys-brevora', 'sys-cindral']),
  system('sys-brevora', 'reg-inner', ['sys-aurelis', 'sys-cindral', 'sys-dovmaren', 'sys-fennix']),
  system('sys-cindral', 'reg-inner', ['sys-aurelis', 'sys-brevora', 'sys-eskara']),
  system('sys-dovmaren', 'reg-mid', ['sys-brevora', 'sys-eskara', 'sys-fennix', 'sys-galdor']),
  system('sys-eskara', 'reg-mid', ['sys-cindral', 'sys-dovmaren', 'sys-hollin']),
  system('sys-fennix', 'reg-mid', ['sys-brevora', 'sys-dovmaren', 'sys-iskra']),
  system('sys-galdor', 'reg-outer', ['sys-dovmaren', 'sys-iskra', 'sys-hollin', 'sys-jorvan']),
  system('sys-hollin', 'reg-outer', ['sys-eskara', 'sys-galdor', 'sys-jorvan']),
  system('sys-iskra', 'reg-outer', ['sys-fennix', 'sys-galdor', 'sys-jorvan']),
  system('sys-jorvan', 'reg-outer', ['sys-galdor', 'sys-hollin', 'sys-iskra']),
];

/** Piece ids are opaque (`pc-NN`) and never encode the type (a hidden piece's id must not leak its typeKey). */
const pieces: Piece[] = [
  {
    id: 'pc-01',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.capital-ship',
    systemId: 'sys-aurelis',
  },
  {
    id: 'pc-02',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.capital-ship',
    systemId: 'sys-aurelis',
  },
  {
    id: 'pc-03',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.fighter-wing',
    systemId: 'sys-aurelis',
  },
  {
    id: 'pc-04',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.fighter-wing',
    systemId: 'sys-aurelis',
  },
  {
    id: 'pc-05',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.ground-trooper',
    systemId: 'sys-brevora',
  },
  {
    id: 'pc-06',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.ground-trooper',
    systemId: 'sys-brevora',
  },
  {
    id: 'pc-07',
    kind: 'unit',
    owner: 'empire',
    typeKey: 'unit.empire.ground-trooper',
    systemId: 'sys-cindral',
  },
  {
    id: 'pc-08',
    kind: 'leader',
    owner: 'empire',
    typeKey: 'leader.empire.commander',
    systemId: 'sys-aurelis',
  },
  {
    id: 'pc-09',
    kind: 'leader',
    owner: 'empire',
    typeKey: 'leader.empire.agent',
    systemId: 'sys-cindral',
  },
  {
    id: 'pc-10',
    kind: 'token',
    owner: 'empire',
    typeKey: 'token.empire.loyalty',
    systemId: 'sys-brevora',
  },
  {
    id: 'pc-11',
    kind: 'token',
    owner: 'empire',
    typeKey: 'token.empire.probe',
    systemId: 'sys-dovmaren',
  },
  {
    id: 'pc-12',
    kind: 'unit',
    owner: 'rebellion',
    typeKey: 'unit.rebellion.cruiser',
    systemId: 'sys-iskra',
  },
  {
    id: 'pc-13',
    kind: 'unit',
    owner: 'rebellion',
    typeKey: 'unit.rebellion.fighter-wing',
    systemId: 'sys-iskra',
  },
  {
    id: 'pc-14',
    kind: 'unit',
    owner: 'rebellion',
    typeKey: 'unit.rebellion.fighter-wing',
    systemId: 'sys-iskra',
  },
  {
    id: 'pc-15',
    kind: 'unit',
    owner: 'rebellion',
    typeKey: 'unit.rebellion.ground-trooper',
    systemId: 'sys-jorvan',
  },
  {
    id: 'pc-16',
    kind: 'unit',
    owner: 'rebellion',
    typeKey: 'unit.rebellion.ground-trooper',
    systemId: 'sys-jorvan',
  },
  {
    id: 'pc-17',
    kind: 'leader',
    owner: 'rebellion',
    typeKey: 'leader.rebellion.captain',
    systemId: 'sys-iskra',
  },
  {
    id: 'pc-18',
    kind: 'leader',
    owner: 'rebellion',
    typeKey: 'leader.rebellion.envoy',
    systemId: 'sys-hollin',
  },
  {
    id: 'pc-19',
    kind: 'token',
    owner: 'rebellion',
    typeKey: 'token.rebellion.loyalty',
    systemId: 'sys-hollin',
  },
  {
    id: 'pc-20',
    kind: 'token',
    owner: 'rebellion',
    typeKey: 'token.rebellion.sabotage',
    systemId: 'sys-galdor',
  },
  // Hidden Rebel piece: its typeKey is unique in the scenario so leak tests can grep for it (TC-GC-22).
  {
    id: 'pc-21',
    kind: 'token',
    owner: 'rebellion',
    typeKey: 'token.rebellion.covert-cell',
    systemId: 'sys-fennix',
    hidden: true,
  },
];

export const mockScenario = {
  id: MOCK_SCENARIO_ID,
  regions,
  systems,
  pieces,
  rebelBaseSystemId: 'sys-hollin',
} satisfies Scenario;
