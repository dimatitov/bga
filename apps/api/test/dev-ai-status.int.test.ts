/**
 * SWR-005B W6 — `GET /api/dev/ai/status` (plan-backend §10.1, AM-BE-9, Q-26; TC-PS-11).
 */
import { AiDevStatusSchema, usdToMicroUsd } from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { errorReply, SENTINEL_KEY } from './support/openai-fake-fetch';
import { enabledOpenAI, fakeOpenAI, getStatus, startAiApp, type AiApp } from './support/ai-fakes';
import { OPENAI_DISABLED } from './support/test-config';

describe('GET /api/dev/ai/status (SWR-005B W6)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  it('OpenAI disabled: mock provider, no key, models unchecked, no limit (strict wire schema)', async () => {
    ctx = await startAiApp();
    const res = await getStatus(ctx.app);
    expect(res.status).toBe(200);
    const body = AiDevStatusSchema.parse(res.body);
    expect(body).toEqual({
      openaiEnabled: false,
      provider: 'mock',
      keyConfigured: false,
      models: { strategy: { id: null, available: null }, tactical: { id: null, available: null } },
      budget: {
        budgetKey: 'dev-diagnostics',
        spentUsd: 0,
        spentMicroUsd: 0,
        limitUsd: null,
        limitMicroUsd: null,
        remainingUsd: null,
        remainingMicroUsd: null,
      },
    });
  });

  it('OpenAI disabled but a key is configured: keyConfigured=true, still mock', async () => {
    ctx = await startAiApp({
      openai: {
        enabled: false,
        apiKeyConfigured: true,
        strategyModel: null,
        tacticalModel: 'gpt-6-luna',
        maxCostPerSessionUsd: null,
        timeoutMs: OPENAI_DISABLED.timeoutMs,
        maxRetries: OPENAI_DISABLED.maxRetries,
      },
    });
    const body = AiDevStatusSchema.parse((await getStatus(ctx.app)).body);
    expect(body.keyConfigured).toBe(true);
    expect(body.provider).toBe('mock');
    expect(body.models.tactical).toEqual({ id: 'gpt-6-luna', available: null });
  });

  it('OpenAI enabled (fake fetch): availability via GET /v1/models, cached per process; budget limit', async () => {
    const fake = fakeOpenAI({
      models: { 'gpt-6.1-sol': errorReply(404, { code: 'model_not_found' }) },
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await getStatus(ctx.app);
    expect(res.status).toBe(200);
    const body = AiDevStatusSchema.parse(res.body);
    expect(body.openaiEnabled).toBe(true);
    expect(body.provider).toBe('openai');
    expect(body.keyConfigured).toBe(true);
    expect(body.models).toEqual({
      strategy: { id: 'gpt-6.1-sol', available: false },
      tactical: { id: 'gpt-6-luna', available: true },
    });
    expect(body.budget).toMatchObject({
      spentMicroUsd: 0,
      limitUsd: 0.25,
      limitMicroUsd: usdToMicroUsd(0.25),
      remainingMicroUsd: usdToMicroUsd(0.25),
    });
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL_KEY);
    // second call: served from the availability cache — no new /models requests, never /responses
    await getStatus(ctx.app);
    expect(fake.callsTo('/models/gpt-6-luna')).toHaveLength(1);
    expect(fake.callsTo('/models/gpt-6.1-sol')).toHaveLength(1);
    expect(fake.callsTo('/responses')).toHaveLength(0);
  });

  it('models check network failure → available:null (status still 200, not cached)', async () => {
    const fake = fakeOpenAI({
      models: { 'gpt-6-luna': { kind: 'network-error' }, 'gpt-6.1-sol': { kind: 'network-error' } },
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const body = AiDevStatusSchema.parse((await getStatus(ctx.app)).body);
    expect(body.models.strategy.available).toBeNull();
    expect(body.models.tactical.available).toBeNull();
  });
});
