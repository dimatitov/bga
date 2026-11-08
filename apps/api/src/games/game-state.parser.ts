import { GameStateSchema, type GameState } from '@swr/contracts';
import type { GameRow } from './games.repository';

/**
 * Parses a stored snapshot. A corrupt snapshot is a server fault: the raw error propagates
 * and the global filter answers 500 INTERNAL (never 400, never the error text).
 */
export function parseStoredState(row: GameRow): GameState {
  const state = GameStateSchema.parse(JSON.parse(row.state));
  if (state.version !== row.version || state.id !== row.id) {
    throw new Error('stored snapshot does not match its row');
  }
  return state;
}
