import type { Faction, GameState, LegalAction } from '@swr/contracts';
import { mockLegalActions } from './mock-rules';

/** Legal actions for `viewer`; `[]` unless `viewer` is the human side (A-2, AM-4). */
export function getLegalActions(state: GameState, viewer: Faction): LegalAction[] {
  if (viewer !== state.setup.humanFaction) return [];
  return mockLegalActions(state, viewer);
}
