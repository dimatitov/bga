/**
 * SWR-005B W4 (plan-backend §5.1–§5.2; Q-15, Q-16; A-2): integer micro-USD cost estimates and the worst-case reserve.
 */
import { describe, expect, it } from 'vitest';
import {
  estimateCostMicroUsd,
  estimateCostUsd,
  LONG_CONTEXT_THRESHOLD_TOKENS,
  MODEL_PRICING,
  perAttemptReserveMicroUsd,
  PRICING_VERSION,
  pricingFor,
  worstCaseReserveMicroUsd,
} from '../../src/ai/pricing';

const u = (inputTokens: number, outputTokens: number, cachedInputTokens = 0) => ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
});

describe('pricing', () => {
  it('has both configured models and a version', () => {
    expect(Object.keys(MODEL_PRICING).sort()).toEqual(['gpt-6-luna', 'gpt-6.1-sol']);
    expect(PRICING_VERSION).toBe('openai-2026-11-08');
    expect(pricingFor('gpt-6-luna')?.reasoningNone).toBe(true);
    expect(pricingFor('gpt-6.1-sol')?.reasoningNone).toBe(false);
  });

  it('gpt-6-luna: $0.10 in / $0.50 out per 1M → micro-USD', () => {
    expect(estimateCostMicroUsd('gpt-6-luna', u(1000, 100))).toBe(150);
    expect(estimateCostUsd('gpt-6-luna', u(1000, 100))).toBe(0.00015);
  });

  it('gpt-6.1-sol: $2 in / $10 out per 1M', () => {
    expect(estimateCostMicroUsd('gpt-6.1-sol', u(1000, 100))).toBe(3000);
    expect(estimateCostMicroUsd('gpt-6.1-sol', u(200_000, 0))).toBe(400_000);
    // 1M input is long context → ×2
    expect(estimateCostMicroUsd('gpt-6.1-sol', u(1_000_000, 0))).toBe(4_000_000);
  });

  it('cached input is a part of input and billed at the cached price', () => {
    // 600 uncached × 0.1 + 400 cached × 0.01 = 60 + 4
    expect(estimateCostMicroUsd('gpt-6-luna', u(1000, 0, 400))).toBe(64);
    // sol: 600 × 2 + 400 × 0.1 = 1200 + 40
    expect(estimateCostMicroUsd('gpt-6.1-sol', u(1000, 0, 400))).toBe(1240);
    // cached > input is clamped (all cached)
    expect(estimateCostMicroUsd('gpt-6-luna', u(1000, 0, 5000))).toBe(10);
  });

  it('long context: 272 000 is short, 272 001 doubles input and ×1.5 output for the whole request', () => {
    expect(LONG_CONTEXT_THRESHOLD_TOKENS).toBe(272_000);
    expect(estimateCostMicroUsd('gpt-6-luna', u(272_000, 0))).toBe(27_200);
    // 272001 × 0.1 × 2 = 54400.2 → rounded up
    expect(estimateCostMicroUsd('gpt-6-luna', u(272_001, 0))).toBe(54_401);
    expect(estimateCostMicroUsd('gpt-6-luna', u(272_000, 1000))).toBe(27_200 + 500);
    expect(estimateCostMicroUsd('gpt-6-luna', u(272_001, 1000))).toBe(55_151); // (54400.2 + 750) → 55151
    // threshold counts cached tokens too
    expect(estimateCostMicroUsd('gpt-6.1-sol', u(272_001, 0, 272_001))).toBe(54_401);
  });

  it('reasoning tokens are inside output tokens and are not added a second time', () => {
    const withReasoning = { ...u(1000, 100), reasoningTokens: 80, totalTokens: 1100 };
    expect(estimateCostMicroUsd('gpt-6.1-sol', withReasoning)).toBe(3000);
  });

  it('rounds up to whole micro-USD (conservative) and is exact for integers', () => {
    expect(estimateCostMicroUsd('gpt-6-luna', u(0, 1))).toBe(1); // 0.5 → 1
    expect(estimateCostMicroUsd('gpt-6-luna', u(10, 0))).toBe(1); // 1.0 → 1
    expect(estimateCostMicroUsd('gpt-6-luna', u(0, 0))).toBe(0);
  });

  it('unknown model (exact id only, no prefix match) → null', () => {
    expect(estimateCostMicroUsd('gpt-6-luna-2026-10-01', u(1, 1))).toBeNull();
    expect(estimateCostMicroUsd('gpt-unknown', u(1, 1))).toBeNull();
    expect(estimateCostMicroUsd('toString', u(1, 1))).toBeNull();
    expect(pricingFor('__proto__')).toBeNull();
    expect(worstCaseReserveMicroUsd('gpt-unknown', 1500, 400, 2)).toBeNull();
  });

  it('rejects negative / fractional token counts', () => {
    expect(() => estimateCostMicroUsd('gpt-6-luna', u(-1, 0))).toThrow(RangeError);
    expect(() => estimateCostMicroUsd('gpt-6-luna', u(1.5, 0))).toThrow(RangeError);
  });

  it('reserve example of plan §5.2 (inUpper 1500, defaults: 2 retries)', () => {
    expect(perAttemptReserveMicroUsd('gpt-6-luna', 1500, 400)).toBe(350);
    expect(worstCaseReserveMicroUsd('gpt-6-luna', 1500, 400, 2)).toBe(1050); // ≈ $0.00105
    expect(perAttemptReserveMicroUsd('gpt-6.1-sol', 1500, 1600)).toBe(19_000);
    expect(worstCaseReserveMicroUsd('gpt-6.1-sol', 1500, 1600, 2)).toBe(57_000); // ≈ $0.057
    expect(worstCaseReserveMicroUsd('gpt-6-luna', 1500, 400, 0)).toBe(350);
  });
});
