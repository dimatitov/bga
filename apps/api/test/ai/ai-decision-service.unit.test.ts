/**
 * SWR-005B INTEGRATION (backend-lead): reservation handling of AiDecisionService when the AiUsage row cannot be
 * stored. A possibly paid call that is missing from Σ AiUsage must keep its worst-case hold (never an undercount);
 * a stored row releases the hold. No network: the OpenAI provider and the availability check are in-memory fakes.
 */
import { describe, expect, it } from 'vitest';
import {
  AiDecisionService,
  AiUsageWriteError,
  usageStatusFor,
} from '../../src/ai/ai-decision.service';
import type { NewAiUsageRow } from '../../src/ai/ai-usage.repository';
import {
  aiRuntime,
  emptyUsage,
  type AIDecisionContext,
  type AIProvider,
} from '../../src/ai/ai.types';
import { BudgetService } from '../../src/ai/budget.service';
import type { ModelAvailabilityService } from '../../src/ai/model-availability.service';
import { PRICING_VERSION } from '../../src/ai/pricing';
import { enabledOpenAI } from '../support/openai-fake-fetch';

const KEY = 'dev-diagnostics';

const ctx: AIDecisionContext = {
  budgetKey: KEY,
  role: 'tactical',
  side: 'empire',
  phase: 'command',
  objective: 'test objective',
  availableActions: [
    { id: 'action-1', type: 'MOVE_FLEET' },
    { id: 'action-2', type: 'PASS' },
  ],
};

const paidProvider: AIProvider = {
  id: 'openai',
  makeDecision: () =>
    Promise.resolve({
      selectedActionId: 'action-2',
      reason: 'ok',
      provider: 'openai',
      model: 'gpt-6-luna',
      durationMs: 5,
      attempts: 1,
      usage: { ...emptyUsage(), inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      estimatedCostMicroUsd: 42,
      estimatedCostUsd: 0.000042,
      pricingVersion: PRICING_VERSION,
    }),
};

const unusedMock: AIProvider = {
  id: 'mock',
  makeDecision: () => Promise.reject(new Error('mock must not be called')),
};

const available = {
  requireAvailable: () => Promise.resolve(),
} as unknown as ModelAvailabilityService;

function build(insert: (row: NewAiUsageRow) => Promise<void>) {
  const budget = new BudgetService({ sumCostMicroUsd: () => Promise.resolve(0) });
  const service = new AiDecisionService({
    openai: enabledOpenAI({ maxCostPerSessionUsd: 1 }),
    mock: unusedMock,
    openaiProvider: paidProvider,
    availability: available,
    budget,
    usage: { insert: (row) => insert(row).then(() => ({}) as never) },
    runtime: aiRuntime({ logSink: () => undefined }),
  });
  return { service, budget };
}

describe('AiDecisionService — reservation vs AiUsage write (INTEGRATION seam)', () => {
  it('releases the hold after the row is stored', async () => {
    const rows: NewAiUsageRow[] = [];
    const { service, budget } = build((row) => {
      rows.push(row);
      return Promise.resolve();
    });
    const out = await service.decide(ctx, 'auto');
    expect(out.decision.selectedActionId).toBe('action-2');
    expect(rows).toHaveLength(1);
    expect(budget.heldMicroUsd(KEY)).toBe(0);
  });

  it('keeps the worst-case hold when the row cannot be stored (no undercount)', async () => {
    let calls = 0;
    const { service, budget } = build(() => {
      calls += 1;
      return Promise.reject(new Error('db down'));
    });
    await expect(service.decide(ctx, 'auto')).rejects.toBeInstanceOf(AiUsageWriteError);
    expect(calls).toBe(2); // one retry
    expect(budget.heldMicroUsd(KEY)).toBeGreaterThan(0);
  });
});

describe('usageStatusFor (review F-6)', () => {
  it('maps every decision-path code to its usage status', () => {
    expect(usageStatusFor('AI_INVALID_DECISION')).toBe('invalid_decision');
    expect(usageStatusFor('AI_TIMEOUT')).toBe('timeout');
    expect(usageStatusFor('AI_RATE_LIMITED')).toBe('rate_limited');
    expect(usageStatusFor('AI_PROVIDER_ERROR')).toBe('provider_error');
    expect(usageStatusFor('AI_NOT_CONFIGURED')).toBe('not_configured');
    expect(usageStatusFor('AI_BUDGET_EXCEEDED')).toBe('budget_exceeded');
  });

  it('AI_DEV_FORBIDDEN (dev guard only) is never silently written as a usage status', () => {
    expect(() => usageStatusFor('AI_DEV_FORBIDDEN')).toThrow(/cannot be produced/);
  });
});
