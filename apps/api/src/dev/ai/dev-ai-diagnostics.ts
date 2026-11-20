/**
 * Dev-only AI decision diagnostics of one session (SWR-008 AC-13, plan-backend §6):
 * `GET /api/dev/ai/sessions/:sessionId/decisions` → `AiSessionDecisionsResponseSchema`.
 *
 * Data: the LAST `AI_SESSION_DECISIONS_LIMIT` `AiUsage` rows with `budgetKey = sessionId`, in time order (ascending),
 * plus `summarizeCostByRules` aggregates over every row of the session that made a model call (`countsAsModelCall`:
 * `attempts > 0` and not a `budget_exceeded` refusal — the benchmark's filter, review F-4). Budget refusals and failures
 * before the first attempt (not configured, unknown pricing) are still listed in `decisions`, but they do not dilute
 * the means of the totals. An unknown session is an empty answer (the endpoint does not reveal which sessions exist).
 *
 * Whitelist mapping (Q-BE-1, TC-DIAG-05): only the fields of the strict wire schema leave the server — never the
 * budget key / session id, the model's reason, prompt or rules text, `promptTokensUpperBound`, `pricingVersion`,
 * `role` or `reasoningTokens`. Tokens and cost are allowed (accepted limitation Q-BE-1). Rule ids are public (QD-7).
 *
 * Consistency of `rules` (QD-19): `count === ids.length`, `dropped ⇒ count = 0, ids = []`; `chars`/`tokensEstimate` are 0
 * when no id is reported. `insert` already enforces these invariants; the mapping re-derives them from the ids so that
 * a stored `rulesCount` can never disagree with the ids shown.
 */
import {
  AiSessionDecisionsResponseSchema,
  type AiCostGroup,
  type AiDecisionDiagnostic,
  type AiSessionDecisionsResponse,
} from '@bga/platform';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  ruleIdsOf,
  type AiUsageRecord,
  type AiUsageRepository,
} from '../../ai/ai-usage.repository';
import {
  summarizeCostByRules,
  type RulesCostGroup,
  type RulesCostRow,
} from '../../ai/cost-by-rules';

/** Max rows in `decisions` (= the `.max(50)` of the wire schema). */
export const AI_SESSION_DECISIONS_LIMIT = 50;

/** `:sessionId` of the route (plan §6); anything else → 400 `VALIDATION`. */
export const DevAiSessionIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

/** Columns the totals read: the cost-by-rules columns plus what `countsAsModelCall` needs. */
export type TotalsSourceRow = RulesCostRow & Pick<AiUsageRecord, 'attempts' | 'status'>;

/**
 * True when the row stands for a model call that was attempted (review F-4): at least one attempt and not a budget
 * refusal (`budget_exceeded` rows always have 0 attempts; the check repeats the benchmark's filter on purpose).
 */
export function countsAsModelCall(row: Pick<AiUsageRecord, 'attempts' | 'status'>): boolean {
  return row.attempts > 0 && row.status !== 'budget_exceeded';
}

/** Columns the per-decision mapping reads (whitelist: nothing else of the row is ever touched). */
export type DecisionSourceRow = Pick<
  AiUsageRecord,
  | 'createdAt'
  | 'provider'
  | 'model'
  | 'status'
  | 'errorCode'
  | 'attempts'
  | 'inputTokens'
  | 'cachedInputTokens'
  | 'outputTokens'
  | 'estimatedCostMicroUsd'
  | 'durationMs'
  | 'rulesEnabled'
  | 'rulesVersion'
  | 'rulesIds'
  | 'rulesChars'
  | 'rulesTokensEstimate'
  | 'rulesTruncated'
  | 'rulesDropped'
>;

/** One stored row → one wire decision (QD-19 consistency; whitelist of fields). */
export function toDecisionDiagnostic(row: DecisionSourceRow): AiDecisionDiagnostic {
  const ids = row.rulesDropped ? [] : ruleIdsOf(row);
  const sent = ids.length > 0;
  return {
    at: row.createdAt.toISOString(),
    // validated by the strict wire schema (`AIProviderIdSchema`) in `toSessionDecisionsResponse`
    provider: row.provider as AiDecisionDiagnostic['provider'],
    model: row.model,
    status: row.status,
    fallback: row.status !== 'ok',
    errorCode: row.errorCode,
    attempts: row.attempts,
    inputTokens: row.inputTokens,
    cachedInputTokens: row.cachedInputTokens,
    outputTokens: row.outputTokens,
    costMicroUsd: row.estimatedCostMicroUsd,
    durationMs: row.durationMs,
    rules: {
      enabled: row.rulesEnabled,
      rulesVersion: row.rulesVersion,
      count: ids.length,
      ids,
      chars: sent ? row.rulesChars : 0,
      tokensEstimate: sent ? row.rulesTokensEstimate : 0,
      truncated: row.rulesTruncated,
      dropped: row.rulesDropped,
    },
  };
}

function toCostGroup(g: RulesCostGroup): AiCostGroup {
  return {
    decisions: g.decisions,
    costMicroUsd: g.costMicroUsd,
    inputTokens: g.inputTokens,
    outputTokens: g.outputTokens,
    meanCostMicroUsd: g.meanCostMicroUsd,
  };
}

/**
 * Builds the wire answer: `recent` — the last rows in time order (≤ limit), `all` — every row of the session; the
 * totals count only the rows of `all` that made a model call (`countsAsModelCall`).
 * Parsed with the strict platform schema (fail closed: an unexpected field or value is a 500, never a leak).
 */
export function toSessionDecisionsResponse(
  recent: readonly DecisionSourceRow[],
  all: readonly TotalsSourceRow[],
): AiSessionDecisionsResponse {
  const totals = summarizeCostByRules(all.filter(countsAsModelCall));
  return AiSessionDecisionsResponseSchema.parse({
    decisions: recent.slice(-AI_SESSION_DECISIONS_LIMIT).map(toDecisionDiagnostic),
    totals: {
      withRules: toCostGroup(totals.withRules),
      withoutRules: toCostGroup(totals.withoutRules),
      total: toCostGroup(totals.total),
    },
  });
}

/** Read side (framework-free): `AiUsageRepository` for the recent rows, a narrow column select for the totals. */
export class DevAiSessionDiagnostics {
  constructor(
    private readonly usage: Pick<AiUsageRepository, 'listByBudgetKey'>,
    private readonly prisma: Pick<PrismaClient, 'aiUsage'>,
  ) {}

  async decisions(sessionId: string): Promise<AiSessionDecisionsResponse> {
    const [recent, all] = await Promise.all([
      this.usage.listByBudgetKey(sessionId, AI_SESSION_DECISIONS_LIMIT),
      this.prisma.aiUsage.findMany({
        where: { budgetKey: sessionId },
        select: {
          attempts: true,
          status: true,
          provider: true,
          rulesEnabled: true,
          rulesDropped: true,
          rulesCount: true,
          estimatedCostMicroUsd: true,
          inputTokens: true,
          cachedInputTokens: true,
          outputTokens: true,
          durationMs: true,
        },
      }),
    ]);
    return toSessionDecisionsResponse(recent, all);
  }
}
