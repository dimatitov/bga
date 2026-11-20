/**
 * SWR-008 W8 — pure benchmark functions on synthetic decisions (no provider):
 * TC-BEN-05 (metrics, nearest-rank percentiles QD-10), TC-BEN-06 (boundaries: empty / one / all fallback / ties,
 * `null` → `n/a`, never NaN), TC-BEN-13 (rules-on vs rules-off comparison with a 95% CI), rubric classification.
 */
import { describe, expect, it } from 'vitest';
import {
  RUBRIC_SCORES,
  classifyCandidate,
  compareAll,
  compareVariants,
  computeVariantMetrics,
  matchesCandidate,
  percentileNearestRank,
} from '../../src/bench/metrics';
import {
  renderBenchReportJson,
  renderBenchReportMarkdown,
  reportFileStem,
} from '../../src/bench/report';
import type { BenchDecision, BenchReport, BenchVariant, RubricClass } from '../../src/bench/types';

const CLASS_BY_SCORE: Record<number, RubricClass> = {
  1: 'expected',
  0.5: 'acceptable',
  0: 'wrong',
  0.25: 'unmatched',
};

function decision(over: Partial<BenchDecision> = {}): BenchDecision {
  const score = over.rubricScore ?? 1;
  return {
    scenarioId: 's-01',
    variant: 'openai-rules',
    repeat: 1,
    candidateId: 'c1',
    candidateType: 'MOVE',
    source: 'model',
    fallbackCode: null,
    valid: true,
    rubricClass: CLASS_BY_SCORE[score] ?? 'expected',
    rubricScore: score,
    expectedHit: score === 1,
    pass: false,
    unjustifiedPass: false,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    durationMs: 0,
    rules: { count: 0, chars: 0, tokensEstimate: 0, dropped: false },
    ...over,
  };
}

/** TC-BEN-05: 10 decisions with known values; latencies 10, 20, …, 100 ms (shuffled). */
const TEN: BenchDecision[] = [
  // valid, expected hit
  decision({
    rubricScore: 1,
    durationMs: 70,
    inputTokens: 1000,
    cachedInputTokens: 200,
    outputTokens: 40,
    costMicroUsd: 121,
    rules: { count: 5, chars: 1000, tokensEstimate: 250, dropped: false },
  }),
  decision({
    rubricScore: 1,
    durationMs: 10,
    inputTokens: 1100,
    outputTokens: 41,
    costMicroUsd: 131,
    rules: { count: 5, chars: 1200, tokensEstimate: 300, dropped: false },
  }),
  decision({
    rubricScore: 1,
    durationMs: 100,
    inputTokens: 1200,
    outputTokens: 42,
    costMicroUsd: 141,
  }),
  decision({
    rubricScore: 0.5,
    durationMs: 40,
    inputTokens: 900,
    outputTokens: 43,
    costMicroUsd: 101,
  }),
  decision({
    rubricScore: 0.5,
    durationMs: 30,
    inputTokens: 950,
    outputTokens: 44,
    costMicroUsd: 103,
  }),
  decision({
    rubricScore: 0.25,
    durationMs: 60,
    inputTokens: 980,
    outputTokens: 45,
    costMicroUsd: 107,
  }),
  // unjustified pass (wrong)
  decision({
    rubricScore: 0,
    candidateType: 'PASS',
    pass: true,
    unjustifiedPass: true,
    durationMs: 20,
    inputTokens: 990,
    outputTokens: 46,
    costMicroUsd: 109,
  }),
  // a justified pass
  decision({
    rubricScore: 1,
    candidateType: 'PASS',
    pass: true,
    unjustifiedPass: false,
    durationMs: 90,
    inputTokens: 1010,
    outputTokens: 47,
    costMicroUsd: 113,
  }),
  // fallbacks (bot's pick): invalid answer with tokens / timeout without
  decision({
    rubricScore: 0,
    source: 'bot',
    valid: false,
    fallbackCode: 'AI_TIMEOUT',
    durationMs: 80,
    inputTokens: 1020,
    outputTokens: 0,
    costMicroUsd: 117,
  }),
  decision({
    rubricScore: 0.25,
    source: 'bot',
    valid: false,
    fallbackCode: 'AI_INVALID_DECISION',
    durationMs: 50,
    inputTokens: 1030,
    outputTokens: 48,
    costMicroUsd: 119,
  }),
];

describe('computeVariantMetrics (TC-BEN-05)', () => {
  it('equals the hand calculation', () => {
    const m = computeVariantMetrics(TEN);
    expect(m.decisions).toBe(10);
    expect(m.validRate).toBe(0.8);
    expect(m.unjustifiedPassRate).toBe(0.1);
    // (1+1+1+0.5+0.5+0.25+0+1+0+0.25) / 10 = 5.5 / 10
    expect(m.goalScore).toBeCloseTo(0.55, 12);
    expect(m.expectedHitRate).toBe(0.4);
    expect(m.fallbacks).toBe(2);
    expect(m.fallbackCodes).toEqual(['AI_INVALID_DECISION', 'AI_TIMEOUT']);
    expect(m.inputTokens).toBe(1000 + 1100 + 1200 + 900 + 950 + 980 + 990 + 1010 + 1020 + 1030);
    expect(m.cachedInputTokens).toBe(200);
    expect(m.outputTokens).toBe(40 + 41 + 42 + 43 + 44 + 45 + 46 + 47 + 0 + 48);
    // Integer micro-USD, summed without float error.
    expect(m.costMicroUsd).toBe(121 + 131 + 141 + 101 + 103 + 107 + 109 + 113 + 117 + 119);
    expect(Number.isInteger(m.costMicroUsd)).toBe(true);
    expect(m.costPerDecisionMicroUsd).toBe(116.2);
    expect(m.meanRulesChars).toBe(220);
    // Nearest rank: p50 → rank ceil(5) = 5 → 50 ms; p95 → rank ceil(9.5) = 10 → 100 ms.
    expect(m.latencyP50Ms).toBe(50);
    expect(m.latencyP95Ms).toBe(100);
  });

  it('micro-USD sums stay exact where floats would drift', () => {
    const many = Array.from({ length: 1000 }, () => decision({ costMicroUsd: 7 }));
    expect(computeVariantMetrics(many).costMicroUsd).toBe(7000);
  });
});

describe('percentileNearestRank (QD-10)', () => {
  it('takes the value at rank ceil(p/100 · n) of the ascending sample', () => {
    expect(percentileNearestRank([4, 1, 3, 2], 50)).toBe(2);
    expect(percentileNearestRank([4, 1, 3, 2], 95)).toBe(4);
    expect(percentileNearestRank([4, 1, 3, 2], 25)).toBe(1);
    expect(percentileNearestRank([4, 1, 3, 2], 100)).toBe(4);
    expect(percentileNearestRank([15, 20, 35, 40, 50], 30)).toBe(20);
    expect(percentileNearestRank([15, 20, 35, 40, 50], 40)).toBe(20);
    expect(percentileNearestRank([15, 20, 35, 40, 50], 50)).toBe(35);
    expect(percentileNearestRank([5], 0.1)).toBe(5);
  });

  it('empty → null; p outside (0, 100] → RangeError; the input is not mutated', () => {
    expect(percentileNearestRank([], 50)).toBeNull();
    expect(() => percentileNearestRank([1], 0)).toThrow(RangeError);
    expect(() => percentileNearestRank([1], 101)).toThrow(RangeError);
    expect(() => percentileNearestRank([1], Number.NaN)).toThrow(RangeError);
    const input = [3, 1, 2];
    percentileNearestRank(input, 50);
    expect(input).toEqual([3, 1, 2]);
  });
});

function report(decisions: BenchDecision[], variants: BenchVariant[]): BenchReport {
  const empty = {
    decisions: 0,
    costMicroUsd: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    meanCostMicroUsd: null,
    meanInputTokens: null,
    meanDurationMs: null,
  };
  const metrics: BenchReport['metrics'] = {};
  for (const v of variants) {
    metrics[v] = computeVariantMetrics(decisions.filter((d) => d.variant === v));
  }
  return {
    mode: 'mock',
    generatedAt: '2026-11-20T10:00:00.000Z',
    model: null,
    modelRole: 'tactical',
    rulesVersion: null,
    repeats: 1,
    scenarios: 0,
    variants,
    decisions,
    metrics,
    comparisons:
      variants.includes('openai-rules') && variants.includes('openai-no-rules')
        ? compareAll(
            decisions.filter((d) => d.variant === 'openai-rules'),
            decisions.filter((d) => d.variant === 'openai-no-rules'),
          )
        : [],
    usageByRules: { withRules: empty, withoutRules: empty, total: empty },
    stopped: null,
    spentMicroUsd: 0,
    maxUsd: null,
  };
}

describe('boundaries (TC-BEN-06)', () => {
  it('0 decisions: every rate / mean / percentile is null, sums are 0', () => {
    const m = computeVariantMetrics([]);
    expect(m).toEqual({
      decisions: 0,
      validRate: null,
      unjustifiedPassRate: null,
      goalScore: null,
      expectedHitRate: null,
      fallbacks: 0,
      fallbackCodes: [],
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      meanRulesChars: null,
      costMicroUsd: 0,
      costPerDecisionMicroUsd: null,
      latencyP50Ms: null,
      latencyP95Ms: null,
    });
  });

  it('1 decision: p50 = p95; all fallback: validRate 0; equal latencies: p50 = p95', () => {
    const one = computeVariantMetrics([decision({ durationMs: 42 })]);
    expect(one.latencyP50Ms).toBe(42);
    expect(one.latencyP95Ms).toBe(42);
    const allFallback = computeVariantMetrics([
      decision({ valid: false, source: 'bot', fallbackCode: 'AI_TIMEOUT' }),
      decision({ valid: false, source: 'bot', fallbackCode: 'AI_TIMEOUT' }),
    ]);
    expect(allFallback.validRate).toBe(0);
    expect(allFallback.fallbacks).toBe(2);
    expect(allFallback.fallbackCodes).toEqual(['AI_TIMEOUT']);
    const ties = computeVariantMetrics(
      Array.from({ length: 7 }, (_, i) => decision({ durationMs: 33, repeat: i + 1 })),
    );
    expect(ties.latencyP50Ms).toBe(33);
    expect(ties.latencyP95Ms).toBe(33);
  });

  it('repeats of one scenario are separate decisions', () => {
    const m = computeVariantMetrics([
      decision({ repeat: 1, rubricScore: 1 }),
      decision({ repeat: 2, rubricScore: 0 }),
      decision({ repeat: 3, rubricScore: 0.5 }),
    ]);
    expect(m.decisions).toBe(3);
    expect(m.goalScore).toBe(0.5);
  });

  it('empty and partial reports: null → `null` in JSON and `n/a` in Markdown, never NaN', () => {
    const variants: BenchVariant[] = ['bot', 'openai-no-rules', 'openai-rules'];
    for (const r of [
      report([], variants),
      report([decision({ variant: 'openai-rules' })], variants),
      report([decision({ variant: 'bot', source: 'bot' })], ['bot']),
    ]) {
      const json = renderBenchReportJson(r);
      const md = renderBenchReportMarkdown(r);
      expect(json).not.toMatch(/NaN|Infinity/);
      expect(md).not.toMatch(/NaN|Infinity|undefined/);
      expect(md).toContain('n/a');
    }
    const empty = JSON.parse(renderBenchReportJson(report([], variants))) as BenchReport;
    expect(empty.metrics.bot?.goalScore).toBeNull();
    expect(empty.metrics.bot?.latencyP95Ms).toBeNull();
    expect(empty.comparisons.every((c) => c.verdict === 'n/a' && c.delta === null)).toBe(true);
  });

  it('report file stem is <mode>-<YYYYMMDD-HHmmss> in UTC', () => {
    expect(reportFileStem('real', new Date('2026-11-20T09:05:07.123Z'))).toBe(
      'real-20261120-090507',
    );
    expect(reportFileStem('mock', new Date('2026-01-02T23:59:59.999Z'))).toBe(
      'mock-20260102-235959',
    );
  });
});

/** Decisions of one variant: one per scenario with the given goal scores (and optional cost). */
function perScenario(
  variant: BenchVariant,
  scores: readonly RubricScoreLike[],
  cost: (i: number) => number = () => 0,
): BenchDecision[] {
  return scores.map((s, i) =>
    decision({
      variant,
      scenarioId: `s-${String(i).padStart(2, '0')}`,
      rubricScore: s,
      costMicroUsd: cost(i),
    }),
  );
}
type RubricScoreLike = 0 | 0.25 | 0.5 | 1;

describe('BenchComparison (TC-BEN-13)', () => {
  it('(a) a stable difference: an effect only because the 95% CI excludes 0, in the right direction', () => {
    const rules = perScenario(
      'openai-rules',
      [1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1],
      (i) => 300 + i,
    );
    const off = perScenario(
      'openai-no-rules',
      [0.5, 0.5, 0.25, 0.5, 0.5, 0.25, 0.5, 0, 0.5, 0.25, 0.5, 0.5],
      (i) => 100 + i,
    );
    const goal = compareVariants(rules, off, 'goalScore');
    expect(goal.scenarios).toBe(12);
    expect(goal.delta).toBeCloseTo(0.5625, 12);
    expect(goal.ciLow).not.toBeNull();
    expect(goal.ciLow!).toBeGreaterThan(0);
    expect(goal.verdict).toBe('rules-better');
    // Higher cost with rules is worse.
    const cost = compareVariants(rules, off, 'costPerDecisionMicroUsd');
    expect(cost.delta).toBe(200);
    expect(cost.ciLow).toBe(200);
    expect(cost.ciHigh).toBe(200);
    expect(cost.verdict).toBe('rules-worse');
    // And the reverse is better.
    expect(compareVariants(off, rules, 'goalScore').verdict).toBe('rules-worse');
    expect(compareVariants(off, rules, 'costPerDecisionMicroUsd').verdict).toBe('rules-better');
  });

  it('(b) a difference within the noise: no measurable effect (CI contains 0)', () => {
    const rules = perScenario('openai-rules', [1, 0, 1, 0, 0.5, 0.5, 1, 0.25]);
    const off = perScenario('openai-no-rules', [0, 1, 0.5, 0.5, 0.5, 0.25, 0.5, 1]);
    const c = compareVariants(rules, off, 'goalScore');
    expect(c.ciLow!).toBeLessThan(0);
    expect(c.ciHigh!).toBeGreaterThan(0);
    expect(c.verdict).toBe('no-measurable-effect');
    // Identical variants: Δ 0, zero-width CI at 0 → no effect.
    const same = compareVariants(
      rules,
      perScenario('openai-no-rules', [1, 0, 1, 0, 0.5, 0.5, 1, 0.25]),
      'goalScore',
    );
    expect(same.delta).toBe(0);
    expect(same.verdict).toBe('no-measurable-effect');
  });

  it('(c) one common scenario: n/a without an interval; none: delta null; never NaN', () => {
    const one = compareVariants(
      perScenario('openai-rules', [1]),
      perScenario('openai-no-rules', [0]),
      'goalScore',
    );
    expect(one).toEqual({
      metric: 'goalScore',
      scenarios: 1,
      delta: 1,
      ciLow: null,
      ciHigh: null,
      verdict: 'n/a',
    });
    const none = compareVariants([], perScenario('openai-no-rules', [0]), 'goalScore');
    expect(none.delta).toBeNull();
    expect(none.verdict).toBe('n/a');
    for (const c of compareAll(perScenario('openai-rules', [1]), [])) {
      expect(c.verdict).toBe('n/a');
      expect(Number.isNaN(c.delta ?? 0)).toBe(false);
    }
  });

  it('per-scenario means are paired: repeats of a scenario are averaged first', () => {
    const rules = [
      decision({ variant: 'openai-rules', scenarioId: 'a', rubricScore: 1, repeat: 1 }),
      decision({ variant: 'openai-rules', scenarioId: 'a', rubricScore: 0, repeat: 2 }),
      decision({ variant: 'openai-rules', scenarioId: 'b', rubricScore: 1, repeat: 1 }),
    ];
    const off = [
      decision({ variant: 'openai-no-rules', scenarioId: 'a', rubricScore: 0, repeat: 1 }),
      decision({ variant: 'openai-no-rules', scenarioId: 'b', rubricScore: 0.5, repeat: 1 }),
      // Not in the rules variant: ignored.
      decision({ variant: 'openai-no-rules', scenarioId: 'c', rubricScore: 1, repeat: 1 }),
    ];
    const c = compareVariants(rules, off, 'goalScore');
    expect(c.scenarios).toBe(2);
    expect(c.delta).toBe(0.5); // a: 0.5 − 0, b: 1 − 0.5
    const tokens = compareVariants(
      [
        decision({ variant: 'openai-rules', scenarioId: 'a', inputTokens: 300 }),
        decision({ variant: 'openai-rules', scenarioId: 'a', inputTokens: 500 }),
      ],
      [decision({ variant: 'openai-no-rules', scenarioId: 'a', inputTokens: 100 })],
      'inputTokens',
    );
    expect(tokens.delta).toBe(300); // per-decision mean 400 − 100
  });
});

describe('rubric classification (QD-25 rule)', () => {
  const rubric = {
    expected: [{ type: 'MOVE', target: 'x' }],
    acceptable: [{ type: 'MOVE' }],
    wrong: [{ type: 'PASS' }, { type: 'MOVE', summaryIncludes: 'everything' }],
  };

  it('first hit in the order expected → acceptable → wrong; unmatched otherwise', () => {
    expect(
      classifyCandidate(rubric, { type: 'MOVE', target: 'x', summary: 'move everything' }),
    ).toBe('expected');
    expect(
      classifyCandidate(rubric, { type: 'MOVE', target: 'y', summary: 'move everything' }),
    ).toBe('acceptable');
    expect(classifyCandidate(rubric, { type: 'PASS', summary: 'pass' })).toBe('wrong');
    expect(classifyCandidate(rubric, { type: 'FINISH', summary: 'finish' })).toBe('unmatched');
    expect(RUBRIC_SCORES).toEqual({ expected: 1, acceptable: 0.5, wrong: 0, unmatched: 0.25 });
  });

  it('matchers compare type, target (if given) and a summary substring (if given)', () => {
    expect(matchesCandidate({ type: 'A' }, { type: 'A', summary: 's' })).toBe(true);
    expect(matchesCandidate({ type: 'A' }, { type: 'B', summary: 's' })).toBe(false);
    expect(matchesCandidate({ type: 'A', target: 't' }, { type: 'A', summary: 's' })).toBe(false);
    expect(
      matchesCandidate({ type: 'A', target: 't' }, { type: 'A', target: 't', summary: 's' }),
    ).toBe(true);
    expect(
      matchesCandidate({ type: 'A', summaryIncludes: 'ab' }, { type: 'A', summary: 'xaby' }),
    ).toBe(true);
    expect(
      matchesCandidate({ type: 'A', summaryIncludes: 'ab' }, { type: 'A', summary: 'xAby' }),
    ).toBe(false);
  });
});
