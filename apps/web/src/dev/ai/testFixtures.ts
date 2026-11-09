import { type AiDevStatus, type AiTestDecisionResponse } from '@bga/platform';

/** Test data for the diagnostics page tests (wire shapes of `@bga/platform` ai-dev). */
export function makeStatus(overrides: Partial<AiDevStatus> = {}): AiDevStatus {
  return {
    openaiEnabled: true,
    provider: 'openai',
    keyConfigured: true,
    models: {
      strategy: { id: 'gpt-6.1-sol', available: true },
      tactical: { id: 'gpt-6-luna', available: null },
    },
    budget: {
      budgetKey: 'dev-diagnostics',
      spentUsd: 0.0012,
      spentMicroUsd: 1200,
      limitUsd: 0.25,
      limitMicroUsd: 250000,
      remainingUsd: 0.2488,
      remainingMicroUsd: 248800,
    },
    ...overrides,
  };
}

export function makeMockStatus(): AiDevStatus {
  return makeStatus({
    openaiEnabled: false,
    provider: 'mock',
    keyConfigured: false,
    models: { strategy: { id: null, available: null }, tactical: { id: null, available: false } },
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
}

export function makeDecisionResponse(
  overrides: Partial<AiTestDecisionResponse['decision']> = {},
): AiTestDecisionResponse {
  return {
    decision: {
      selectedActionId: 'action-1',
      reason: 'Improves strategic positioning',
      provider: 'openai',
      model: 'gpt-6-luna-2026-10-01',
      durationMs: 1234,
      attempts: 1,
      usage: {
        inputTokens: 812,
        cachedInputTokens: 0,
        outputTokens: 64,
        reasoningTokens: 32,
        totalTokens: 876,
      },
      estimatedCostUsd: 0.000113,
      estimatedCostMicroUsd: 113,
      pricingVersion: 'openai-2026-11-08',
      ...overrides,
    },
    budget: {
      budgetKey: 'dev-diagnostics',
      spentUsd: 0.001313,
      spentMicroUsd: 1313,
      limitUsd: 0.25,
      limitMicroUsd: 250000,
      remainingUsd: 0.248687,
      remainingMicroUsd: 248687,
    },
  };
}

export function errorBody(code: string, messageKey: string, details?: Record<string, unknown>) {
  return { ok: false, error: { code, messageKey, ...(details ? { details } : {}) } };
}
