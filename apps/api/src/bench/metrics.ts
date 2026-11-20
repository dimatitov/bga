/**
 * SWR-008 W8 (plan-backend §8.2, TR-6): pure benchmark functions — rubric classification, per-variant metrics,
 * nearest-rank percentiles (QD-10) and the rules-on vs rules-off comparison. No I/O, no clock. An empty sample gives
 * `null`, never `NaN`.
 */
import type { AutomationCandidate } from '@bga/platform';
import {
  BENCH_COMPARISON_METRICS,
  type BenchComparison,
  type BenchComparisonMetric,
  type BenchDecision,
  type BenchMatcher,
  type BenchRubric,
  type BenchVariantMetrics,
  type RubricClass,
  type RubricScore,
} from './types';

/** Candidate type of a pass (game-independent convention of the decision points: "do nothing this turn"). */
export const PASS_CANDIDATE_TYPE = 'PASS';

export const RUBRIC_SCORES: Readonly<Record<RubricClass, RubricScore>> = Object.freeze({
  expected: 1,
  acceptable: 0.5,
  wrong: 0,
  unmatched: 0.25,
});

/** Does `candidate` satisfy `matcher`? (`type` equal; `target` equal if given; `summary` contains the substring.) */
export function matchesCandidate(
  matcher: BenchMatcher,
  candidate: Pick<AutomationCandidate, 'type' | 'target' | 'summary'>,
): boolean {
  if (candidate.type !== matcher.type) return false;
  if (matcher.target !== undefined && candidate.target !== matcher.target) return false;
  if (matcher.summaryIncludes !== undefined && !candidate.summary.includes(matcher.summaryIncludes))
    return false;
  return true;
}

/** Rubric class of a candidate: the first hit in the order expected → acceptable → wrong (QD-25). */
export function classifyCandidate(
  rubric: Pick<BenchRubric, 'expected' | 'acceptable' | 'wrong'>,
  candidate: Pick<AutomationCandidate, 'type' | 'target' | 'summary'>,
): RubricClass {
  if (rubric.expected.some((m) => matchesCandidate(m, candidate))) return 'expected';
  if (rubric.acceptable.some((m) => matchesCandidate(m, candidate))) return 'acceptable';
  if (rubric.wrong.some((m) => matchesCandidate(m, candidate))) return 'wrong';
  return 'unmatched';
}

/**
 * Nearest-rank percentile (QD-10): the smallest value such that at least `p`% of the sample is ≤ it, i.e. the value
 * at rank `ceil(p/100 · n)` of the ascending sample. `p` in (0, 100]. Empty sample → `null`.
 */
export function percentileNearestRank(values: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError('p must be in (0, 100]');
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

function share(
  decisions: readonly BenchDecision[],
  pick: (d: BenchDecision) => boolean,
): number | null {
  if (decisions.length === 0) return null;
  let hits = 0;
  for (const d of decisions) if (pick(d)) hits += 1;
  return hits / decisions.length;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function computeVariantMetrics(decisions: readonly BenchDecision[]): BenchVariantMetrics {
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let costMicroUsd = 0;
  let fallbacks = 0;
  const codes = new Set<string>();
  for (const d of decisions) {
    inputTokens += d.inputTokens;
    cachedInputTokens += d.cachedInputTokens;
    outputTokens += d.outputTokens;
    costMicroUsd += d.costMicroUsd;
    if (d.fallbackCode !== null) {
      fallbacks += 1;
      codes.add(d.fallbackCode);
    }
  }
  const n = decisions.length;
  const latencies = decisions.map((d) => d.durationMs);
  return {
    decisions: n,
    validRate: share(decisions, (d) => d.valid),
    unjustifiedPassRate: share(decisions, (d) => d.unjustifiedPass),
    goalScore: mean(decisions.map((d) => d.rubricScore)),
    expectedHitRate: share(decisions, (d) => d.expectedHit),
    fallbacks,
    fallbackCodes: [...codes].sort(),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    meanRulesChars: mean(decisions.map((d) => d.rules.chars)),
    costMicroUsd,
    costPerDecisionMicroUsd: n === 0 ? null : costMicroUsd / n,
    latencyP50Ms: percentileNearestRank(latencies, 50),
    latencyP95Ms: percentileNearestRank(latencies, 95),
  };
}

/** Higher is better for these metrics; lower is better for the rest (pass rate, cost, tokens, latency). */
const HIGHER_IS_BETTER: ReadonlySet<BenchComparisonMetric> = new Set([
  'goalScore',
  'expectedHitRate',
  'validRate',
]);

/** z of the two-sided 95% normal interval. */
export const Z_95 = 1.959963984540054;
const FLOAT_NOISE = 1e-9;

/** Per-scenario value of a comparison metric (`inputTokens`: mean per decision). */
function scenarioValue(
  decisions: readonly BenchDecision[],
  metric: BenchComparisonMetric,
): number | null {
  if (decisions.length === 0) return null;
  if (metric === 'inputTokens')
    return computeVariantMetrics(decisions).inputTokens / decisions.length;
  return computeVariantMetrics(decisions)[metric];
}

function byScenario(decisions: readonly BenchDecision[]): Map<string, BenchDecision[]> {
  const out = new Map<string, BenchDecision[]>();
  for (const d of decisions) {
    const list = out.get(d.scenarioId);
    if (list) list.push(d);
    else out.set(d.scenarioId, [d]);
  }
  return out;
}

/**
 * Paired comparison of `rules` against `noRules` (TC-BEN-13): for every scenario with a value in both variants,
 * d = value(rules) − value(noRules); Δ = mean d; 95% CI = Δ ± z·s/√n (s: sample standard deviation, n−1). Fewer than
 * 2 scenarios → no interval and verdict `n/a`. An effect is claimed only when the CI excludes 0.
 */
export function compareVariants(
  rules: readonly BenchDecision[],
  noRules: readonly BenchDecision[],
  metric: BenchComparisonMetric,
): BenchComparison {
  const withRules = byScenario(rules);
  const without = byScenario(noRules);
  const ids = [...withRules.keys()].filter((id) => without.has(id)).sort();
  const diffs: number[] = [];
  for (const id of ids) {
    const a = scenarioValue(withRules.get(id) ?? [], metric);
    const b = scenarioValue(without.get(id) ?? [], metric);
    if (a !== null && b !== null) diffs.push(a - b);
  }
  const n = diffs.length;
  const delta = mean(diffs);
  if (delta === null || n < 2) {
    return { metric, scenarios: n, delta, ciLow: null, ciHigh: null, verdict: 'n/a' };
  }
  let squares = 0;
  for (const d of diffs) squares += (d - delta) ** 2;
  const halfWidth = Z_95 * Math.sqrt(squares / (n - 1) / n);
  const ciLow = delta - halfWidth;
  const ciHigh = delta + halfWidth;
  let verdict: BenchComparison['verdict'] = 'no-measurable-effect';
  // A bound within float noise of 0 does not exclude 0.
  if (ciLow > FLOAT_NOISE || ciHigh < -FLOAT_NOISE) {
    const rulesHigher = ciLow > FLOAT_NOISE;
    verdict = rulesHigher === HIGHER_IS_BETTER.has(metric) ? 'rules-better' : 'rules-worse';
  }
  return { metric, scenarios: n, delta, ciLow, ciHigh, verdict };
}

/** All comparison metrics, in the fixed order of `BENCH_COMPARISON_METRICS`. */
export function compareAll(
  rules: readonly BenchDecision[],
  noRules: readonly BenchDecision[],
): BenchComparison[] {
  return BENCH_COMPARISON_METRICS.map((metric) => compareVariants(rules, noRules, metric));
}
