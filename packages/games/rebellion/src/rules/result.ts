import type { ErrorMessageKey, GameEvent, GameState } from '../schema';

/** Domain error codes produced by game-core. `NOT_FOUND`/`INTERNAL` belong to the API only. */
export type CoreErrorCode = 'VALIDATION' | 'VERSION_CONFLICT' | 'ILLEGAL_COMMAND';

export interface CoreError {
  code: CoreErrorCode;
  messageKey: ErrorMessageKey;
  /** Only ids taken from the request (never data about enemy pieces). */
  details?: unknown;
}

/** AM-4: rejections are returned, never thrown. */
export type ApplyResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: CoreError };
