/**
 * SWR-005B INTEGRATION (backend-lead): reservation handling of AiDecisionService when the AiUsage row cannot be
 * stored. A possibly paid call that is missing from Σ AiUsage must keep its worst-case hold (never an undercount);
 * a stored row releases the hold. No network: the OpenAI provider and the availability check are in-memory fakes.
 *
 * SWR-008 W6a (plan-backend §4.3, §5; TC-BUD-01/10, TC-COST-01/02/05 unit part, QD-11): the reservation is computed from
 * the full prompt (rules block included), every row carries the rules accounting and the prompt's upper bound, a budget
 * shortfall stays AI_BUDGET_EXCEEDED (rules are never removed to save money), malformed rules → VALIDATION.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/common/api-error';
import { AiFailure } from '../../src/ai/ai.errors';
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
import { ROLE_DEFAULTS } from '../../src/ai/model-roles';
import { PRICING_VERSION, worstCaseReserveMicroUsd } from '../../src/ai/pricing';
import { promptUpperBound } from '../../src/ai/prompt-fit';
import { clampMaxRetries } from '../../src/ai/retry';
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

// ---- SWR-008 W6a ----

const RULES_TEXT =
  '[fake:impl.engine-scope] Engine scope: only moves and passing are implemented. (RR p.1)\n' +
  '[fake:turn.pass] Passing: a side that passes takes no more turns this round. (RR p.4)';
const RULE_IDS = ['fake:impl.engine-scope', 'fake:turn.pass'];
const VERSION = 'fake@1:0123456789ab';

const commanderOff: AIDecisionContext = {
  budgetKey: 'session-1',
  role: 'tactical',
  side: 'side-a',
  phase: 'command',
  objective: 'test objective',
  purpose: 'commander',
  situation: 'Round 1.',
  availableActions: [
    { id: 'action-1', type: 'MOVE_FLEET', summary: 'Move.' },
    { id: 'action-2', type: 'PASS', summary: 'Pass.' },
  ],
  rulesAccounting: {
    enabled: false,
    rulesVersion: null,
    ruleIds: [],
    chars: 0,
    truncated: false,
    dropped: false,
  },
};

const commanderOn: AIDecisionContext = {
  ...commanderOff,
  rules: { text: RULES_TEXT, ruleIds: RULE_IDS, rulesVersion: VERSION, truncated: true },
  rulesAccounting: {
    enabled: true,
    rulesVersion: VERSION,
    ruleIds: RULE_IDS,
    chars: RULES_TEXT.length,
    truncated: true,
    dropped: false,
  },
};

const RULES_ON_COLUMNS = {
  rulesEnabled: true,
  rulesVersion: VERSION,
  rulesIds: RULE_IDS,
  rulesChars: RULES_TEXT.length,
  rulesTokensEstimate: Math.ceil(RULES_TEXT.length / 4),
  rulesTruncated: true,
  rulesDropped: false,
};

const RULES_OFF_COLUMNS = {
  rulesEnabled: false,
  rulesVersion: null,
  rulesIds: [],
  rulesChars: 0,
  rulesTokensEstimate: 0,
  rulesTruncated: false,
  rulesDropped: false,
};

interface Rig {
  service: AiDecisionService;
  rows: NewAiUsageRow[];
  reserves: number[];
  providerCalls: AIDecisionContext[];
}

function rig(
  opts: {
    provider?: (ctx: AIDecisionContext) => ReturnType<AIProvider['makeDecision']>;
    spentMicroUsd?: number;
    maxCostPerSessionUsd?: number;
  } = {},
): Rig {
  const rows: NewAiUsageRow[] = [];
  const reserves: number[] = [];
  const providerCalls: AIDecisionContext[] = [];
  const budget = new BudgetService({
    sumCostMicroUsd: () => Promise.resolve(opts.spentMicroUsd ?? 0),
  });
  const reserve = budget.reserve.bind(budget);
  budget.reserve = (key, amount, limit) => {
    reserves.push(amount);
    return reserve(key, amount, limit);
  };
  const call = opts.provider ?? ((c: AIDecisionContext) => paidProvider.makeDecision(c));
  const openai: AIProvider = {
    id: 'openai',
    makeDecision: (c) => {
      providerCalls.push(c);
      return call(c);
    },
  };
  const mock: AIProvider = {
    id: 'mock',
    makeDecision: (c) => {
      providerCalls.push(c);
      return Promise.resolve({
        selectedActionId: 'action-1',
        reason: 'mock',
        provider: 'mock',
        model: 'mock-deterministic-v1',
        durationMs: 1,
        attempts: 1,
        usage: emptyUsage(),
        estimatedCostMicroUsd: 0,
        estimatedCostUsd: 0,
        pricingVersion: PRICING_VERSION,
      });
    },
  };
  const service = new AiDecisionService({
    openai: enabledOpenAI({ maxCostPerSessionUsd: opts.maxCostPerSessionUsd ?? 1 }),
    mock,
    openaiProvider: openai,
    availability: available,
    budget,
    usage: {
      insert: (row) => {
        rows.push(row);
        return Promise.resolve({} as never);
      },
    },
    runtime: aiRuntime({ logSink: () => undefined }),
  });
  return { service, rows, reserves, providerCalls };
}

describe('SWR-008: budget reservation with the rules block (TC-BUD-01, §4.3)', () => {
  it('reserve = worst case of the FULL prompt (rules included); with rules > without', async () => {
    const off = rig();
    const on = rig();
    await off.service.decide(commanderOff, 'auto');
    await on.service.decide(commanderOn, 'auto');
    const expected = (c: AIDecisionContext) =>
      worstCaseReserveMicroUsd(
        'gpt-6-luna',
        promptUpperBound(c),
        ROLE_DEFAULTS.tactical.maxOutputTokens,
        clampMaxRetries(2),
      );
    expect(off.reserves).toEqual([expected(commanderOff)]);
    expect(on.reserves).toEqual([expected(commanderOn)]);
    expect(on.reserves[0]!).toBeGreaterThan(off.reserves[0]!);
    // the model got the rules block (the provider builds the prompt from this context)
    expect(on.providerCalls[0]?.rules?.text).toBe(RULES_TEXT);
  });

  it('QD-11: budget covers the prompt without rules but not with them → AI_BUDGET_EXCEEDED, rules not removed', async () => {
    const offReserve = worstCaseReserveMicroUsd(
      'gpt-6-luna',
      promptUpperBound(commanderOff),
      ROLE_DEFAULTS.tactical.maxOutputTokens,
      clampMaxRetries(2),
    )!;
    const onReserve = worstCaseReserveMicroUsd(
      'gpt-6-luna',
      promptUpperBound(commanderOn),
      ROLE_DEFAULTS.tactical.maxOutputTokens,
      clampMaxRetries(2),
    )!;
    const limit = 1_000_000; // maxCostPerSessionUsd 1
    // remaining sits between the two reservations
    const spent = limit - Math.floor((offReserve + onReserve) / 2);
    const withRules = rig({ spentMicroUsd: spent });
    const err = await withRules.service.decide(commanderOn, 'auto').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiFailure);
    expect((err as AiFailure).code).toBe('AI_BUDGET_EXCEEDED');
    expect(withRules.providerCalls).toEqual([]);
    expect(withRules.rows).toHaveLength(1);
    expect(withRules.rows[0]).toMatchObject({
      status: 'budget_exceeded',
      attempts: 0,
      estimatedCostMicroUsd: 0,
      ...RULES_ON_COLUMNS,
      promptTokensUpperBound: promptUpperBound(commanderOn),
    });
    // the same budget is enough without rules: the limit itself is unchanged, nothing was "saved" by dropping rules
    const withoutRules = rig({ spentMicroUsd: spent });
    await expect(withoutRules.service.decide(commanderOff, 'auto')).resolves.toBeDefined();
    expect(withoutRules.service.limitMicroUsd()).toBe(limit);
    expect(withRules.service.limitMicroUsd()).toBe(limit);
  });
});

describe('SWR-008: AiUsage rows carry the rules accounting (TC-COST-01/02/05 unit part)', () => {
  it('ok row: rules columns + promptTokensUpperBound + actual usage/cost', async () => {
    const r = rig();
    await r.service.decide(commanderOn, 'auto');
    expect(r.rows).toEqual([
      {
        budgetKey: 'session-1',
        provider: 'openai',
        model: 'gpt-6-luna',
        role: 'tactical',
        status: 'ok',
        attempts: 1,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 10,
        reasoningTokens: null,
        estimatedCostMicroUsd: 42,
        pricingVersion: PRICING_VERSION,
        durationMs: 5,
        errorCode: null,
        ...RULES_ON_COLUMNS,
        promptTokensUpperBound: promptUpperBound(commanderOn),
      },
    ]);
  });

  it('rules off: off columns; dropped by the prompt limit: enabled, 0 ids, dropped=true, version kept', async () => {
    const r = rig();
    await r.service.decide(commanderOff, 'auto');
    const dropped: AIDecisionContext = {
      ...commanderOff,
      rulesAccounting: {
        enabled: true,
        rulesVersion: VERSION,
        ruleIds: [],
        chars: 0,
        truncated: false,
        dropped: true,
      },
    };
    await r.service.decide(dropped, 'auto');
    expect(r.rows[0]).toMatchObject({
      ...RULES_OFF_COLUMNS,
      promptTokensUpperBound: promptUpperBound(commanderOff),
    });
    expect(r.rows[1]).toMatchObject({
      rulesEnabled: true,
      rulesVersion: VERSION,
      rulesIds: [],
      rulesChars: 0,
      rulesTokensEstimate: 0,
      rulesTruncated: false,
      rulesDropped: true,
      promptTokensUpperBound: promptUpperBound(commanderOff),
    });
  });

  it('TC-COST-05: failed calls (invalid id, timeout) keep the rules metadata and their cost', async () => {
    const invalid = rig({
      provider: () =>
        paidProvider
          .makeDecision(commanderOn)
          .then((d) => ({ ...d, selectedActionId: '[fake:turn.pass]' })),
    });
    await expect(invalid.service.decide(commanderOn, 'auto')).rejects.toMatchObject({
      code: 'AI_INVALID_DECISION',
    });
    expect(invalid.rows[0]).toMatchObject({
      status: 'invalid_decision',
      estimatedCostMicroUsd: 42,
      ...RULES_ON_COLUMNS,
    });

    const timeout = rig({
      provider: () =>
        Promise.reject(
          AiFailure.timeout({
            attempts: 3,
            costMicroUsd: 77,
            usage: { ...emptyUsage(), inputTokens: 300, totalTokens: 300 },
          }),
        ),
    });
    await expect(timeout.service.decide(commanderOn, 'auto')).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
    expect(timeout.rows[0]).toMatchObject({
      status: 'timeout',
      attempts: 3,
      inputTokens: 300,
      estimatedCostMicroUsd: 77,
      ...RULES_ON_COLUMNS,
      promptTokensUpperBound: promptUpperBound(commanderOn),
    });
  });

  it('mock provider: cost 0, rules columns kept; dev-test context: always rules off', async () => {
    const r = rig();
    await r.service.decide(commanderOn, 'mock');
    expect(r.rows[0]).toMatchObject({
      provider: 'mock',
      estimatedCostMicroUsd: 0,
      ...RULES_ON_COLUMNS,
      promptTokensUpperBound: promptUpperBound(commanderOn),
    });
    await r.service.decide(
      { ...ctx, rules: commanderOn.rules, rulesAccounting: commanderOn.rulesAccounting },
      'mock',
    );
    expect(r.rows[1]).toMatchObject({
      ...RULES_OFF_COLUMNS,
      promptTokensUpperBound: promptUpperBound(ctx),
    });
  });

  it('a rules block without accounting is recorded as sent', async () => {
    const r = rig();
    const { rulesAccounting: _omit, ...noAccounting } = commanderOn;
    await r.service.decide(noAccounting, 'mock');
    expect(r.rows[0]).toMatchObject(RULES_ON_COLUMNS);
  });
});

describe('SWR-008: malformed rules block → VALIDATION before any call (§4.3)', () => {
  const bad: [string, Partial<NonNullable<AIDecisionContext['rules']>>][] = [
    ['empty text', { text: '' }],
    ['text over 12000', { text: 'x'.repeat(12_001) }],
    ['no ids', { ruleIds: [] }],
    ['duplicate ids', { ruleIds: ['a', 'a'] }],
    ['65 ids', { ruleIds: Array.from({ length: 65 }, (_, i) => `id-${i}`) }],
    ['id over 128', { ruleIds: ['x'.repeat(129)] }],
    ['bad version', { rulesVersion: 'not a version' }],
  ];
  it.each(bad)('%s', async (_name, patch) => {
    const r = rig();
    const err = await r.service
      .decide({ ...commanderOn, rules: { ...commanderOn.rules!, ...patch } }, 'auto')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION');
    expect(r.providerCalls).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.reserves).toEqual([]);
  });
});
