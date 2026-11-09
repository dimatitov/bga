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
  /** AI provider is off / key rejected / model or pricing unknown → HTTP 503 (SWR-005B). */
  'AI_NOT_CONFIGURED',
  /** Budget key spent + worst-case reserve ≥ limit; OpenAI is not called → HTTP 429 (SWR-005B). */
  'AI_BUDGET_EXCEEDED',
  /** Upstream 429 or the dev rate limit → HTTP 429 (SWR-005B). */
  'AI_RATE_LIMITED',
  /** Provider timeout after retries → HTTP 504 (SWR-005B). */
  'AI_TIMEOUT',
  /** Network / 5xx / bad request / quota from the provider → HTTP 502 (SWR-005B). */
  'AI_PROVIDER_ERROR',
  /** The model answer is not JSON, refused, incomplete or picks an id outside the legal list → HTTP 502 (SWR-005B). */
  'AI_INVALID_DECISION',
  /** Dev-only AI endpoint called from a non-local origin / without the dev guard → HTTP 403 (SWR-005B). */
  'AI_DEV_FORBIDDEN',
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
  AI_DEV_FORBIDDEN: 403,
  AI_BUDGET_EXCEEDED: 429,
  AI_RATE_LIMITED: 429,
  AI_PROVIDER_ERROR: 502,
  AI_INVALID_DECISION: 502,
  AI_NOT_CONFIGURED: 503,
  AI_TIMEOUT: 504,
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
  // AI layer (SWR-005B, AM-BE-2 / Q-FE-6: flat `errors.ai*`). Mapping to codes: plan-backend §6.1.
  /** `AI_NOT_CONFIGURED`: OpenAI disabled / key or models not set. */
  aiNotConfigured: 'errors.aiNotConfigured',
  /** `AI_NOT_CONFIGURED`: the configured model is not available to the key (404). */
  aiModelUnavailable: 'errors.aiModelUnavailable',
  /** `AI_NOT_CONFIGURED`: no pricing entry for the model (cost cannot be bounded). */
  aiPricingUnknown: 'errors.aiPricingUnknown',
  /** `AI_NOT_CONFIGURED`: OpenAI rejected the key (401/403). */
  aiKeyRejected: 'errors.aiKeyRejected',
  /** `AI_BUDGET_EXCEEDED`. */
  aiBudgetExceeded: 'errors.aiBudgetExceeded',
  /** `AI_RATE_LIMITED`: upstream (OpenAI) rate limit. */
  aiRateLimited: 'errors.aiRateLimited',
  /** `AI_RATE_LIMITED`: the local dev endpoint rate limit (AM-BE-11). */
  aiDevRateLimited: 'errors.aiDevRateLimited',
  /** `AI_TIMEOUT`. */
  aiTimeout: 'errors.aiTimeout',
  /** `AI_PROVIDER_ERROR`: network / 5xx / bad request / unknown. */
  aiProviderError: 'errors.aiProviderError',
  /** `AI_PROVIDER_ERROR`: `insufficient_quota` (Clarification Q-7/Q-9/Q-14). */
  aiQuota: 'errors.aiQuota',
  /** `AI_INVALID_DECISION`. */
  aiInvalidDecision: 'errors.aiInvalidDecision',
  /** `AI_DEV_FORBIDDEN`. */
  aiDevForbidden: 'errors.aiDevForbidden',
} as const;
export type PlatformErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[keyof typeof ERROR_MESSAGE_KEYS];
/** Alias of `ERROR_MESSAGE_KEYS` (name used by plan-frontend §12). */
export const PLATFORM_ERROR_MESSAGE_KEYS = ERROR_MESSAGE_KEYS;

/** The AI-layer subset of `ErrorCodeSchema` (SWR-005B). */
export const AiErrorCodeSchema = ErrorCodeSchema.extract([
  'AI_NOT_CONFIGURED',
  'AI_BUDGET_EXCEEDED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_DECISION',
  'AI_DEV_FORBIDDEN',
]);
export type AiErrorCode = z.infer<typeof AiErrorCodeSchema>;

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
