/**
 * Cost of AI decisions with and without rules (SWR-008 C-9, AC-12, TC-COST-03; `<cost-by-rules>` of test-cases.md).
 * Pure: aggregates `AiUsage` rows the caller has read (dev diagnostics, benchmark). Integer sums; a mean of 0 rows is
 * `null`, never `NaN`.
 *
 * Groups: `withRules` — rows whose request actually carried a rules block (`rulesEnabled && !rulesDropped &&
 * rulesCount > 0`); `withoutRules` — every other row (rules off, no rules for the game, nothing selected, dropped by the
 * prompt limit); `total` — all rows. Every given row counts (also mock rows at cost 0 and rows without a model call);
 * a caller that wants only paid calls filters before (e.g. by `provider`).
 */
import type { AiUsageRecord } from './ai-usage.repository';

export interface RulesCostGroup {
  decisions: number;
  costMicroUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** `null` for a group without rows. */
  meanCostMicroUsd: number | null;
  meanInputTokens: number | null;
  meanDurationMs: number | null;
}

export type RulesCostRow = Pick<
  AiUsageRecord,
  | 'rulesEnabled'
  | 'rulesDropped'
  | 'rulesCount'
  | 'estimatedCostMicroUsd'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'durationMs'
  | 'provider'
>;

export interface RulesCostSummary {
  withRules: RulesCostGroup;
  withoutRules: RulesCostGroup;
  total: RulesCostGroup;
}

/** True when the request of the row carried a rules block. */
export function sentRules(
  row: Pick<RulesCostRow, 'rulesEnabled' | 'rulesDropped' | 'rulesCount'>,
): boolean {
  return row.rulesEnabled && !row.rulesDropped && row.rulesCount > 0;
}

function group(rows: readonly RulesCostRow[]): RulesCostGroup {
  let costMicroUsd = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let durationMs = 0;
  for (const r of rows) {
    costMicroUsd += r.estimatedCostMicroUsd;
    inputTokens += r.inputTokens;
    cachedInputTokens += r.cachedInputTokens;
    outputTokens += r.outputTokens;
    durationMs += r.durationMs;
  }
  const n = rows.length;
  const mean = (sum: number): number | null => (n === 0 ? null : sum / n);
  return {
    decisions: n,
    costMicroUsd,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    meanCostMicroUsd: mean(costMicroUsd),
    meanInputTokens: mean(inputTokens),
    meanDurationMs: mean(durationMs),
  };
}

export function summarizeCostByRules(rows: readonly RulesCostRow[]): RulesCostSummary {
  const withRules: RulesCostRow[] = [];
  const withoutRules: RulesCostRow[] = [];
  for (const r of rows) (sentRules(r) ? withRules : withoutRules).push(r);
  return { withRules: group(withRules), withoutRules: group(withoutRules), total: group(rows) };
}
