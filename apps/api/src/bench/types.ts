/**
 * SWR-008 W8 (plan-backend §8, AC-14, AC-15): data types of the AI benchmark. Game-agnostic: a scenario file is DATA
 * of a game (`<gameId>` + stored states + a rubric over the candidates of each decision point); the harness reads it
 * through the game's `ServerGameModule` (parseState → automation) and never knows the game's vocabulary.
 *
 * File format (`formatVersion: 1`, plan-backend §8.1). Candidate ids are opaque, so a rubric matcher describes
 * candidates by content (`type`, optional `target`, optional summary substring).
 */
import { z } from 'zod';

const nonEmpty = z.string().min(1);

/** Matched against a candidate of the decision point: same `type`, and `target` / summary substring if given. */
export const BenchMatcherSchema = z.strictObject({
  type: nonEmpty,
  target: nonEmpty.optional(),
  summaryIncludes: nonEmpty.optional(),
});
export type BenchMatcher = z.infer<typeof BenchMatcherSchema>;

export const BenchRubricSchema = z.strictObject({
  /** Score 1: the action that best serves the side's goal here. */
  expected: z.array(BenchMatcherSchema).min(1),
  /** Score 0.5: does not hurt the goal, but advances it less. */
  acceptable: z.array(BenchMatcherSchema),
  /** Score 0: works against the goal or rests on a misread rule. A candidate matching nothing scores 0.25. */
  wrong: z.array(BenchMatcherSchema),
  /** Passing here is "unjustified": a legal non-pass candidate advances the side's goal. */
  passUnjustified: z.boolean(),
});
export type BenchRubric = z.infer<typeof BenchRubricSchema>;

export const BenchScenarioSchema = z.strictObject({
  /** Lowercase kebab id, unique in the file (also the report key). */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  /** Acting side (= the automation's pending actor of `state`); opaque to the harness. */
  side: nonEmpty,
  /** English; reports only — never sent to a model. */
  title: nonEmpty,
  goal: nonEmpty,
  /** Ids of the game's rules that justify the rubric (documentation; never sent by the harness). */
  justificationRuleIds: z.array(nonEmpty),
  sessionId: nonEmpty,
  version: z.int().min(1),
  /** Stored snapshot: the input of `module.parseState`. */
  state: z.unknown(),
  rubric: BenchRubricSchema,
});
export type BenchScenario = z.infer<typeof BenchScenarioSchema>;

export const BENCH_FORMAT_VERSION = 1;

export const BenchScenarioFileSchema = z
  .strictObject({
    formatVersion: z.literal(BENCH_FORMAT_VERSION),
    gameId: nonEmpty,
    scenarios: z.array(BenchScenarioSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const ids = file.scenarios.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['scenarios'], message: 'scenario ids must be unique' });
    }
  });
export type BenchScenarioFile = z.infer<typeof BenchScenarioFileSchema>;

/** Strategies compared by the benchmark (AC-14). */
export const BENCH_VARIANTS = ['bot', 'openai-no-rules', 'openai-rules'] as const;
export type BenchVariant = (typeof BENCH_VARIANTS)[number];

/** Rubric classes and their scores (first hit in the order expected → acceptable → wrong; unmatched = 0.25). */
export type RubricClass = 'expected' | 'acceptable' | 'wrong' | 'unmatched';
export type RubricScore = 0 | 0.25 | 0.5 | 1;

/** One decision of one variant on one scenario in one repeat. */
export interface BenchDecision {
  scenarioId: string;
  variant: BenchVariant;
  /** 1-based. */
  repeat: number;
  candidateId: string;
  candidateType: string;
  /** `model`: the model's answer was used; `bot`: the bot's pick (the `bot` variant, or a fallback). */
  source: 'bot' | 'model';
  /** Why the step fell back to the bot (the same codes as the in-game commander); `null` otherwise. */
  fallbackCode: string | null;
  /** The decision is a candidate chosen without a fallback (always true for the `bot` variant). */
  valid: boolean;
  rubricClass: RubricClass;
  rubricScore: RubricScore;
  expectedHit: boolean;
  /** The chosen candidate is a pass (`type === PASS_CANDIDATE_TYPE`). */
  pass: boolean;
  /** A pass in a scenario whose rubric says passing is unjustified. */
  unjustifiedPass: boolean;
  /** From the `AiUsage` row of the call (0 without a call). */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Integer micro-USD. */
  costMicroUsd: number;
  /** Wall-clock time of the whole step on the harness clock (decision service incl. retries), ms. */
  durationMs: number;
  /** The rules block that was SENT (0 / false without one). */
  rules: { count: number; chars: number; tokensEstimate: number; dropped: boolean };
}

export interface BenchVariantMetrics {
  decisions: number;
  validRate: number | null;
  /** Share of all decisions of the variant that are an unjustified pass. */
  unjustifiedPassRate: number | null;
  /** Mean rubric score (goal alignment). */
  goalScore: number | null;
  expectedHitRate: number | null;
  fallbacks: number;
  /** Unique, sorted. */
  fallbackCodes: string[];
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  meanRulesChars: number | null;
  /** Integer micro-USD. */
  costMicroUsd: number;
  costPerDecisionMicroUsd: number | null;
  /** Nearest-rank percentiles (QD-10). */
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
}

export const BENCH_COMPARISON_METRICS = [
  'goalScore',
  'expectedHitRate',
  'unjustifiedPassRate',
  'validRate',
  'costPerDecisionMicroUsd',
  'inputTokens',
  'latencyP50Ms',
] as const;
export type BenchComparisonMetric = (typeof BENCH_COMPARISON_METRICS)[number];

export type BenchVerdict = 'rules-better' | 'rules-worse' | 'no-measurable-effect' | 'n/a';

/**
 * `openai-rules` − `openai-no-rules`: per-scenario means → mean Δ over the scenarios present in both variants and its
 * 95% confidence interval (normal approximation, n = scenarios). An effect is claimed only when the CI excludes 0.
 */
export interface BenchComparison {
  metric: BenchComparisonMetric;
  /** Scenarios with a value in both variants. */
  scenarios: number;
  delta: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  verdict: BenchVerdict;
}

/** Aggregate of the accounting rows of a run, split by "a rules block was sent" (`summarizeCostByRules`). */
export interface BenchCostGroup {
  decisions: number;
  costMicroUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  meanCostMicroUsd: number | null;
  meanInputTokens: number | null;
  meanDurationMs: number | null;
}

export interface BenchReport {
  mode: 'mock' | 'real';
  generatedAt: string;
  /** Model snapshot of the first answered call (`mock-deterministic-v1` in mock mode); `null` without one. */
  model: string | null;
  modelRole: string;
  rulesVersion: string | null;
  repeats: number;
  scenarios: number;
  variants: BenchVariant[];
  decisions: BenchDecision[];
  metrics: Partial<Record<BenchVariant, BenchVariantMetrics>>;
  comparisons: BenchComparison[];
  /** `summarizeCostByRules` over every accounting row of the run (TC-MEAS-04). */
  usageByRules: { withRules: BenchCostGroup; withoutRules: BenchCostGroup; total: BenchCostGroup };
  /** `cost-cap`: the hard cost limit refused a call; the remaining model calls were not made. */
  stopped: null | 'cost-cap';
  /** Σ cost of the run's accounting rows, integer micro-USD. */
  spentMicroUsd: number;
  /** `--max-usd` of a real run; `null` in mock mode. */
  maxUsd: number | null;
}
