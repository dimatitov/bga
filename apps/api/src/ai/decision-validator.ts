/**
 * The single acceptance point of a model decision (SWR-005B, plan-backend §5.6 step 6; AC-04; AM-BE-5, Q-8).
 * Runs for every provider. Accepts only: a strict `{ selectedActionId, reason }` object whose id is one of the legal
 * action ids. `reason` is trimmed and cut to 300 characters; empty after trim → invalid. Nothing is executed here.
 */
import { AI_REASON_MAX_LENGTH } from '@bga/platform';
import { DecisionOutputSchema, type DecisionOutput } from './decision-schema';

export type DecisionValidation =
  { ok: true; decision: DecisionOutput } | { ok: false; reason: 'schema' | 'not_in_actions' };

/** Trim and cut to `max` UTF-16 units without splitting a surrogate pair; trailing space after the cut is removed. */
export function normalizeReason(raw: string, max = AI_REASON_MAX_LENGTH): string {
  let text = raw.trim();
  if (text.length > max) {
    text = text.slice(0, max);
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1);
    text = text.trimEnd();
  }
  return text;
}

export function validateDecision(raw: unknown, actionIds: readonly string[]): DecisionValidation {
  const parsed = DecisionOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'schema' };
  const reason = normalizeReason(parsed.data.reason);
  if (reason.length === 0) return { ok: false, reason: 'schema' };
  if (!actionIds.includes(parsed.data.selectedActionId)) {
    return { ok: false, reason: 'not_in_actions' };
  }
  return { ok: true, decision: { selectedActionId: parsed.data.selectedActionId, reason } };
}
