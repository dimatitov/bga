import { describe, expect, it } from 'vitest';
import {
  AiErrorCodeSchema,
  ApiErrorSchema,
  CommandErrSchema,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGE_KEYS,
  ErrorCodeSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  PLATFORM_ERROR_MESSAGE_KEYS,
  type GameModuleError,
} from '../src';

describe('platform errors', () => {
  it('error codes: SWR-002 codes + GAME_UNAVAILABLE (Q-4, AM-10) + SWR-004 codes', () => {
    expect(ErrorCodeSchema.options).toEqual([
      'ILLEGAL_COMMAND',
      'VERSION_CONFLICT',
      'NOT_FOUND',
      'VALIDATION',
      'INTERNAL',
      'GAME_UNAVAILABLE',
      'SETUP_UNSUPPORTED',
      'IDEMPOTENCY_KEY_REUSED',
      'AI_NOT_CONFIGURED',
      'AI_BUDGET_EXCEEDED',
      'AI_RATE_LIMITED',
      'AI_TIMEOUT',
      'AI_PROVIDER_ERROR',
      'AI_INVALID_DECISION',
      'AI_DEV_FORBIDDEN',
    ]);
  });

  it('AI error codes subset (SWR-005B, plan-backend §6.3)', () => {
    expect(AiErrorCodeSchema.options).toEqual(
      ErrorCodeSchema.options.filter((code) => code.startsWith('AI_')),
    );
    expect(AiErrorCodeSchema.options).toHaveLength(7);
  });

  it('HTTP status of every code (SETUP_UNSUPPORTED 422, IDEMPOTENCY_KEY_REUSED 409)', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual([...ErrorCodeSchema.options].sort());
    expect(ERROR_HTTP_STATUS).toEqual({
      VALIDATION: 400,
      NOT_FOUND: 404,
      VERSION_CONFLICT: 409,
      IDEMPOTENCY_KEY_REUSED: 409,
      ILLEGAL_COMMAND: 422,
      GAME_UNAVAILABLE: 422,
      SETUP_UNSUPPORTED: 422,
      INTERNAL: 500,
      AI_NOT_CONFIGURED: 503,
      AI_BUDGET_EXCEEDED: 429,
      AI_RATE_LIMITED: 429,
      AI_TIMEOUT: 504,
      AI_PROVIDER_ERROR: 502,
      AI_INVALID_DECISION: 502,
      AI_DEV_FORBIDDEN: 403,
    });
  });

  it('platform message keys include the SWR-003 keys, unique and errors.-prefixed', () => {
    expect(ERROR_MESSAGE_KEYS).toMatchObject({
      gameNotFound: 'errors.gameNotFound',
      gameUnavailable: 'errors.gameUnavailable',
      sessionNotFound: 'errors.sessionNotFound',
      validation: 'errors.validation',
      notFound: 'errors.notFound',
      versionConflict: 'errors.versionConflict',
      internal: 'errors.internal',
      setupUnsupported: 'errors.setupUnsupported',
      idempotencyKeyReused: 'errors.idempotencyKeyReused',
    });
    const keys = Object.values(ERROR_MESSAGE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^errors\.[a-zA-Z]+$/);
    expect(PLATFORM_ERROR_MESSAGE_KEYS).toBe(ERROR_MESSAGE_KEYS);
  });

  it('AI message keys are flat errors.ai* (AM-BE-2, Q-FE-6, plan-backend §6.1)', () => {
    const aiKeys = Object.entries(ERROR_MESSAGE_KEYS)
      .filter(([name]) => name.startsWith('ai'))
      .map(([name, key]) => {
        expect(key).toBe(`errors.${name}`);
        return name;
      });
    expect(aiKeys.sort()).toEqual(
      [
        'aiNotConfigured',
        'aiModelUnavailable',
        'aiPricingUnknown',
        'aiKeyRejected',
        'aiBudgetExceeded',
        'aiRateLimited',
        'aiDevRateLimited',
        'aiTimeout',
        'aiProviderError',
        'aiQuota',
        'aiInvalidDecision',
        'aiDevForbidden',
      ].sort(),
    );
  });

  it('AI error bodies parse with the shared envelope', () => {
    for (const code of AiErrorCodeSchema.options) {
      const body = {
        ok: false,
        error: { code, messageKey: 'errors.aiProviderError', details: { attempts: 3 } },
      };
      expect(ErrorResponseSchema.safeParse(body).success).toBe(true);
    }
  });

  it('error response format is unchanged (strict) and CommandErrSchema is the same schema', () => {
    const body = {
      ok: false,
      error: { code: 'GAME_UNAVAILABLE', messageKey: ERROR_MESSAGE_KEYS.gameUnavailable },
    };
    expect(ErrorResponseSchema.parse(body)).toEqual(body);
    expect(CommandErrSchema).toBe(ErrorResponseSchema);
    expect(ErrorResponseSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
    for (const code of ['SETUP_UNSUPPORTED', 'IDEMPOTENCY_KEY_REUSED'] as const) {
      expect(ApiErrorSchema.safeParse({ code, messageKey: 'errors.x' }).success).toBe(true);
    }
    expect(ApiErrorSchema.safeParse({ code: 'NOPE', messageKey: 'errors.x' }).success).toBe(false);
    expect(
      ApiErrorSchema.safeParse({ code: 'VALIDATION', messageKey: 'errors.validation', details: {} })
        .success,
    ).toBe(true);
  });

  it('a GameModuleError is a valid ApiError body', () => {
    const error: GameModuleError = {
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.x',
      details: { a: 1 },
    };
    expect(ApiErrorSchema.safeParse(error).success).toBe(true);
  });

  it('health response', () => {
    expect(HealthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(HealthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });
});
