import type { Faction, GameState, LegalAction } from '../schema';
import { mockLegalActions } from './mock-rules';

/**
 * Legal actions for `viewer` (AM-4, AM-FE-7): `[]` while a handoff is pending or when `viewer` is not the
 * active side; otherwise the mock moves + ADVANCE_PHASE, plus END_TURN in a human (hot-seat) game.
 */
export function getLegalActions(state: GameState, viewer: Faction): LegalAction[] {
  if (state.handoffPending || viewer !== state.activeSide) return [];
  const actions = mockLegalActions(state, viewer);
  return state.settings.opponentType === 'human' ? [...actions, { type: 'END_TURN' }] : actions;
}
