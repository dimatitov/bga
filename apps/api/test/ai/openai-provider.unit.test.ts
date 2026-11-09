/**
 * SWR-005B W4 (plan-backend §4; AC-03, AC-05, AC-06, AC-10): OpenAIProvider on the REAL SDK with a fake fetch —
 * request body per role, the key only in the Authorization header to api.openai.com/v1/responses, usage parsing,
 * malformed / refusal / incomplete / failed, missing usage, retries with summed usage/duration/cost. No network.
 */
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AiFailure, toApiError } from '../../src/ai/ai.errors';
import type { AIDecisionContext, AiRuntime } from '../../src/ai/ai.types';
import { buildPrompt, upperBoundInputTokens } from '../../src/ai/prompt';
import { perAttemptReserveMicroUsd, PRICING_VERSION } from '../../src/ai/pricing';
import { lazyOpenAIClient } from '../../src/ai/providers/openai-client';
import { OpenAIProvider } from '../../src/ai/providers/openai.provider';
import {
  createFakeFetch,
  decisionText,
  enabledOpenAI,
  errorReply,
  okResponse,
  SENTINEL_KEY,
  type FakeHandler,
} from '../support/openai-fake-fetch';

const OBJECTIVE = 'Strengthen control OBJECTIVE-SENTINEL';
const CTX: AIDecisionContext = {
  budgetKey: 'dev-diagnostics',
  role: 'tactical',
  side: 'side-b',
  phase: 'command',
  objective: OBJECTIVE,
  availableActions: [
    { id: 'action-1', type: 'MOVE_FLEET', target: 'corellia' },
    { id: 'action-2', type: 'RECRUIT', target: 'coruscant' },
    { id: 'action-3', type: 'PASS' },
  ],
};
const IDS = CTX.availableActions.map((a) => a.id);
const REASON_SENTINEL = 'Improves strategic positioning REASON-SENTINEL';

function setup(handler: FakeHandler, cfg: Parameters<typeof enabledOpenAI>[0] = {}) {
  const fake = createFakeFetch(handler);
  const openai = enabledOpenAI(cfg);
  const logs: string[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const runtime: AiRuntime = {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    monotonicNow: () => (clock += 100),
    logSink: (line) => logs.push(line),
  };
  const notFound: string[] = [];
  const provider = new OpenAIProvider({
    openai,
    client: lazyOpenAIClient({ openai, nodeEnv: 'test', fetch: fake.fetch }),
    runtime,
    onModelNotFound: (m) => notFound.push(m),
  });
  return { fake, provider, logs, sleeps, notFound, openai };
}

async function failure(p: Promise<unknown>): Promise<AiFailure> {
  const err = await p.then(
    () => {
      throw new Error('expected failure');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AiFailure);
  return err as AiFailure;
}

function expectNoSecrets(texts: string[]): void {
  for (const t of texts) {
    expect(t).not.toContain(SENTINEL_KEY);
    expect(t).not.toContain('OBJECTIVE-SENTINEL');
    expect(t).not.toContain('REASON-SENTINEL');
    expect(t).not.toContain('upstream said');
  }
}

const perAttemptTactical = perAttemptReserveMicroUsd(
  'gpt-6-luna',
  upperBoundInputTokens(buildPrompt(CTX), IDS),
  400,
)!;

describe('OpenAIProvider — request', () => {
  it('tactical: luna, effort none, 400 tokens, strict schema with enum, store false, no temperature', async () => {
    const { fake, provider } = setup(() =>
      okResponse({ text: decisionText('action-2', REASON_SENTINEL) }),
    );
    await provider.makeDecision(CTX);
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/responses');
    expect(call.method).toBe('POST');
    expect(call.headers.get('authorization')).toBe(`Bearer ${SENTINEL_KEY}`);
    const body = call.body as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      reasoning: { effort: 'none' },
      max_output_tokens: 400,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_decision',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['selectedActionId', 'reason'],
            properties: { selectedActionId: { enum: IDS } },
          },
        },
      },
    });
    expect(Object.keys(body).sort()).toEqual(
      ['input', 'instructions', 'max_output_tokens', 'model', 'reasoning', 'store', 'text'].sort(),
    );
    for (const k of [
      'temperature',
      'top_p',
      'tools',
      'metadata',
      'user',
      'safety_identifier',
      'previous_response_id',
    ]) {
      expect(body).not.toHaveProperty(k);
    }
    expect(body.input).toBe(buildPrompt(CTX).input);
    // The key never appears in the request body or in any header other than Authorization.
    expect(JSON.stringify(body)).not.toContain(SENTINEL_KEY);
    for (const [name, value] of call.headers) {
      if (name !== 'authorization') expect(value).not.toContain(SENTINEL_KEY);
    }
    expect(JSON.stringify(body)).not.toContain('dev-diagnostics');
  });

  it('strategy: sol, effort low, 1600 tokens', async () => {
    const { fake, provider } = setup(() => okResponse({ text: decisionText('action-1') }));
    await provider.makeDecision({ ...CTX, role: 'strategy' });
    expect(fake.calls[0]!.body).toMatchObject({
      model: 'gpt-6.1-sol',
      reasoning: { effort: 'low' },
      max_output_tokens: 1600,
      store: false,
    });
  });

  it('unknown pricing → AI_NOT_CONFIGURED aiPricingUnknown with zero fetch calls', async () => {
    const { fake, provider } = setup(() => okResponse({ text: decisionText('action-1') }), {
      tacticalModel: 'gpt-unpriced',
    });
    const f = await failure(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_NOT_CONFIGURED');
    expect(f.messageKey).toBe('errors.aiPricingUnknown');
    expect(f.attempts).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('OpenAIProvider — response parsing', () => {
  it('happy path: decision as returned, usage with cached/reasoning, cost by configured model, model snapshot', async () => {
    const { provider, logs } = setup(() =>
      okResponse({
        model: 'gpt-6-luna-2026-10-01',
        text: decisionText('action-2', REASON_SENTINEL),
        usage: { input: 1000, cached: 400, output: 100, reasoning: 0, total: 1100 },
      }),
    );
    const r = await provider.makeDecision(CTX);
    expect(r).toEqual({
      selectedActionId: 'action-2',
      reason: REASON_SENTINEL,
      provider: 'openai',
      model: 'gpt-6-luna-2026-10-01',
      durationMs: 100,
      attempts: 1,
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 400,
        outputTokens: 100,
        reasoningTokens: 0,
        totalTokens: 1100,
      },
      // 600 × 0.1 + 400 × 0.01 + 100 × 0.5 = 60 + 4 + 50
      estimatedCostMicroUsd: 114,
      estimatedCostUsd: 0.000114,
      pricingVersion: PRICING_VERSION,
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(
      /^ai\.attempt provider=openai model=gpt-6-luna role=tactical attempt=1\/3 outcome=ok /,
    );
    expect(logs[0]).toContain('requestId=-');
    expect(logs[1]).toMatch(
      /^ai\.decision .* outcome=ok .* costUsd=0\.000114 budgetKey=dev-diagnostics$/,
    );
    expectNoSecrets(logs);
  });

  it('reasoning tokens are reported but not billed twice (strategy)', async () => {
    const { provider } = setup(() =>
      okResponse({
        text: decisionText('action-1'),
        usage: { input: 1000, output: 300, reasoning: 250 },
      }),
    );
    const r = await provider.makeDecision({ ...CTX, role: 'strategy' });
    expect(r.usage.reasoningTokens).toBe(250);
    expect(r.estimatedCostMicroUsd).toBe(1000 * 2 + 300 * 10);
  });

  it('passes the id as returned (membership is the service validator job)', async () => {
    // A strict schema forbids it, but if the model returned it the provider does not decide.
    const { provider } = setup(() => okResponse({ text: decisionText('action-9') }));
    expect((await provider.makeDecision(CTX)).selectedActionId).toBe('action-9');
  });

  const invalid: Array<[string, Parameters<typeof okResponse>[0], string]> = [
    ['not JSON', { text: 'I pick action-1' }, 'malformed'],
    ['JSON array', { text: '["action-1"]' }, 'malformed'],
    ['missing reason', { text: '{"selectedActionId":"action-1"}' }, 'malformed'],
    ['no output_text', {}, 'malformed'],
    ['extra field', { text: '{"selectedActionId":"action-1","reason":"r","x":1}' }, 'schema'],
    ['refusal', { refusal: `cannot ${REASON_SENTINEL}` }, 'refusal'],
    ['incomplete', { status: 'incomplete', text: '{"selectedAct' }, 'incomplete'],
  ];
  for (const [name, init, reason] of invalid) {
    it(`${name} → AI_INVALID_DECISION (${reason}), not retried, cost counted`, async () => {
      const { fake, provider, logs } = setup(() =>
        okResponse({ ...init, usage: { input: 1000, output: 100 } }),
      );
      const f = await failure(provider.makeDecision(CTX));
      expect(f.code).toBe('AI_INVALID_DECISION');
      expect(f.reason).toBe(reason);
      expect(f.attempts).toBe(1);
      expect(fake.calls).toHaveLength(1);
      expect(f.costMicroUsd).toBe(150);
      expect(f.usage.inputTokens).toBe(1000);
      const body = toApiError(f).toBody();
      expect(body).toEqual({
        code: 'AI_INVALID_DECISION',
        messageKey: 'errors.aiInvalidDecision',
        details: { attempts: 1, reason, estimatedCostUsd: 0.00015, estimatedCostMicroUsd: 150 },
      });
      expectNoSecrets([...logs, JSON.stringify(body), inspect(f), f.message]);
    });
  }

  it("status 'failed' → AI_PROVIDER_ERROR upstream, not retried", async () => {
    const { fake, provider } = setup(() =>
      okResponse({ status: 'failed', text: decisionText('action-1') }),
    );
    const f = await failure(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_PROVIDER_ERROR');
    expect(f.reason).toBe('upstream');
    expect(fake.calls).toHaveLength(1);
  });

  it('no usage block → tokens 0, cost = worst case of one attempt', async () => {
    const { provider } = setup(() => okResponse({ text: decisionText('action-1'), usage: null }));
    const r = await provider.makeDecision(CTX);
    expect(r.usage).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null,
      totalTokens: 0,
    });
    expect(r.estimatedCostMicroUsd).toBe(perAttemptTactical);
    expect(perAttemptTactical).toBeGreaterThan(0);
  });
});

describe('OpenAIProvider — retries', () => {
  it('500, 429 then ok → 3 attempts, usage/duration/cost summed, backoff via injected sleep', async () => {
    const { fake, provider, sleeps, logs } = setup((_req, i) =>
      i === 0
        ? errorReply(500)
        : i === 1
          ? errorReply(429, {}, { 'retry-after-ms': '1200' })
          : okResponse({ text: decisionText('action-3'), usage: { input: 1000, output: 100 } }),
    );
    const r = await provider.makeDecision(CTX);
    expect(fake.callsTo('/responses')).toHaveLength(3);
    expect(r.attempts).toBe(3);
    expect(r.durationMs).toBe(300);
    expect(r.estimatedCostMicroUsd).toBe(150); // failed 5xx / 429 attempts cost 0
    expect(sleeps).toEqual([375, 1200]); // 500 × (0.5 + 0.5·0.5), then Retry-After
    expect(logs.filter((l) => l.startsWith('ai.attempt'))).toHaveLength(3);
    expect(logs[0]).toMatch(
      /outcome=retry code=AI_PROVIDER_ERROR httpStatus=500 sdkError=InternalServerError/,
    );
    expect(logs[0]).toContain('requestId=req_err_1');
    expect(logs[1]).toMatch(/outcome=retry code=AI_RATE_LIMITED httpStatus=429/);
    expectNoSecrets(logs);
  });

  it('timeouts until exhausted → AI_TIMEOUT, attempts = maxRetries + 1, each timeout billed as worst case', async () => {
    const { fake, provider } = setup(() => ({ kind: 'hang' }), { timeoutMs: 20, maxRetries: 2 });
    const f = await failure(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_TIMEOUT');
    expect(f.attempts).toBe(3);
    expect(fake.calls).toHaveLength(3);
    expect(f.costMicroUsd).toBe(perAttemptTactical * 3);
    expect(f.durationMs).toBe(300);
    expect(toApiError(f).toBody()).toEqual({
      code: 'AI_TIMEOUT',
      messageKey: 'errors.aiTimeout',
      details: { attempts: 3 },
    });
    expect(toApiError(f).status).toBe(504);
  });

  it('network errors until exhausted → each attempt billed as worst case (review F-2: request may have been sent)', async () => {
    const { fake, provider, logs } = setup(() => ({ kind: 'network-error' }), { maxRetries: 2 });
    const f = await failure(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_PROVIDER_ERROR');
    expect(f.reason).toBe('network');
    expect(f.attempts).toBe(3);
    expect(fake.calls).toHaveLength(3);
    expect(perAttemptTactical).toBeGreaterThan(0);
    expect(f.costMicroUsd).toBe(perAttemptTactical * 3);
    const attemptLines = logs.filter((l) => l.startsWith('ai.attempt'));
    expect(attemptLines).toHaveLength(3);
    for (const line of attemptLines) {
      expect(line).toContain(`costUsd=${(perAttemptTactical / 1_000_000).toFixed(6)}`);
    }
    expectNoSecrets(logs);
  });

  it('network error, then ok → the failed attempt is billed as worst case on top of the real cost', async () => {
    const { provider } = setup((_req, i) =>
      i === 0
        ? { kind: 'network-error' }
        : okResponse({ text: decisionText('action-1'), usage: { input: 1000, output: 100 } }),
    );
    const r = await provider.makeDecision(CTX);
    expect(r.attempts).toBe(2);
    expect(r.estimatedCostMicroUsd).toBe(perAttemptTactical + 150);
  });

  it('maxRetries 0 → a single attempt', async () => {
    const { fake, provider } = setup(() => ({ kind: 'network-error' }), { maxRetries: 0 });
    const f = await failure(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_PROVIDER_ERROR');
    expect(f.reason).toBe('network');
    expect(f.attempts).toBe(1);
    expect(fake.calls).toHaveLength(1);
  });

  it('invalid decision after a retry: usage summed over attempts, no further retry', async () => {
    const { fake, provider } = setup((_r, i) =>
      i === 0 ? errorReply(502) : okResponse({ text: 'nope', usage: { input: 10, output: 2 } }),
    );
    const f = await failure(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_INVALID_DECISION');
    expect(f.attempts).toBe(2);
    expect(fake.calls).toHaveLength(2);
    expect(f.usage.inputTokens).toBe(10);
  });

  it('429 insufficient_quota → no retry, errors.aiQuota', async () => {
    const { fake, provider } = setup(() => errorReply(429, { code: 'insufficient_quota' }));
    const f = await failure(provider.makeDecision(CTX));
    expect(f.messageKey).toBe('errors.aiQuota');
    expect(fake.calls).toHaveLength(1);
  });

  it('429 with Retry-After > 10 s → no retry, retryAfterSeconds in details', async () => {
    const { fake, provider, sleeps } = setup(() => errorReply(429, {}, { 'retry-after': '30' }));
    const f = await failure(provider.makeDecision(CTX));
    expect(fake.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(toApiError(f).toBody().details).toEqual({ attempts: 1, retryAfterSeconds: 30 });
  });

  it('401 → AI_NOT_CONFIGURED aiKeyRejected, no retry; 404 → invalidates availability', async () => {
    const a = setup(() => errorReply(401));
    const f = await failure(a.provider.makeDecision(CTX));
    expect(f.messageKey).toBe('errors.aiKeyRejected');
    expect(a.fake.calls).toHaveLength(1);
    expectNoSecrets([JSON.stringify(toApiError(f).toBody()), inspect(f), ...a.logs]);

    const b = setup(() => errorReply(404));
    const g = await failure(b.provider.makeDecision(CTX));
    expect(g.messageKey).toBe('errors.aiModelUnavailable');
    expect(b.notFound).toEqual(['gpt-6-luna']);
  });
});
