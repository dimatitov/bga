/**
 * Tiny synthetic `core-v1` data and state for SCHEMA / dispatch tests of SWR-005 W1 (not base-game facts:
 * the real data is `./scenario` (W2); the rules' own mini data set is W3's).
 *
 * Map: a — b — c — d (a line); r1 = {a, b}, r2 = {c, d}; `c` is remote.
 * Imperial start units in `a` → `a` and `b` are not eligible for the base; `c` is listed as ineligible → only `d`.
 */
import type {
  CoreData,
  CoreGameStateV3,
  CorePlayerView,
  RebellionSettings,
} from '../../src/schema';

export const AT = '2026-11-08T10:00:00.000Z';

export function miniData(): CoreData {
  return {
    id: 'mini-v1',
    regions: [{ id: 'r1' }, { id: 'r2' }],
    systems: [
      { id: 'a', regionId: 'r1', adjacentSystemIds: ['b'], remote: false },
      { id: 'b', regionId: 'r1', adjacentSystemIds: ['a', 'c'], remote: false },
      { id: 'c', regionId: 'r2', adjacentSystemIds: ['b', 'd'], remote: true },
      { id: 'd', regionId: 'r2', adjacentSystemIds: ['c'], remote: false },
    ],
    unitTypes: [
      {
        typeKey: 'unit.empire.trooper',
        owner: 'empire',
        arena: 'ground',
        mobility: 'mobile',
        transportCapacity: 0,
        requiresTransport: true,
      },
      {
        typeKey: 'unit.empire.destroyer',
        owner: 'empire',
        arena: 'space',
        mobility: 'mobile',
        transportCapacity: 6,
        requiresTransport: false,
      },
      {
        typeKey: 'unit.empire.tie',
        owner: 'empire',
        arena: 'space',
        mobility: 'mobile',
        transportCapacity: 0,
        requiresTransport: true,
      },
      {
        typeKey: 'unit.rebels.trooper',
        owner: 'rebels',
        arena: 'ground',
        mobility: 'mobile',
        transportCapacity: 0,
        requiresTransport: true,
      },
      {
        typeKey: 'unit.rebels.transport',
        owner: 'rebels',
        arena: 'space',
        mobility: 'mobile',
        transportCapacity: 4,
        requiresTransport: false,
      },
      {
        typeKey: 'unit.rebels.shield',
        owner: 'rebels',
        arena: 'ground',
        mobility: 'immobile',
        transportCapacity: 0,
        requiresTransport: false,
      },
    ],
    leaders: [
      { id: 'vader', owner: 'empire', canActivate: true },
      { id: 'mothma', owner: 'rebels', canActivate: false },
      { id: 'leia', owner: 'rebels', canActivate: true },
    ],
    startSetup: {
      startingTime: 1,
      startingReputation: 14,
      units: [
        { typeKey: 'unit.empire.trooper', at: { kind: 'system', systemId: 'a' } },
        { typeKey: 'unit.empire.destroyer', at: { kind: 'system', systemId: 'a' } },
        { typeKey: 'unit.rebels.trooper', at: { kind: 'rebelBase' } },
        { typeKey: 'unit.rebels.shield', at: { kind: 'rebelBase' } },
        { typeKey: 'unit.rebels.transport', at: { kind: 'system', systemId: 'c' } },
      ],
      leaders: ['vader', 'mothma', 'leia'],
      baseIneligibleSystemIds: ['c'],
    },
  };
}

export const HOT_SEAT: RebellionSettings = {
  playerFaction: 'rebels',
  opponentFaction: 'empire',
  opponentType: 'human',
  aiDifficulty: null,
  ruleset: 'base',
  gameMode: 'digital',
};

export const EMPIRE_VS_AI: RebellionSettings = {
  playerFaction: 'empire',
  opponentFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
};

/** A stored `core-v1` state at the start of the command phase (Rebels to act), base in `d`. */
export function coreState(settings: RebellionSettings = HOT_SEAT): CoreGameStateV3 {
  const data = miniData();
  return {
    schemaVersion: 3,
    rulesEngine: 'core-v1',
    id: 'core-1',
    version: 1,
    settings,
    activeSide: settings.opponentType === 'ai' ? settings.playerFaction : 'rebels',
    handoffPending: false,
    scenarioId: data.id,
    round: 1,
    reputation: 14,
    phase: 'command',
    passed: { rebels: false, empire: false },
    activation: null,
    map: { regions: data.regions, systems: data.systems },
    unitTypes: data.unitTypes,
    units: [
      { id: 'u-01', owner: 'empire', typeKey: 'unit.empire.trooper', systemId: 'a' },
      { id: 'u-02', owner: 'empire', typeKey: 'unit.empire.destroyer', systemId: 'a' },
      { id: 'u-03', owner: 'rebels', typeKey: 'unit.rebels.trooper', systemId: 'd' },
      { id: 'u-04', owner: 'rebels', typeKey: 'unit.rebels.shield', systemId: 'd' },
      { id: 'u-05', owner: 'rebels', typeKey: 'unit.rebels.transport', systemId: 'c' },
    ],
    leaders: [
      { id: 'vader', owner: 'empire', canActivate: true, systemId: null },
      { id: 'mothma', owner: 'rebels', canActivate: false, systemId: null },
      { id: 'leia', owner: 'rebels', canActivate: true, systemId: null },
    ],
    rebelBase: { systemId: 'd', revealed: false },
    outcome: null,
    log: [
      { seq: 1, type: 'GAME_CREATED', actor: 'system', payload: { scenarioId: data.id }, at: AT },
      {
        seq: 2,
        type: 'PHASE_STARTED',
        actor: 'system',
        payload: { round: 1, phase: 'assignment' },
        at: AT,
      },
      {
        seq: 3,
        type: 'PHASE_STARTED',
        actor: 'system',
        payload: { round: 1, phase: 'command' },
        at: AT,
      },
    ],
  };
}

/** A hand-built Empire view of `coreState()` before the reveal (the base zone has no system). */
export function coreEmpireView(): CorePlayerView {
  const state = coreState();
  return {
    kind: 'player',
    rulesEngine: 'core-v1',
    viewer: 'empire',
    activeSide: 'rebels',
    settings: state.settings,
    id: state.id,
    version: state.version,
    round: 1,
    phase: 'command',
    markers: { time: 1, reputation: 14 },
    map: {
      regions: state.map.regions.map((r) => ({ id: r.id, nameKey: `regions.${r.id}` })),
      systems: state.map.systems.map((s) => ({ ...s, nameKey: `systems.${s.id}` })),
    },
    unitTypes: state.unitTypes,
    units: [
      {
        id: 'u-01',
        owner: 'empire',
        typeKey: 'unit.empire.trooper',
        location: { kind: 'system', systemId: 'a' },
      },
      {
        id: 'u-02',
        owner: 'empire',
        typeKey: 'unit.empire.destroyer',
        location: { kind: 'system', systemId: 'a' },
      },
      {
        id: 'u-03',
        owner: 'rebels',
        typeKey: 'unit.rebels.trooper',
        location: { kind: 'rebelBase' },
      },
      {
        id: 'u-04',
        owner: 'rebels',
        typeKey: 'unit.rebels.shield',
        location: { kind: 'rebelBase' },
      },
      {
        id: 'u-05',
        owner: 'rebels',
        typeKey: 'unit.rebels.transport',
        location: { kind: 'system', systemId: 'c' },
      },
    ],
    leaders: [
      { id: 'vader', owner: 'empire', canActivate: true, location: { kind: 'pool' } },
      { id: 'mothma', owner: 'rebels', canActivate: false, location: { kind: 'pool' } },
      { id: 'leia', owner: 'rebels', canActivate: true, location: { kind: 'rebelBase' } },
    ],
    activation: { side: 'rebels', leaderId: 'leia', location: { kind: 'rebelBase' } },
    passed: { rebels: false, empire: false },
    rebelBase: { systemId: null, revealed: false },
    contestedSystemIds: [],
    outcome: null,
    log: [
      {
        seq: 4,
        type: 'SYSTEM_ACTIVATED',
        actor: 'rebels',
        payload: { leaderId: 'leia', systemId: null },
        at: AT,
      },
      {
        seq: 5,
        type: 'PIECES_MOVED',
        actor: 'rebels',
        payload: { pieceIds: ['u-05'], fromSystemId: 'c', toSystemId: null },
        at: AT,
      },
    ],
    legalActions: [],
  };
}
