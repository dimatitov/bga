import { z } from 'zod';

/** Error codes shared by every game and the platform API (`error.code` of a non-2xx response). */
export const ErrorCodeSchema = z.enum([
  'ILLEGAL_COMMAND',
  'VERSION_CONFLICT',
  'NOT_FOUND',
  'VALIDATION',
  'INTERNAL',
  /** The game exists in the catalogue but cannot be played (coming_soon / no server module) → HTTP 422. */
  'GAME_UNAVAILABLE',
  /** The game understood the setup but cannot play it yet (e.g. an unreleased mode) → HTTP 422 (SWR-004). */
  'SETUP_UNSUPPORTED',
  /** `Idempotency-Key` already used with a different request body → HTTP 409 (SWR-004, Q-2). */
  'IDEMPOTENCY_KEY_REUSED',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** HTTP status of every platform error code (the API maps `error.code` → status with this table). */
export const ERROR_HTTP_STATUS = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  ILLEGAL_COMMAND: 422,
  GAME_UNAVAILABLE: 422,
  SETUP_UNSUPPORTED: 422,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

/**
 * Platform `messageKey`s (game-independent). Game-specific keys live in the game package
 * (e.g. `REBELLION_ERROR_MESSAGE_KEYS` in `@bga/game-rebellion/schema`). The web app translates all of them (ru/en).
 */
export const ERROR_MESSAGE_KEYS = {
  validation: 'errors.validation',
  notFound: 'errors.notFound',
  versionConflict: 'errors.versionConflict',
  internal: 'errors.internal',
  gameNotFound: 'errors.gameNotFound',
  gameUnavailable: 'errors.gameUnavailable',
  sessionNotFound: 'errors.sessionNotFound',
  /** Fallback for 422 `SETUP_UNSUPPORTED`; a game normally sends its own `errors.<name>` key. */
  setupUnsupported: 'errors.setupUnsupported',
  idempotencyKeyReused: 'errors.idempotencyKeyReused',
} as const;
export type PlatformErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[keyof typeof ERROR_MESSAGE_KEYS];
/** Alias of `ERROR_MESSAGE_KEYS` (name used by plan-frontend §12). */
export const PLATFORM_ERROR_MESSAGE_KEYS = ERROR_MESSAGE_KEYS;

export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  messageKey: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Body of every non-2xx response under `/api`, and the `ok: false` branch of a command result. */
export const ErrorResponseSchema = z.strictObject({
  ok: z.literal(false),
  error: ApiErrorSchema,
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Historical name (SWR-002) of `ErrorResponseSchema`. */
export const CommandErrSchema = ErrorResponseSchema;
export type CommandErr = ErrorResponse;

/** Error codes a game module may return (rejections are results, never thrown). */
export type GameModuleErrorCode = 'VALIDATION' | 'VERSION_CONFLICT' | 'ILLEGAL_COMMAND';

/** Rejection returned by a game module; `messageKey` is a platform or game key (`errors.<name>`). */
export interface GameModuleError {
  code: GameModuleErrorCode;
  messageKey: string;
  /** Only ids taken from the request (never hidden data). */
  details?: unknown;
}
