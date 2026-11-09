/**
 * SWR-005B W4 (plan-backend §5.8; AC-03, AC-05): MockAIProvider — deterministic first action, free, every scripted
 * step, retries through the same loop as OpenAI.
 */
import { describe, expect, it } from 'vitest';
import { AiFailure } from '../../src/ai/ai.errors';
import {
  MOCK_STEPS,
  type AIDecisionContext,
  type AiRuntime,
  type MockStep,
} from '../../src/ai/ai.types';
import { validateDecision } from '../../src/ai/decision-validator';
import { PRICING_VERSION } from '../../src/ai/pricing';
import {
  MOCK_INVALID_ACTION_ID,
  MOCK_MODEL_ID,
  MOCK_REASON,
  MockAIProvider,
} from '../../src/ai/providers/mock.provider';

const CTX: AIDecisionContext = {
  budgetKey: 'dev-diagnostics',
  role: 'tactical',
  side: 'side-a',
  phase: 'command',
  objective: 'OBJECTIVE-SENTINEL',
  availableActions: [
    { id: 'action-1', type: 'MOVE_FLEET', target: 'x' },
    { id: 'action-2', type: 'PASS' },
  ],
};

function mock(script?: MockStep[], maxRetries = 2) {
  const logs: string[] = [];
  const sleeps: number[] = [];
  const runtime: AiRuntime = {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    monotonicNow: () => 0,
    logSink: (l) => logs.push(l),
  };
  return { provider: new MockAIProvider({ runtime, maxRetries, script }), logs, sleeps };
}

async function fail(p: Promise<unknown>): Promise<AiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AiFailure);
  return e as AiFailure;
}

describe('MockAIProvider', () => {
  it('deterministic: always the first action, zero usage and cost', async () => {
    const { provider, logs } = mock();
    const a = await provider.makeDecision(CTX);
    const b = await provider.makeDecision({ ...CTX, role: 'strategy' });
    expect(a).toEqual({
      selectedActionId: 'action-1',
      reason: MOCK_REASON,
      provider: 'mock',
      model: MOCK_MODEL_ID,
      durationMs: 0,
      attempts: 1,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        totalTokens: 0,
      },
      estimatedCostMicroUsd: 0,
      estimatedCostUsd: 0,
      pricingVersion: PRICING_VERSION,
    });
    expect(b.selectedActionId).toBe('action-1');
    expect(MOCK_MODEL_ID).toBe('mock-deterministic-v1');
    expect(
      validateDecision({ selectedActionId: a.selectedActionId, reason: a.reason }, [
        'action-1',
        'action-2',
      ]).ok,
    ).toBe(true);
    for (const l of logs) expect(l).not.toContain('OBJECTIVE-SENTINEL');
    expect(logs.some((l) => l.startsWith('ai.decision provider=mock'))).toBe(true);
  });

  it('invalid-action → an id outside the list (the validator rejects it)', async () => {
    const { provider } = mock(['invalid-action']);
    const r = await provider.makeDecision(CTX);
    expect(r.selectedActionId).toBe(MOCK_INVALID_ACTION_ID);
    expect(
      validateDecision({ selectedActionId: r.selectedActionId, reason: r.reason }, [
        'action-1',
        'action-2',
      ]),
    ).toEqual({
      ok: false,
      reason: 'not_in_actions',
    });
  });

  it('malformed → AI_INVALID_DECISION malformed, one attempt', async () => {
    const { provider, sleeps } = mock(['malformed']);
    const f = await fail(provider.makeDecision(CTX));
    expect(f.code).toBe('AI_INVALID_DECISION');
    expect(f.reason).toBe('malformed');
    expect(f.attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  const transport: Array<[MockStep, string, string | undefined]> = [
    ['timeout', 'AI_TIMEOUT', undefined],
    ['rate-limit', 'AI_RATE_LIMITED', undefined],
    ['network', 'AI_PROVIDER_ERROR', 'network'],
    ['server-error', 'AI_PROVIDER_ERROR', 'upstream'],
  ];
  for (const [step, code, reason] of transport) {
    it(`${step} repeated → ${code} after maxRetries + 1 attempts`, async () => {
      const { provider, sleeps, logs } = mock([step], 2);
      const f = await fail(provider.makeDecision(CTX));
      expect(f.code).toBe(code);
      expect(f.reason).toBe(reason);
      expect(f.attempts).toBe(3);
      expect(f.costMicroUsd).toBe(0);
      expect(sleeps).toHaveLength(2);
      expect(logs.filter((l) => l.startsWith('ai.attempt'))).toHaveLength(3);
    });
  }

  it('timeout, ok → success on attempt 2; the last step repeats', async () => {
    const { provider } = mock(['timeout', 'ok']);
    const r = await provider.makeDecision(CTX);
    expect(r.attempts).toBe(2);
    expect(r.selectedActionId).toBe('action-1');
    expect(provider.stepFor(1)).toBe('timeout');
    expect(provider.stepFor(2)).toBe('ok');
    expect(provider.stepFor(9)).toBe('ok');
  });

  it('maxRetries 0 → single attempt', async () => {
    const { provider } = mock(['timeout'], 0);
    expect((await fail(provider.makeDecision(CTX))).attempts).toBe(1);
  });

  it('every step is covered', () => {
    expect([...MOCK_STEPS].sort()).toEqual([
      'invalid-action',
      'malformed',
      'network',
      'ok',
      'rate-limit',
      'server-error',
      'timeout',
    ]);
  });
});
