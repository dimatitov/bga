// SWR-008 §6: wire schema of the dev-only AI decision diagnostics (AC-13). Strict: no budget key / session id,
// model reason, prompt or rules text, prompt upper bound or pricing version can be sent.
import { describe, expect, it } from 'vitest';
import {
  AiCostGroupSchema,
  AiDecisionDiagnosticSchema,
  AiSessionDecisionsResponseSchema,
  type AiDecisionDiagnostic,
  type AiSessionDecisionsResponse,
} from '../src';

const DECISION: AiDecisionDiagnostic = {
  at: '2026-11-20T12:00:00.000Z',
  provider: 'openai',
  model: 'gpt-x-mini',
  status: 'ok',
  fallback: false,
  errorCode: null,
  attempts: 1,
  inputTokens: 3200,
  cachedInputTokens: 1024,
  outputTokens: 60,
  costMicroUsd: 812,
  durationMs: 1430,
  rules: {
    enabled: true,
    rulesVersion: 'star-forge@1:0123456789ab',
    count: 2,
    ids: ['star-forge:turn.order', 'star-forge:victory.score'],
    chars: 340,
    tokensEstimate: 85,
    truncated: false,
    dropped: false,
  },
};

const GROUP = {
  decisions: 1,
  costMicroUsd: 812,
  inputTokens: 3200,
  outputTokens: 60,
  meanCostMicroUsd: 812,
};
const EMPTY_GROUP = {
  ...GROUP,
  decisions: 0,
  costMicroUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  meanCostMicroUsd: null,
};

const RESPONSE: AiSessionDecisionsResponse = {
  decisions: [DECISION],
  totals: { withRules: GROUP, withoutRules: EMPTY_GROUP, total: GROUP },
};

const okDecision = (patch: Record<string, unknown>) =>
  AiDecisionDiagnosticSchema.safeParse({ ...DECISION, ...patch }).success;
const okRules = (patch: Record<string, unknown>) =>
  okDecision({ rules: { ...DECISION.rules, ...patch } });

describe('AiSessionDecisionsResponse (plan-backend §6)', () => {
  it('accepts the plan example, an empty session, a fallback row and rules off', () => {
    expect(AiSessionDecisionsResponseSchema.parse(RESPONSE)).toEqual(RESPONSE);
    expect(
      AiSessionDecisionsResponseSchema.safeParse({
        decisions: [],
        totals: { withRules: EMPTY_GROUP, withoutRules: EMPTY_GROUP, total: EMPTY_GROUP },
      }).success,
    ).toBe(true);
    expect(
      okDecision({
        status: 'timeout',
        fallback: true,
        errorCode: 'AI_TIMEOUT',
        attempts: 2,
        provider: 'mock',
      }),
    ).toBe(true);
    expect(
      okRules({
        enabled: false,
        rulesVersion: null,
        count: 0,
        ids: [],
        chars: 0,
        tokensEstimate: 0,
      }),
    ).toBe(true);
    expect(okRules({ dropped: true, truncated: true, count: 0, ids: [], chars: 0 })).toBe(true);
  });

  it('at most 50 decisions', () => {
    const many = (n: number) => ({
      ...RESPONSE,
      decisions: Array.from({ length: n }, () => DECISION),
    });
    expect(AiSessionDecisionsResponseSchema.safeParse(many(50)).success).toBe(true);
    expect(AiSessionDecisionsResponseSchema.safeParse(many(51)).success).toBe(false);
  });

  it('strict everywhere: no budget key, session id, reason, prompt / rules text, upper bound, pricing', () => {
    for (const leak of [
      'budgetKey',
      'sessionId',
      'reason',
      'prompt',
      'rulesText',
      'promptTokensUpperBound',
      'pricingVersion',
      'situation',
    ]) {
      expect(okDecision({ [leak]: 'x' })).toBe(false);
      expect(okRules({ [leak]: 'x' })).toBe(false);
      expect(AiSessionDecisionsResponseSchema.safeParse({ ...RESPONSE, [leak]: 'x' }).success).toBe(
        false,
      );
      expect(
        AiSessionDecisionsResponseSchema.safeParse({
          ...RESPONSE,
          totals: { ...RESPONSE.totals, [leak]: GROUP },
        }).success,
      ).toBe(false);
      expect(AiCostGroupSchema.safeParse({ ...GROUP, [leak]: 1 }).success).toBe(false);
    }
  });

  it('field types: ISO datetime, provider enum, non-negative integers, bounded strings', () => {
    expect(okDecision({ at: '2026-11-20' })).toBe(false);
    expect(okDecision({ at: 'yesterday' })).toBe(false);
    expect(okDecision({ provider: 'anthropic' })).toBe(false);
    expect(okDecision({ model: '' })).toBe(false);
    expect(okDecision({ model: 'm'.repeat(201) })).toBe(false);
    expect(okDecision({ status: '' })).toBe(false);
    expect(okDecision({ status: 's'.repeat(33) })).toBe(false);
    expect(okDecision({ errorCode: '' })).toBe(false);
    expect(okDecision({ errorCode: 'E'.repeat(65) })).toBe(false);
    for (const field of [
      'attempts',
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'costMicroUsd',
      'durationMs',
    ]) {
      expect(okDecision({ [field]: -1 })).toBe(false);
      expect(okDecision({ [field]: 1.5 })).toBe(false);
      expect(okDecision({ [field]: 0 })).toBe(true);
    }
    expect(okRules({ rulesVersion: 'v'.repeat(97) })).toBe(false);
    expect(okRules({ ids: [''] })).toBe(false);
    expect(okRules({ ids: ['i'.repeat(129)] })).toBe(false);
    expect(okRules({ ids: Array.from({ length: 65 }, (_, i) => `g:r.n${i}`) })).toBe(false);
    for (const field of ['count', 'chars', 'tokensEstimate']) {
      expect(okRules({ [field]: -1 })).toBe(false);
    }
  });

  it('cost group: mean nullable non-negative number; counters non-negative integers', () => {
    expect(AiCostGroupSchema.safeParse({ ...GROUP, meanCostMicroUsd: 406.5 }).success).toBe(true);
    expect(AiCostGroupSchema.safeParse({ ...GROUP, meanCostMicroUsd: -1 }).success).toBe(false);
    expect(AiCostGroupSchema.safeParse({ ...GROUP, decisions: -1 }).success).toBe(false);
    expect(AiCostGroupSchema.safeParse({ ...GROUP, costMicroUsd: 0.5 }).success).toBe(false);
    const { meanCostMicroUsd: _m, ...noMean } = GROUP;
    expect(AiCostGroupSchema.safeParse(noMean).success).toBe(false);
  });
});
