import {
  type AiCostGroup,
  type AiDecisionDiagnostic,
  type AiSessionDecisionsResponse,
  AiSessionDecisionsResponseSchema,
} from '@bga/platform';

/** Test data of the dev decision panel: wire shapes of `@bga/platform` ai-diagnostics (they pass the strict schema). */

type DecisionOverrides = Partial<Omit<AiDecisionDiagnostic, 'rules'>> & {
  rules?: Partial<AiDecisionDiagnostic['rules']>;
};

export function makeDecision(overrides: DecisionOverrides = {}): AiDecisionDiagnostic {
  const { rules, ...rest } = overrides;
  return {
    at: '2026-11-20T10:15:30.000Z',
    provider: 'openai',
    model: 'gpt-6-luna-2026-10-01',
    status: 'ok',
    fallback: false,
    errorCode: null,
    attempts: 1,
    inputTokens: 1812,
    cachedInputTokens: 0,
    outputTokens: 64,
    costMicroUsd: 113,
    durationMs: 1234,
    ...rest,
    rules: {
      enabled: true,
      rulesVersion: 'rebellion@1:0123456789ab',
      count: 3,
      ids: ['rebellion:turn.activate', 'rebellion:move.basic', 'rebellion:impl.engine-scope'],
      chars: 1648,
      tokensEstimate: 412,
      truncated: false,
      dropped: false,
      ...rules,
    },
  };
}

export function makeCostGroup(overrides: Partial<AiCostGroup> = {}): AiCostGroup {
  return {
    decisions: 0,
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    meanCostMicroUsd: null,
    ...overrides,
  };
}

/** Response whose totals are computed from `decisions` (as the server's `summarizeCostByRules` would). */
export function makeDecisionsResponse(
  decisions: AiDecisionDiagnostic[] = [],
): AiSessionDecisionsResponse {
  const group = (rows: AiDecisionDiagnostic[]): AiCostGroup => {
    const cost = rows.reduce((sum, d) => sum + d.costMicroUsd, 0);
    return {
      decisions: rows.length,
      costMicroUsd: cost,
      inputTokens: rows.reduce((sum, d) => sum + d.inputTokens, 0),
      outputTokens: rows.reduce((sum, d) => sum + d.outputTokens, 0),
      meanCostMicroUsd: rows.length > 0 ? cost / rows.length : null,
    };
  };
  const response = {
    decisions,
    totals: {
      withRules: group(decisions.filter((d) => d.rules.enabled)),
      withoutRules: group(decisions.filter((d) => !d.rules.enabled)),
      total: group(decisions),
    },
  };
  return AiSessionDecisionsResponseSchema.parse(response);
}
