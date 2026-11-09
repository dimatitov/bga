/**
 * SWR-005B W6 — the OpenAI path end to end through HTTP with the REAL SDK and a fake fetch (plan-backend §4–§6;
 * AC-02, AC-03, AC-04, AC-06). Never the network; the key is a sentinel.
 */
import { AiTestDecisionResponseSchema, ERROR_MESSAGE_KEYS } from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { estimateCostMicroUsd, PRICING_VERSION } from '../src/ai/pricing';
import { expectError } from './support/fixtures';
import { decisionText, errorReply, okResponse, SENTINEL_KEY } from './support/openai-fake-fetch';
import {
  decisionBody,
  enabledOpenAI,
  fakeOpenAI,
  postDecision,
  rowsOf,
  startAiApp,
  type AiApp,
} from './support/ai-fakes';

describe('POST /api/dev/ai/test-decision — OpenAI via fake fetch (SWR-005B W6)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  it('happy path: tokens, cost by the configured tariff, model from the response, row + budget spent', async () => {
    const fake = fakeOpenAI({
      responses: [
        okResponse({
          text: decisionText('action-2', '  Improves strategic positioning  '),
          usage: { input: 1200, cached: 200, output: 80, reasoning: 0 },
          model: 'gpt-6-luna-2026-10-01',
        }),
      ],
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    expect(res.status).toBe(200);
    const body = AiTestDecisionResponseSchema.parse(res.body);
    const cost = estimateCostMicroUsd('gpt-6-luna', {
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 80,
    });
    expect(cost).not.toBeNull();
    expect(body.decision).toMatchObject({
      selectedActionId: 'action-2',
      reason: 'Improves strategic positioning',
      provider: 'openai',
      model: 'gpt-6-luna-2026-10-01',
      attempts: 1,
      usage: {
        inputTokens: 1200,
        cachedInputTokens: 200,
        outputTokens: 80,
        reasoningTokens: 0,
        totalTokens: 1280,
      },
      estimatedCostMicroUsd: cost,
      estimatedCostUsd: (cost ?? 0) / 1_000_000,
      pricingVersion: PRICING_VERSION,
    });
    expect(body.budget.spentMicroUsd).toBe(cost);
    expect(body.budget.remainingMicroUsd).toBe(250_000 - (cost ?? 0));

    // request: tactical model, availability checked first, one paid call, key only in Authorization
    expect(fake.callsTo('/models/gpt-6-luna')).toHaveLength(1);
    const calls = fake.callsTo('/responses');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ model: 'gpt-6-luna', store: false });
    expect(JSON.stringify(calls[0]?.body)).not.toContain(SENTINEL_KEY);
    expect(JSON.stringify(calls[0]?.body)).not.toContain('dev-diagnostics');
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${SENTINEL_KEY}`);

    const rows = await rowsOf(ctx.app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna', // configured id, not the snapshot
      status: 'ok',
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 80,
      reasoningTokens: 0,
      estimatedCostMicroUsd: cost,
    });
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL_KEY);
  });

  it('role strategy → the strategy model', async () => {
    const fake = fakeOpenAI();
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app, decisionBody({ role: 'strategy' }));
    expect(res.status).toBe(200);
    expect(fake.callsTo('/responses')[0]?.body).toMatchObject({ model: 'gpt-6.1-sol' });
    expect((await rowsOf(ctx.app))[0]).toMatchObject({ role: 'strategy', model: 'gpt-6.1-sol' });
  });

  it('unknown tariff → 503 aiPricingUnknown and ZERO fetch calls; row not_configured', async () => {
    const fake = fakeOpenAI();
    ctx = await startAiApp({ openai: enabledOpenAI({ tacticalModel: 'gpt-unknown-1' }), fake });
    const res = await postDecision(ctx.app);
    const body = expectError(res, 503, 'AI_NOT_CONFIGURED', ERROR_MESSAGE_KEYS.aiPricingUnknown);
    expect(body.error.details).toEqual({ role: 'tactical', model: 'gpt-unknown-1' });
    expect(fake.calls).toHaveLength(0);
    expect((await rowsOf(ctx.app))[0]).toMatchObject({
      status: 'not_configured',
      attempts: 0,
      estimatedCostMicroUsd: 0,
    });
  });

  it('models.retrieve 404 → 503 aiModelUnavailable and no /responses call', async () => {
    const fake = fakeOpenAI({
      models: { 'gpt-6-luna': errorReply(404, { code: 'model_not_found' }) },
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    expectError(res, 503, 'AI_NOT_CONFIGURED', ERROR_MESSAGE_KEYS.aiModelUnavailable);
    expect(fake.callsTo('/responses')).toHaveLength(0);
  });

  it('models.retrieve 401 → 503 aiKeyRejected, no paid call; the upstream message never leaks', async () => {
    const fake = fakeOpenAI({ models: { 'gpt-6-luna': errorReply(401) } });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    expectError(res, 503, 'AI_NOT_CONFIGURED', ERROR_MESSAGE_KEYS.aiKeyRejected);
    expect(fake.callsTo('/responses')).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL_KEY);
  });

  it('responses 401 → 503 aiKeyRejected, not retried', async () => {
    const fake = fakeOpenAI({ responses: [errorReply(401)] });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    expectError(res, 503, 'AI_NOT_CONFIGURED', ERROR_MESSAGE_KEYS.aiKeyRejected);
    expect(fake.callsTo('/responses')).toHaveLength(1);
  });

  it('models check network failure → 502 AI_PROVIDER_ERROR network, no paid call', async () => {
    const fake = fakeOpenAI({ models: { 'gpt-6-luna': { kind: 'network-error' } } });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    const body = expectError(res, 502, 'AI_PROVIDER_ERROR');
    expect(body.error.details).toEqual({ attempts: 0, reason: 'network' });
    expect(fake.callsTo('/responses')).toHaveLength(0);
  });

  it('incomplete → 502 AI_INVALID_DECISION with the cost; the cost is accounted', async () => {
    const fake = fakeOpenAI({
      responses: [okResponse({ status: 'incomplete', usage: { input: 900, output: 400 } })],
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    const body = expectError(res, 502, 'AI_INVALID_DECISION');
    const cost = estimateCostMicroUsd('gpt-6-luna', {
      inputTokens: 900,
      cachedInputTokens: 0,
      outputTokens: 400,
    });
    expect(body.error.details).toEqual({
      attempts: 1,
      reason: 'incomplete',
      estimatedCostUsd: (cost ?? 0) / 1_000_000,
      estimatedCostMicroUsd: cost,
    });
    expect((await rowsOf(ctx.app))[0]).toMatchObject({
      status: 'invalid_decision',
      estimatedCostMicroUsd: cost,
      outputTokens: 400,
    });
  });

  it('a model id outside the list → 502 not_in_actions with summed usage/cost (validated by the service)', async () => {
    // The strict schema enum should prevent it; the service still rejects it (AC-04).
    const fake = fakeOpenAI({
      responses: [
        okResponse({ text: decisionText('action-99'), usage: { input: 500, output: 30 } }),
      ],
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    const body = expectError(res, 502, 'AI_INVALID_DECISION');
    expect(body.error.details).toMatchObject({ attempts: 1, reason: 'not_in_actions' });
    expect((await rowsOf(ctx.app))[0]).toMatchObject({
      status: 'invalid_decision',
      inputTokens: 500,
    });
  });

  it('upstream 429 with retry-after > 10 s → 429 at once, Retry-After header + details.retryAfterSeconds', async () => {
    const fake = fakeOpenAI({
      responses: [errorReply(429, { type: 'rate_limit_exceeded' }, { 'retry-after': '60' })],
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    const body = expectError(res, 429, 'AI_RATE_LIMITED', ERROR_MESSAGE_KEYS.aiRateLimited);
    expect(body.error.details).toEqual({ attempts: 1, retryAfterSeconds: 60 });
    expect(res.headers['retry-after']).toBe('60');
    expect(fake.callsTo('/responses')).toHaveLength(1);
  });

  it('5xx, 5xx, ok → 200 attempts 3, usage of the successful attempt', async () => {
    const fake = fakeOpenAI({
      responses: [errorReply(500), errorReply(503), okResponse({ text: decisionText('action-3') })],
    });
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app);
    expect(res.status).toBe(200);
    expect(res.body.decision).toMatchObject({ attempts: 3, selectedActionId: 'action-3' });
    expect(ctx.delays).toHaveLength(2);
  });
});
