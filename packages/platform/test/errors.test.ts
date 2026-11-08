import { describe, expect, it } from 'vitest';
import {
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
    ]);
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
