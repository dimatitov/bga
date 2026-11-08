import type {
  CoreGameState,
  CoreLegalAction,
  Faction,
  GameState,
  LegalAction,
  MockGameState,
  MockLegalAction,
} from '../schema';
import { coreLegalActions } from './core';
import { mockLegalActions } from './mock-rules';

/**
 * `mock-v1` legal actions for `viewer` (AM-4, AM-FE-7): `[]` while a handoff is pending or when `viewer` is
 * not the active side; otherwise the mock moves + ADVANCE_PHASE, plus END_TURN in a human (hot-seat) game.
 */
export function getMockLegalActions(state: MockGameState, viewer: Faction): MockLegalAction[] {
  if (state.handoffPending || viewer !== state.activeSide) return [];
  const actions = mockLegalActions(state, viewer);
  return state.settings.opponentType === 'human' ? [...actions, { type: 'END_TURN' }] : actions;
}

/** Legal actions for `viewer`, by the state's rules engine (SWR-005 BD-1). */
export function getLegalActions(state: MockGameState, viewer: Faction): MockLegalAction[];
export function getLegalActions(state: CoreGameState, viewer: Faction): CoreLegalAction[];
export function getLegalActions(state: GameState, viewer: Faction): LegalAction[];
export function getLegalActions(state: GameState, viewer: Faction): LegalAction[] {
  switch (state.rulesEngine) {
    case 'mock-v1':
      return getMockLegalActions(state, viewer);
    case 'core-v1':
      return coreLegalActions(state, viewer);
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}
