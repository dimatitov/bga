/**
 * Prompt-size limit of a commander decision (SWR-008 C-9, plan-backend §4.2; AC-10, TC-BUD-04..08). Pure and
 * deterministic: no I/O, no budget, no clock. Degradation order under the hard limit `L = maxPromptTokens`
 * (unit: `upperBoundInputTokens`, the same estimate the budget reservation uses):
 *
 *   rules off / no rules / nothing selected → no rules block ('none');
 *   full rules block fits                   → 'full';
 *   rules re-selected with fewer chars fit  → 'reduced' (whole lines dropped by the selector, pinned lines kept);
 *   prompt without rules fits               → 'dropped' (accounted with `dropped: true`, QD-9);
 *   otherwise                               → `{ ok: false }` → bot fallback `AI_PROMPT_TOO_LARGE`, no call, no hold.
 *
 * The limit is a hard one (AC-10): it applies to every commander prompt, also without rules. Nothing here touches the
 * budget: rules are never removed to save money (QD-11) — a budget shortfall stays `AI_BUDGET_EXCEEDED` of SWR-006.
 */
import type { RulesContextResult } from '@bga/platform';
import type { AIDecisionContext, AIRulesAccounting, AIRulesBlock } from './ai.types';
import { buildPrompt, upperBoundInputTokens } from './prompt';

export type PromptFitLevel = 'none' | 'full' | 'reduced' | 'dropped';

export type PromptFit =
  | { ok: true; ctx: AIDecisionContext; level: PromptFitLevel; upperBoundTokens: number }
  /** Even the prompt without rules is above the limit → `AI_PROMPT_TOO_LARGE`. */
  | { ok: false; upperBoundTokens: number };

export interface PromptFitRules {
  /** Selection with the configured `maxChars`. */
  result: RulesContextResult;
  /** Smallest usable `maxChars` of the provider (its pinned lines). */
  requiredChars: number;
  /** Same selection input, smaller `maxChars`. */
  reselect(maxChars: number): RulesContextResult;
}

export interface FitCommanderPromptInput {
  /** A `commander` context WITHOUT `rules` / `rulesAccounting` (any given are ignored). */
  base: AIDecisionContext;
  /** Config `rulesContext === 'on'`. */
  enabled: boolean;
  /** `null`: no provider for the game, or the selection failed. */
  rules: PromptFitRules | null;
  maxPromptTokens: number;
}

const OFF_ACCOUNTING: AIRulesAccounting = Object.freeze({
  enabled: false,
  rulesVersion: null,
  ruleIds: Object.freeze([]) as readonly string[],
  chars: 0,
  truncated: false,
  dropped: false,
});

/** Upper bound of the input tokens of the prompt `ctx` produces (the reservation basis). */
export function promptUpperBound(ctx: AIDecisionContext): number {
  return upperBoundInputTokens(
    buildPrompt(ctx),
    ctx.availableActions.map((a) => a.id),
  );
}

/**
 * Fits a commander prompt under `maxPromptTokens` (see the module comment). Fills `ctx.rules` (only when a rules
 * block is sent) and `ctx.rulesAccounting` (always). Same input → same level and the same bytes.
 */
export function fitCommanderPrompt(input: FitCommanderPromptInput): PromptFit {
  const { rules: _ignoredRules, rulesAccounting: _ignoredAccounting, ...base } = input.base;
  if (base.purpose !== 'commander') {
    throw new TypeError('fitCommanderPrompt needs a commander context');
  }
  const limit = input.maxPromptTokens;
  const without = (accounting: AIRulesAccounting): AIDecisionContext => ({
    ...base,
    rulesAccounting: accounting,
  });
  const baseBound = promptUpperBound(base);
  /** No rules block is sent: still the hard limit. */
  const noRules = (level: 'none' | 'dropped', accounting: AIRulesAccounting): PromptFit =>
    baseBound <= limit
      ? { ok: true, ctx: without(accounting), level, upperBoundTokens: baseBound }
      : { ok: false, upperBoundTokens: baseBound };

  // 1. Rules off.
  if (!input.enabled) return noRules('none', OFF_ACCOUNTING);

  // 2. No provider / failed selection / nothing selected.
  const rules = input.rules;
  if (rules === null || rules.result.text === '') {
    return noRules('none', {
      enabled: true,
      rulesVersion: rules?.result.rulesVersion ?? null,
      ruleIds: [],
      chars: 0,
      truncated: false,
      dropped: false,
    });
  }

  // 3. Full block.
  const full = withRules(base, rules.result, rules.result.truncated);
  const fullBound = promptUpperBound(full);
  if (fullBound <= limit)
    return { ok: true, ctx: full, level: 'full', upperBoundTokens: fullBound };

  // 4. Reduced block: ask the selector for fewer chars (whole lines, pinned lines kept). `excess` is in bytes and a
  //    char is ≥ 1 byte, so one step is enough for ASCII; for multi-byte text the step repeats while it shrinks.
  let previous = rules.result;
  let bound = fullBound;
  for (;;) {
    const maxChars = previous.text.length - (bound - limit);
    if (maxChars < Math.max(rules.requiredChars, 1)) break;
    let next: RulesContextResult;
    try {
      next = rules.reselect(maxChars);
    } catch {
      break; // a failing re-selection never fails the decision: fall through to the prompt without rules
    }
    if (next.text === '' || next.text.length >= previous.text.length) break;
    const reduced = withRules(base, next, true);
    bound = promptUpperBound(reduced);
    if (bound <= limit)
      return { ok: true, ctx: reduced, level: 'reduced', upperBoundTokens: bound };
    previous = next;
  }

  // 5./6. Without rules (dropped, the version is kept) or AI_PROMPT_TOO_LARGE.
  return noRules('dropped', {
    enabled: true,
    rulesVersion: rules.result.rulesVersion,
    ruleIds: [],
    chars: 0,
    truncated: false,
    dropped: true,
  });
}

function withRules(
  base: AIDecisionContext,
  result: RulesContextResult,
  truncated: boolean,
): AIDecisionContext {
  const block: AIRulesBlock = {
    text: result.text,
    ruleIds: [...result.ruleIds],
    rulesVersion: result.rulesVersion,
    truncated,
  };
  return {
    ...base,
    rules: block,
    rulesAccounting: {
      enabled: true,
      rulesVersion: result.rulesVersion,
      ruleIds: [...result.ruleIds],
      chars: result.text.length,
      truncated,
      dropped: false,
    },
  };
}
