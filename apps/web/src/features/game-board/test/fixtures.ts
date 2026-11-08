/**
 * Test fixture PlayerView (test-cases notation: S_A/S_B/S_C, P_E1/P_E2/P_E3, P_R1, P_RH).
 * Ids mirror the mock scenario so gameData translations and mapLayout entries exist. Test-only.
 */
import type { PlayerView } from '@swr/contracts';

export const S_A = 'sys-aurelis';
export const S_B = 'sys-brevora';
export const S_D = 'sys-cindral';
/** Not adjacent to S_A. */
export const S_C = 'sys-dovmaren';
export const P_E1 = 'pc-01';
export const P_E2 = 'pc-02';
export const P_E3 = 'pc-05';
export const P_R1 = 'pc-12';
export const P_RH = 'pc-21';
export const GAME_ID = 'game-fixture-1';

export function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: GAME_ID,
    version: 3,
    round: 1,
    phase: 'assignment',
    setup: { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'normal' } },
    systems: [
      { id: S_A, nameKey: `systems.${S_A}`, regionId: 'reg-inner', adjacentSystemIds: [S_B, S_D] },
      {
        id: S_B,
        nameKey: `systems.${S_B}`,
        regionId: 'reg-inner',
        adjacentSystemIds: [S_A, S_D, S_C],
      },
      { id: S_D, nameKey: `systems.${S_D}`, regionId: 'reg-inner', adjacentSystemIds: [S_A, S_B] },
      { id: S_C, nameKey: `systems.${S_C}`, regionId: 'reg-mid', adjacentSystemIds: [S_B] },
    ],
    pieces: [
      {
        id: P_E1,
        kind: 'unit',
        owner: 'empire',
        typeKey: 'unit.empire.capital-ship',
        systemId: S_A,
      },
      {
        id: P_E2,
        kind: 'unit',
        owner: 'empire',
        typeKey: 'unit.empire.fighter-wing',
        systemId: S_A,
      },
      {
        id: P_E3,
        kind: 'unit',
        owner: 'empire',
        typeKey: 'unit.empire.ground-trooper',
        systemId: S_B,
      },
      {
        id: P_R1,
        kind: 'unit',
        owner: 'rebellion',
        typeKey: 'unit.rebellion.cruiser',
        systemId: S_C,
      },
      {
        id: P_RH,
        kind: 'token',
        owner: 'rebellion',
        typeKey: 'unknown',
        systemId: S_D,
        hidden: true,
      },
    ],
    rebelBase: { systemId: null, revealed: false },
    log: [
      {
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: 'mock-scenario-v1' },
        at: '2026-11-08T10:00:00.000Z',
      },
      {
        seq: 2,
        type: 'PHASE_ADVANCED',
        actor: 'empire',
        payload: { fromRound: 1, fromPhase: 'refresh', toRound: 1, toPhase: 'assignment' },
        at: '2026-11-08T10:01:00.000Z',
      },
    ],
    legalActions: [
      // TC-WEB-06: S_A is adjacent to S_B and S_D, but the server lists only S_B for P_E1.
      { type: 'MOVE_PIECES', pieceId: P_E1, toSystemIds: [S_B] },
      { type: 'MOVE_PIECES', pieceId: P_E2, toSystemIds: [S_B, S_D] },
      { type: 'MOVE_PIECES', pieceId: P_E3, toSystemIds: [S_A, S_D, S_C] },
      { type: 'ADVANCE_PHASE' },
    ],
    ...overrides,
  };
}

/** View after P_E1 moved S_A → S_B (version + 1). */
export function makeMovedView(base: PlayerView = makeView()): PlayerView {
  return {
    ...base,
    version: base.version + 1,
    pieces: base.pieces.map((p) => (p.id === P_E1 ? { ...p, systemId: S_B } : p)),
    log: [
      ...base.log,
      {
        seq: base.log.length + 1,
        type: 'PIECES_MOVED',
        actor: 'empire',
        payload: { pieceIds: [P_E1], fromSystemId: S_A, toSystemId: S_B },
        at: '2026-11-08T10:02:00.000Z',
      },
    ],
  };
}
