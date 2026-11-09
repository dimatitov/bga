import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  AI_DEV_BUDGET_KEY,
  AIActionSchema,
  AIDecisionResultSchema,
  AIUsageSchema,
  AiBudgetSnapshotSchema,
  AiDevStatusSchema,
  AiTestDecisionRequestSchema,
  AiTestDecisionResponseSchema,
  createAiTestDecisionRequestSchema,
  microUsdToUsd,
  usdToMicroUsd,
  type AIDecisionResult,
  type AiBudgetSnapshot,
} from '../src';

const actions = [
  { id: 'move-a', type: 'move', target: 'A' },
  { id: 'recruit-b', type: 'recruit' },
];

const usage = {
  inputTokens: 120,
  cachedInputTokens: 0,
  outputTokens: 40,
  reasoningTokens: null,
  totalTokens: 160,
};

const decision: AIDecisionResult = {
  selectedActionId: 'move-a',
  reason: 'Closer to the objective.',
  provider: 'mock',
  model: 'mock',
  durationMs: 3,
  attempts: 1,
  usage,
  estimatedCostUsd: 0,
  estimatedCostMicroUsd: 0,
  pricingVersion: 'openai-2026-11-08',
};

const budget: AiBudgetSnapshot = {
  budgetKey: 'dev-diagnostics',
  spentUsd: 0.000123,
  spentMicroUsd: 123,
  limitUsd: 0.25,
  limitMicroUsd: 250_000,
  remainingUsd: 0.249877,
  remainingMicroUsd: 249_877,
};

describe('dev-AI wire contract (SWR-005B, plan-backend §10)', () => {
  it('request: defaults role=tactical, provider=auto, budgetKey=dev-diagnostics; trims strings', () => {
    const parsed = AiTestDecisionRequestSchema.parse({
      scenario: { side: 'x', phase: ' p ', objective: ' line1\nline2 ', availableActions: actions },
    });
    expect(parsed.role).toBe('tactical');
    expect(parsed.provider).toBe('auto');
    expect(parsed.budgetKey).toBe(AI_DEV_BUDGET_KEY);
    expect(parsed.scenario.phase).toBe('p');
    expect(parsed.scenario.objective).toBe('line1\nline2');
  });

  it('request: strict, budgetKey only dev-diagnostics (AM-BE-6), action bounds and unique ids', () => {
    const scenario = { side: 'x', phase: 'p', objective: 'o', availableActions: actions };
    const ok = (body: unknown) => AiTestDecisionRequestSchema.safeParse(body).success;
    expect(ok({ scenario })).toBe(true);
    expect(ok({ scenario, extra: 1 })).toBe(false);
    expect(ok({ scenario: { ...scenario, extra: 1 } })).toBe(false);
    expect(ok({ scenario, budgetKey: 'other' })).toBe(false);
    expect(ok({ scenario, role: 'strategy', provider: 'mock' })).toBe(true);
    expect(ok({ scenario, provider: 'openai' })).toBe(false);
    expect(ok({ scenario: { ...scenario, availableActions: [actions[0]] } })).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, type: 't' }));
    expect(ok({ scenario: { ...scenario, availableActions: eleven } })).toBe(false);
    expect(ok({ scenario: { ...scenario, availableActions: eleven.slice(0, 10) } })).toBe(true);
    expect(ok({ scenario: { ...scenario, availableActions: [actions[0], actions[0]] } })).toBe(
      false,
    );
    expect(ok({ scenario: { ...scenario, phase: '   ' } })).toBe(false);
    expect(ok({ scenario: { ...scenario, phase: 'p'.repeat(65) } })).toBe(false);
    expect(ok({ scenario: { ...scenario, objective: 'o'.repeat(501) } })).toBe(false);
    expect(ok({ scenario: { ...scenario, objective: 'a\u0007b' } })).toBe(false);
    expect(ok({ scenario: { ...scenario, objective: 'a\tb' } })).toBe(false);
  });

  it('action id pattern and field bounds', () => {
    const ok = (a: unknown) => AIActionSchema.safeParse(a).success;
    expect(ok({ id: 'A1_.:-x', type: 't' })).toBe(true);
    expect(ok({ id: '-a', type: 't' })).toBe(false);
    expect(ok({ id: 'a b', type: 't' })).toBe(false);
    expect(ok({ id: 'a'.repeat(65), type: 't' })).toBe(false);
    expect(ok({ id: 'a', type: '' })).toBe(false);
    expect(ok({ id: 'a', type: 't', target: '' })).toBe(false);
    expect(ok({ id: 'a', type: 't', extra: 1 })).toBe(false);
  });

  it('a game dev module adds its own side field via the factory', () => {
    const Schema = createAiTestDecisionRequestSchema({ team: z.enum(['red', 'blue']) });
    const scenario = { team: 'red', phase: 'p', objective: 'o', availableActions: actions };
    expect(Schema.safeParse({ scenario }).success).toBe(true);
    expect(Schema.safeParse({ scenario: { ...scenario, team: 'green' } }).success).toBe(false);
    expect(Schema.safeParse({ scenario: { ...scenario, side: 'x' } }).success).toBe(false);
  });

  it('response, status and usage schemas are strict', () => {
    expect(AiTestDecisionResponseSchema.parse({ decision, budget })).toEqual({ decision, budget });
    expect(AiTestDecisionResponseSchema.safeParse({ decision, budget, x: 1 }).success).toBe(false);
    expect(AIDecisionResultSchema.safeParse({ ...decision, apiKey: 'x' }).success).toBe(false);
    expect(AIDecisionResultSchema.safeParse({ ...decision, reason: 'r'.repeat(301) }).success).toBe(
      false,
    );
    expect(AIDecisionResultSchema.safeParse({ ...decision, attempts: 0 }).success).toBe(false);
    expect(
      AIDecisionResultSchema.safeParse({ ...decision, estimatedCostMicroUsd: 1.5 }).success,
    ).toBe(false);
    expect(AIUsageSchema.safeParse({ ...usage, reasoningTokens: 7 }).success).toBe(true);
    expect(AIUsageSchema.safeParse({ ...usage, inputTokens: -1 }).success).toBe(false);

    const status = {
      openaiEnabled: false,
      provider: 'mock',
      keyConfigured: false,
      models: { strategy: { id: null, available: null }, tactical: { id: null, available: null } },
      budget: {
        ...budget,
        limitUsd: null,
        limitMicroUsd: null,
        remainingUsd: null,
        remainingMicroUsd: null,
      },
    };
    expect(AiDevStatusSchema.safeParse(status).success).toBe(true);
    expect(AiDevStatusSchema.safeParse({ ...status, apiKey: 'x' }).success).toBe(false);
    expect(AiBudgetSnapshotSchema.safeParse({ ...budget, budgetKey: 'other' }).success).toBe(false);
  });

  it('micro-USD helpers (Q-15)', () => {
    expect(usdToMicroUsd(0.000123)).toBe(123);
    expect(usdToMicroUsd(0.1 + 0.2)).toBe(300_000);
    expect(microUsdToUsd(249_877)).toBe(0.249877);
    expect(microUsdToUsd(usdToMicroUsd(0.25))).toBe(0.25);
  });
});

describe('platform stays game-agnostic and AI-SDK-free (AM-BE-1, AC-11)', () => {
  const srcDir = join(__dirname, '..', 'src');
  const sources = readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => [f, readFileSync(join(srcDir, f), 'utf8')] as const);

  it('no game words in platform sources', () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/faction|rebels|empire/i);
    }
  });

  it('no openai import and no openai dependency', () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/from ['"]openai|require\(['"]openai/);
    }
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['zod']);
  });
});
