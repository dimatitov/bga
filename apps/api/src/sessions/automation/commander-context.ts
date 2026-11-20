/**
 * Commander context of one automated decision (SWR-008 C-10, plan-backend §3.1 / §4.2). Pure and game-agnostic: shared
 * by `OpenAiCommanderStrategy` and the benchmark harness, so both send exactly the same prompt for the same point.
 *
 * 1. The SWR-006 context of the validated decision point (unchanged fields; `budgetKey` is never part of a prompt).
 * 2. The rules selection (only when rules are on and the game has a provider): its input is built ONLY by
 *    `rulesSelectionInputOf(point, maxChars)` — actor, phase and the public `rulesQuery` (R-1, QD-7). Candidates,
 *    situation, objective and the bot's pick never reach the selector, and no game state exists here.
 *    Any failure of the selection (an exception, or a result that breaks the `RulesContextResult` contract) →
 *    the decision goes on WITHOUT rules (`rules: null`); `onSelectionError` gets the error class name only.
 * 3. `fitCommanderPrompt` (W6a): full → reduced → dropped → `{ ok: false }` (= `AI_PROMPT_TOO_LARGE`, no call).
 */
import {
  RulesContextResultSchema,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
} from '@bga/platform';
import type { AIDecisionContext, AIModelRole } from '../../ai/ai.types';
import { fitCommanderPrompt, type PromptFit, type PromptFitRules } from '../../ai/prompt-fit';
import { errorName } from './automation-log';

/** Rules settings of the commander (`aiCommander.rulesContext / rulesMaxChars / maxPromptTokens`). */
export interface CommanderRulesConfig {
  /** `AI_COMMANDER_RULES_CONTEXT === 'on'`. */
  enabled: boolean;
  /** `AI_COMMANDER_RULES_MAX_CHARS`: `maxChars` of the selection. */
  maxChars: number;
  /** `AI_COMMANDER_MAX_PROMPT_TOKENS`: hard prompt limit (`upperBoundInputTokens`). */
  maxPromptTokens: number;
}

export interface BuildCommanderContextOptions {
  /** Budget key of the call (the session id); never sent to a model. */
  budgetKey: string;
  modelRole: AIModelRole;
  /** Rules provider of the session's game, or `null` (no rules / rules not loaded). */
  rules: RulesContextProvider | null;
  config: CommanderRulesConfig;
  /**
   * Called with the class name of an error of the rules selection (never its message or any data); the decision
   * then goes on without rules (TC-FB-09).
   */
  onSelectionError?: (errorName: string) => void;
}

/** The SWR-006 commander context of a decision point: only data of the point, no rules. */
export function commanderBaseContext(
  point: AutomationDecisionPoint,
  budgetKey: string,
  modelRole: AIModelRole,
): AIDecisionContext {
  return {
    purpose: 'commander',
    budgetKey,
    role: modelRole,
    side: point.actor,
    phase: point.phase,
    objective: point.objective,
    situation: point.situation,
    availableActions: point.candidates.map((c) => ({
      id: c.id,
      type: c.type,
      ...(c.target === undefined ? {} : { target: c.target }),
      summary: c.summary,
    })),
  };
}

/** A selection checked against the frozen result contract (a broken provider is treated like a throwing one). */
function select(provider: RulesContextProvider, input: RulesSelectionInput): RulesContextResult {
  return RulesContextResultSchema.parse(provider.selectRules(input));
}

/** The rules of this point for `fitCommanderPrompt`, or `null` when there are none or the selection failed. */
function rulesOf(
  point: AutomationDecisionPoint,
  opts: BuildCommanderContextOptions,
): PromptFitRules | null {
  const provider = opts.rules;
  if (!opts.config.enabled || provider === null) return null;
  try {
    const input = rulesSelectionInputOf(point, opts.config.maxChars);
    const result = select(provider, input);
    return {
      result,
      requiredChars: provider.requiredChars,
      // Same public input, smaller limit (the prompt-size step "reduced"); a throw here → "dropped".
      reselect: (maxChars) => select(provider, { ...input, maxChars }),
    };
  } catch (error) {
    opts.onSelectionError?.(errorName(error));
    return null;
  }
}

/**
 * The commander context of `point`, fitted under the prompt-size limit (C-10). Deterministic: the same point,
 * provider and config give the same level and the same prompt bytes. `ok: false` → the caller falls back to the
 * bot with `AI_PROMPT_TOO_LARGE` without calling the model (no reservation, no `AiUsage` row).
 */
export function buildCommanderContext(
  point: AutomationDecisionPoint,
  opts: BuildCommanderContextOptions,
): PromptFit {
  return fitCommanderPrompt({
    base: commanderBaseContext(point, opts.budgetKey, opts.modelRole),
    enabled: opts.config.enabled,
    rules: rulesOf(point, opts),
    maxPromptTokens: opts.config.maxPromptTokens,
  });
}
