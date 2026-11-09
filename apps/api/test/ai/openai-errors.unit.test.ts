/**
 * SWR-005B W4 (plan-backend §6.1 + Clarifications Q-7/Q-9/Q-14): every SDK outcome → our code / messageKey / reason /
 * retryable, produced by the REAL openai SDK (6.49.0) talking to a fake fetch. No network.
 */
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AiFailure, toApiError } from '../../src/ai/ai.errors';
import { classifySdkError } from '../../src/ai/providers/openai-errors';
import {
  createFakeFetch,
  enabledOpenAI,
  errorReply,
  fakeClient,
  SENTINEL_KEY,
  type FakeReply,
} from '../support/openai-fake-fetch';

async function sdkErrorFor(reply: FakeReply, timeoutMs = 30_000): Promise<unknown> {
  const fake = createFakeFetch(() => reply);
  const client = fakeClient(fake, enabledOpenAI({ timeoutMs }));
  try {
    await client.responses.create({ model: 'gpt-6-luna', input: 'x' });
  } catch (err) {
    return err;
  }
  throw new Error('expected the SDK call to fail');
}

async function classify(reply: FakeReply, timeoutMs?: number): Promise<AiFailure> {
  return classifySdkError(await sdkErrorFor(reply, timeoutMs), {
    nowMs: Date.parse('2026-11-08T12:00:00Z'),
    role: 'tactical',
    model: 'gpt-6-luna',
  });
}

function expectNoLeak(f: AiFailure): void {
  const api = toApiError(f);
  for (const text of [
    f.message,
    JSON.stringify(f),
    inspect(f),
    JSON.stringify(api.toBody()),
    api.message,
  ]) {
    expect(text).not.toContain(SENTINEL_KEY);
    expect(text).not.toContain('upstream said');
  }
}

describe('classifySdkError (real SDK + fake fetch)', () => {
  const cases: Array<{
    name: string;
    reply: FakeReply;
    timeoutMs?: number;
    code: string;
    messageKey: string;
    retryable: boolean;
    reason?: string;
    sdk: string;
    status?: number;
  }> = [
    {
      name: 'client timeout (APIConnectionTimeoutError)',
      reply: { kind: 'hang' },
      timeoutMs: 20,
      code: 'AI_TIMEOUT',
      messageKey: 'errors.aiTimeout',
      retryable: true,
      sdk: 'APIConnectionTimeoutError',
    },
    {
      name: 'HTTP 408',
      reply: errorReply(408),
      code: 'AI_TIMEOUT',
      messageKey: 'errors.aiTimeout',
      retryable: true,
      sdk: 'APIError',
      status: 408,
    },
    {
      name: 'network failure (APIConnectionError)',
      reply: { kind: 'network-error' },
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiProviderError',
      retryable: true,
      reason: 'network',
      sdk: 'APIConnectionError',
    },
    {
      name: '429 rate limit',
      reply: errorReply(429, { code: 'rate_limit_exceeded', type: 'requests' }),
      code: 'AI_RATE_LIMITED',
      messageKey: 'errors.aiRateLimited',
      retryable: true,
      sdk: 'RateLimitError',
      status: 429,
    },
    {
      name: '429 insufficient_quota (no retry)',
      reply: errorReply(429, { code: 'insufficient_quota', type: 'insufficient_quota' }),
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiQuota',
      retryable: false,
      reason: 'quota',
      sdk: 'RateLimitError',
      status: 429,
    },
    {
      name: '500',
      reply: errorReply(500, { type: 'server_error' }),
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiProviderError',
      retryable: true,
      reason: 'upstream',
      sdk: 'InternalServerError',
      status: 500,
    },
    {
      name: '503',
      reply: errorReply(503),
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiProviderError',
      retryable: true,
      reason: 'upstream',
      sdk: 'InternalServerError',
      status: 503,
    },
    {
      name: '401',
      reply: errorReply(401, { code: 'invalid_api_key' }),
      code: 'AI_NOT_CONFIGURED',
      messageKey: 'errors.aiKeyRejected',
      retryable: false,
      sdk: 'AuthenticationError',
      status: 401,
    },
    {
      name: '403',
      reply: errorReply(403),
      code: 'AI_NOT_CONFIGURED',
      messageKey: 'errors.aiKeyRejected',
      retryable: false,
      sdk: 'PermissionDeniedError',
      status: 403,
    },
    {
      name: '404',
      reply: errorReply(404, { code: 'model_not_found' }),
      code: 'AI_NOT_CONFIGURED',
      messageKey: 'errors.aiModelUnavailable',
      retryable: false,
      sdk: 'NotFoundError',
      status: 404,
    },
    ...([400, 409, 422] as const).map((status) => ({
      name: String(status),
      reply: errorReply(status),
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiProviderError',
      retryable: false,
      reason: 'bad_request',
      sdk: { 400: 'BadRequestError', 409: 'ConflictError', 422: 'UnprocessableEntityError' }[
        status
      ],
      status,
    })),
    {
      name: 'other status (418)',
      reply: errorReply(418),
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiProviderError',
      retryable: false,
      reason: 'unknown',
      sdk: 'APIError',
      status: 418,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const f = await classify(c.reply, c.timeoutMs);
      expect(f).toBeInstanceOf(AiFailure);
      expect(f.code).toBe(c.code);
      expect(f.messageKey).toBe(c.messageKey);
      expect(f.retryable).toBe(c.retryable);
      expect(f.reason).toBe(c.reason);
      expect(f.sdkErrorName).toBe(c.sdk);
      expect(f.httpStatus).toBe(c.status);
      expectNoLeak(f);
    });
  }

  it('429 with retry-after (seconds / ms / HTTP-date) carries retryAfterMs', async () => {
    expect((await classify(errorReply(429, {}, { 'retry-after': '3' }))).retryAfterMs).toBe(3000);
    expect((await classify(errorReply(429, {}, { 'retry-after-ms': '250' }))).retryAfterMs).toBe(
      250,
    );
    expect(
      (await classify(errorReply(429, {}, { 'retry-after': 'Sun, 08 Nov 2026 12:00:20 GMT' })))
        .retryAfterMs,
    ).toBe(20_000);
    const over = await classify(errorReply(429, {}, { 'retry-after': '60' }));
    expect(over.retryAfterMs).toBe(60_000);
    expect(toApiError(over).toBody().details).toEqual({ attempts: 1, retryAfterSeconds: 60 });
  });

  it('request id is kept (safe), AI_NOT_CONFIGURED details carry only role + model', async () => {
    const f = await classify(errorReply(401));
    expect(f.requestId).toBe('req_err_1');
    expect(toApiError(f).toBody()).toEqual({
      code: 'AI_NOT_CONFIGURED',
      messageKey: 'errors.aiKeyRejected',
      details: { role: 'tactical', model: 'gpt-6-luna' },
    });
    expect(toApiError(f).status).toBe(503);
  });

  it('non-SDK errors → AI_PROVIDER_ERROR unknown; AiFailure passes through', () => {
    const f = classifySdkError(new Error(`boom ${SENTINEL_KEY}`));
    expect(f.code).toBe('AI_PROVIDER_ERROR');
    expect(f.reason).toBe('unknown');
    expectNoLeak(f);
    const own = AiFailure.invalidDecision('refusal');
    expect(classifySdkError(own)).toBe(own);
  });
});
