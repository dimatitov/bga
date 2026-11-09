/**
 * SWR-005B W4 (plan-backend §4.1, §2.5; AC-13): the client factory — explicit base URL, SDK retries off, a fake fetch
 * is mandatory under nodeEnv 'test', lazy creation; and the AiFailure → ApiError mapping (§6.2).
 */
import { describe, expect, it } from 'vitest';
import { AiFailure, retryAfterSeconds, safeDetails, toApiError } from '../../src/ai/ai.errors';
import {
  createOpenAIClient,
  lazyOpenAIClient,
  OPENAI_BASE_URL,
  OpenAIClientConfigError,
} from '../../src/ai/providers/openai-client';
import { createFakeFetch, enabledOpenAI, modelReply } from '../support/openai-fake-fetch';

describe('createOpenAIClient', () => {
  it('nodeEnv test without a fake fetch → throws (never the global fetch)', () => {
    expect(() => createOpenAIClient({ openai: enabledOpenAI(), nodeEnv: 'test' })).toThrow(
      OpenAIClientConfigError,
    );
  });

  it('explicit options: base URL, SDK maxRetries 0, timeout from config', () => {
    const fake = createFakeFetch(() => modelReply('m'));
    const client = createOpenAIClient({
      openai: enabledOpenAI({ timeoutMs: 1234 }),
      nodeEnv: 'test',
      fetch: fake.fetch,
    });
    expect(client.baseURL).toBe(OPENAI_BASE_URL);
    expect(client.maxRetries).toBe(0);
    expect(client.timeout).toBe(1234);
    expect(client.organization).toBeNull();
    expect(client.project).toBeNull();
  });

  it('lazy: no client (and no throw) until first use; then one instance', () => {
    const fake = createFakeFetch(() => modelReply('m'));
    const bad = lazyOpenAIClient({ openai: enabledOpenAI(), nodeEnv: 'test' });
    expect(() => bad()).toThrow(OpenAIClientConfigError);
    const get = lazyOpenAIClient({ openai: enabledOpenAI(), nodeEnv: 'test', fetch: fake.fetch });
    expect(get()).toBe(get());
    expect(fake.calls).toHaveLength(0);
  });
});

describe('toApiError / safeDetails', () => {
  it('HTTP statuses from the platform table and allow-listed details', () => {
    expect(toApiError(AiFailure.pricingUnknown('strategy', 'gpt-x')).toBody()).toEqual({
      code: 'AI_NOT_CONFIGURED',
      messageKey: 'errors.aiPricingUnknown',
      details: { role: 'strategy', model: 'gpt-x' },
    });
    expect(toApiError(AiFailure.notConfigured()).toBody()).toEqual({
      code: 'AI_NOT_CONFIGURED',
      messageKey: 'errors.aiNotConfigured',
    });
    const quota = AiFailure.providerError('quota', {
      attempts: 1,
      requestId: 'req_1',
      httpStatus: 429,
    });
    expect(toApiError(quota).toBody()).toEqual({
      code: 'AI_PROVIDER_ERROR',
      messageKey: 'errors.aiQuota',
      details: { attempts: 1, reason: 'quota' },
    });
    expect(toApiError(quota).status).toBe(502);
    const budget = AiFailure.budgetExceeded({
      budgetKey: 'dev-diagnostics',
      spentMicroUsd: 240_000,
      limitMicroUsd: 250_000,
      remainingMicroUsd: 10_000,
      requiredMicroUsd: 57_000,
    });
    expect(toApiError(budget).status).toBe(429);
    expect(safeDetails(budget)).toEqual({
      budgetKey: 'dev-diagnostics',
      spentUsd: 0.24,
      spentMicroUsd: 240_000,
      limitUsd: 0.25,
      limitMicroUsd: 250_000,
      remainingUsd: 0.01,
      remainingMicroUsd: 10_000,
      requiredUsd: 0.057,
      requiredMicroUsd: 57_000,
    });
    expect(retryAfterSeconds(1)).toBe(1);
    expect(retryAfterSeconds(10_001)).toBe(11);
    expect(retryAfterSeconds(undefined)).toBeUndefined();
  });

  it('message is the code only', () => {
    const f = AiFailure.timeout({ attempts: 3, sdkErrorName: 'APIConnectionTimeoutError' });
    expect(f.message).toBe('AI_TIMEOUT');
    expect(toApiError(f).message).toBe('AI_TIMEOUT');
  });
});
