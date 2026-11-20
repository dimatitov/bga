import {
  type AiCostGroup,
  type AiDecisionDiagnostic,
  type AiSessionDecisionsResponse,
} from '@bga/platform';
import { isApiError, isNotFound } from '@/shared/api/errors';
import { formatUsd } from '../format';

/**
 * Pure view model of the dev decision panel (SWR-008 plan-frontend §2.4–§2.5). Only wire fields of
 * `AiSessionDecisionsResponseSchema` are read; nothing is derived from the game view. Every formatter returns a
 * string or `null` (the caller shows the localized «—»), never `NaN` / `undefined`.
 */

export type PanelState = 'loading' | 'ready' | 'error' | 'unavailable' | 'forbidden';
export type PanelErrorReason = Exclude<PanelState, 'loading' | 'ready'>;

/** 404 → the API has no dev module (production); 403 → not a loopback client; anything else → error. */
export function panelErrorReason(error: unknown): PanelErrorReason {
  if (isNotFound(error)) return 'unavailable';
  if (isApiError(error) && error.status === 403) return 'forbidden';
  return 'error';
}

export interface DecisionRow {
  /** Index in the response (0 = oldest of ≤ 50) — the `n` of `dev-ai-session-decision-<n>`. */
  index: number;
  decision: AiDecisionDiagnostic;
}

/** Newest first for display; `index` stays the response index. */
export function decisionRowsNewestFirst(decisions: readonly AiDecisionDiagnostic[]): DecisionRow[] {
  return decisions.map((decision, index) => ({ index, decision })).reverse();
}

/** Fallback code of a decision: `errorCode`, else the `AiUsage` status; `null` — no fallback. */
export function fallbackCode(d: AiDecisionDiagnostic): string | null {
  return d.fallback ? (d.errorCode ?? d.status) : null;
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Micro-dollars → USD text (`113` → `$0.000113`); `null` / non-finite → `null`. */
export function formatMicroUsd(micro: number | null | undefined, lng: string): string | null {
  return isNum(micro) ? formatUsd(micro / 1_000_000, lng) : null;
}

/** Integer with group separators; `null` / non-finite → `null`. */
export function formatInt(value: number | null | undefined, lng: string): string | null {
  return isNum(value)
    ? new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(value)
    : null;
}

/** Local `HH:mm:ss` of an ISO timestamp; an unparsable value → `null`. */
export function formatTime(at: string, lng: string): string | null {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lng, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** Rule ids as one line; empty → `null`. */
export function ruleIdsText(ids: readonly string[]): string | null {
  return ids.length > 0 ? ids.join(', ') : null;
}

/** `data-*` of `dev-ai-session-decision-<n>` (plan-frontend §2.5). */
export function decisionDataAttrs(d: AiDecisionDiagnostic): Record<string, string> {
  return {
    'data-status': d.status,
    'data-fallback': String(d.fallback),
    'data-error-code': d.errorCode ?? '',
    'data-rules-enabled': String(d.rules.enabled),
    'data-rules-count': String(d.rules.count),
    'data-rules-ids': d.rules.ids.join(','),
    'data-rules-tokens': String(d.rules.tokensEstimate),
    'data-rules-chars': String(d.rules.chars),
    'data-rules-truncated': String(d.rules.truncated),
    'data-rules-dropped': String(d.rules.dropped),
    'data-input-tokens': String(d.inputTokens),
    'data-output-tokens': String(d.outputTokens),
    'data-cost-micro-usd': String(d.costMicroUsd),
  };
}

/** `data-*` of `dev-ai-session-totals` (micro-dollars). */
export function totalsDataAttrs(
  totals: AiSessionDecisionsResponse['totals'],
): Record<string, string> {
  return {
    'data-with-rules-decisions': String(totals.withRules.decisions),
    'data-with-rules-cost': String(totals.withRules.costMicroUsd),
    'data-without-rules-decisions': String(totals.withoutRules.decisions),
    'data-without-rules-cost': String(totals.withoutRules.costMicroUsd),
    'data-total-cost': String(totals.total.costMicroUsd),
  };
}

export interface CostGroupView {
  decisions: string;
  cost: string;
  /** `null` — group without decisions (`meanCostMicroUsd: null`). */
  mean: string | null;
}

export function costGroupView(group: AiCostGroup, lng: string): CostGroupView {
  return {
    decisions: formatInt(group.decisions, lng) ?? '0',
    cost: formatMicroUsd(group.costMicroUsd, lng) ?? formatUsd(0, lng),
    mean: formatMicroUsd(group.meanCostMicroUsd, lng),
  };
}
