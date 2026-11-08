import type { CommandOrigin } from '../schema';

/**
 * Determinism (R-1, AM-1): game-core never reads the clock or generates ids itself.
 * Callers (the API) inject them through these contexts.
 */
export interface CreateContext {
  /** Id of the new game. */
  gameId: string;
  /** ISO-8601 timestamp used for the `GAME_CREATED` event. */
  now: string;
}

export interface ApplyContext {
  /** ISO-8601 timestamp used for events produced by the command. */
  now: string;
  /**
   * Who issued the command (SWR-005 BD-5): `player` (default) or the server's automatic AI move (`auto`).
   * Set only by the server, never from a request; `mock-v1` ignores it.
   */
  origin?: CommandOrigin;
}
