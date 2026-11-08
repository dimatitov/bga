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
}
