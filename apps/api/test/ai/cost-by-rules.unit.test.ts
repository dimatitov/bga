/**
 * SWR-008 W6a — `summarizeCostByRules` (C-9, AC-12, TC-COST-03): sums and means per group (with rules / without
 * rules / total) over synthetic rows, checked against a hand calculation; a group of 0 rows has `null` means, not NaN.
 */
import { describe, expect, it } from 'vitest';
import { sentRules, summarizeCostByRules, type RulesCostRow } from '../../src/ai/cost-by-rules';

function row(over: Partial<RulesCostRow>): RulesCostRow {
  return {
    rulesEnabled: false,
    rulesDropped: false,
    rulesCount: 0,
    estimatedCostMicroUsd: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    provider: 'openai',
    ...over,
  };
}

/** 5 rows with rules, 5 without (rules off ×3, dropped ×1, enabled but nothing selected ×1). */
const ON: RulesCostRow[] = [100, 200, 300, 400, 500].map((cost, i) =>
  row({
    rulesEnabled: true,
    rulesCount: 20 + i,
    estimatedCostMicroUsd: cost,
    inputTokens: 2000 + i * 10,
    cachedInputTokens: 1000,
    outputTokens: 30 + i,
    durationMs: 800 + i,
  }),
);
const OFF: RulesCostRow[] = [
  row({ estimatedCostMicroUsd: 40, inputTokens: 600, outputTokens: 30, durationMs: 500 }),
  row({ estimatedCostMicroUsd: 50, inputTokens: 610, outputTokens: 31, durationMs: 501 }),
  row({ estimatedCostMicroUsd: 60, inputTokens: 620, outputTokens: 32, durationMs: 502 }),
  row({
    rulesEnabled: true,
    rulesDropped: true,
    estimatedCostMicroUsd: 70,
    inputTokens: 630,
    cachedInputTokens: 100,
    outputTokens: 33,
    durationMs: 503,
  }),
  row({
    rulesEnabled: true,
    estimatedCostMicroUsd: 80,
    inputTokens: 640,
    outputTokens: 34,
    durationMs: 504,
  }),
];

describe('summarizeCostByRules (TC-COST-03)', () => {
  it('groups 5 + 5 synthetic rows; sums and means match a hand calculation', () => {
    const s = summarizeCostByRules([...OFF.slice(0, 2), ...ON, ...OFF.slice(2)]);
    expect(s.withRules).toEqual({
      decisions: 5,
      costMicroUsd: 1500,
      inputTokens: 10_100, // 2000 + 2010 + 2020 + 2030 + 2040
      cachedInputTokens: 5000,
      outputTokens: 160, // 30..34
      meanCostMicroUsd: 300,
      meanInputTokens: 2020,
      meanDurationMs: 802,
    });
    expect(s.withoutRules).toEqual({
      decisions: 5,
      costMicroUsd: 300,
      inputTokens: 3100,
      cachedInputTokens: 100,
      outputTokens: 160,
      meanCostMicroUsd: 60,
      meanInputTokens: 620,
      meanDurationMs: 502,
    });
    expect(s.total).toEqual({
      decisions: 10,
      costMicroUsd: 1800,
      inputTokens: 13_200,
      cachedInputTokens: 5100,
      outputTokens: 320,
      meanCostMicroUsd: 180,
      meanInputTokens: 1320,
      meanDurationMs: 652,
    });
    // the difference "with − without" per decision (TC-MEAS-04 basis)
    expect(s.withRules.meanCostMicroUsd! - s.withoutRules.meanCostMicroUsd!).toBe(240);
  });

  it('a group without rows has null means (never NaN); empty input → all groups empty', () => {
    const onlyOff = summarizeCostByRules(OFF);
    expect(onlyOff.withRules).toEqual({
      decisions: 0,
      costMicroUsd: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      meanCostMicroUsd: null,
      meanInputTokens: null,
      meanDurationMs: null,
    });
    const empty = summarizeCostByRules([]);
    for (const g of [empty.withRules, empty.withoutRules, empty.total]) {
      expect(g.decisions).toBe(0);
      expect([g.meanCostMicroUsd, g.meanInputTokens, g.meanDurationMs]).toEqual([null, null, null]);
    }
  });

  it('non-integer means are kept exact (no rounding)', () => {
    const s = summarizeCostByRules([
      row({ estimatedCostMicroUsd: 1 }),
      row({ estimatedCostMicroUsd: 2 }),
      row({ estimatedCostMicroUsd: 2 }),
    ]);
    expect(s.total.meanCostMicroUsd).toBeCloseTo(5 / 3, 12);
  });

  it('sentRules: enabled, not dropped and at least one rule', () => {
    expect(sentRules({ rulesEnabled: true, rulesDropped: false, rulesCount: 1 })).toBe(true);
    expect(sentRules({ rulesEnabled: true, rulesDropped: true, rulesCount: 0 })).toBe(false);
    expect(sentRules({ rulesEnabled: true, rulesDropped: false, rulesCount: 0 })).toBe(false);
    expect(sentRules({ rulesEnabled: false, rulesDropped: false, rulesCount: 0 })).toBe(false);
  });
});
