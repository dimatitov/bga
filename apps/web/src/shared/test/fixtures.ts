import { type GameSummary, type PlayerView } from '@swr/contracts';

/** Minimal valid `PlayerView` (passes `PlayerViewSchema`). */
export function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'g1',
    version: 1,
    round: 1,
    phase: 'assignment',
    setup: { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'normal' } },
    systems: [
      { id: 'S_A', nameKey: 'systems.S_A', regionId: 'R1', adjacentSystemIds: ['S_B'] },
      { id: 'S_B', nameKey: 'systems.S_B', regionId: 'R1', adjacentSystemIds: ['S_A'] },
    ],
    pieces: [{ id: 'P_E1', kind: 'unit', owner: 'empire', typeKey: 'cruiser', systemId: 'S_A' }],
    rebelBase: { systemId: null, revealed: false },
    log: [
      {
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: 'mock' },
        at: '2026-11-08T10:00:00.000Z',
      },
    ],
    legalActions: [
      { type: 'MOVE_PIECES', pieceId: 'P_E1', toSystemIds: ['S_B'] },
      { type: 'ADVANCE_PHASE' },
    ],
    ...overrides,
  };
}

export function makeSummary(
  gameId: string,
  updatedAt: string,
  overrides: Partial<GameSummary> = {},
): GameSummary {
  return {
    gameId,
    setup: { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'normal' } },
    round: 1,
    phase: 'assignment',
    updatedAt,
    ...overrides,
  };
}
