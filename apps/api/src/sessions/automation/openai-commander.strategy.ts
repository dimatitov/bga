/**
 * OpenAI strategy of the automated participant (SWR-006 Contract §3, plan-backend §8.2; Q-7, Q-20, Q-BE-1, Q-BE-2,
 * Q-BE-7). On top of the unchanged SWR-005B `AiDecisionService.decide(ctx, 'auto')` (pricing → availability → budget
 * reservation → provider → `validateDecision` → one `AiUsage` row), with `budgetKey = sessionId` and the commander
 * prompt. Every failure → the bot's pick with a fallback code; the run never fails because of the model.
 *
 * - `< 2` candidates → the bot without a call and without a fallback code (not a failure).
 * - After `AI_NOT_CONFIGURED`, `AI_BUDGET_EXCEEDED`, `AI_DEADLINE` or an exhausted quota the rest of THIS run is the
 *   bot without calls (and without `AiUsage` rows: one `budget_exceeded` row per run). After a timeout / 429 / 5xx /
 *   invalid answer the next step tries the model again (within the deadline).
 * - Deadline: `Promise.race` (AM-BE-5) without cancellation; the losing call finishes in the background, writes its
 *   `AiUsage` row and releases its reservation itself.
 * - The model's `reason` is dropped here: never stored, logged or shown to a player.
 *
 * SWR-008 (C-10, plan-backend §3.1 / §4.2): the prompt is built by `buildCommanderContext` — the SWR-006 context plus
 * the rules block of the session's game (`CommanderRunContext.rules`), selected ONLY from the point's public
 * `rulesQuery` and fitted under `maxPromptTokens`. The context is built only when a call is about to happen (after the
 * `< 2` / run-stopping / deadline checks: QD-8 — no selection after a stop). A prompt that does not fit even without
 * rules → the bot with `AI_PROMPT_TOO_LARGE`, without a call or a budget reservation; this code does NOT stop the run
 * (the size depends on the point). A failing selection → the decision without rules (`onRulesSelectionError`).
 */
import type { AutomationDecisionPoint, AutomationFallbackCode } from '@bga/platform';
import type { AiDecisionService } from '../../ai/ai-decision.service';
import { AiFailure } from '../../ai/ai.errors';
import type { AIDecisionContext, AIModelRole } from '../../ai/ai.types';
import { buildCommanderContext, type CommanderRulesConfig } from './commander-context';
import {
  botChoice,
  type CommanderChoice,
  type CommanderRun,
  type CommanderRunContext,
  type CommanderStrategy,
} from './commander-strategy';

/** Starts a timer; returns its cancel function. Injectable for unit tests. */
export type DeadlineTimer = (ms: number, onElapsed: () => void) => () => void;

export const realDeadlineTimer: DeadlineTimer = (ms, onElapsed) => {
  const handle = setTimeout(onElapsed, ms);
  handle.unref?.();
  return () => clearTimeout(handle);
};

export interface OpenAiCommanderDeps {
  decisions: Pick<AiDecisionService, 'decide'>;
  modelRole: AIModelRole;
  /** SWR-008 C-10: rules switch and limits (`aiCommander.rulesContext / rulesMaxChars / maxPromptTokens`). */
  rules: CommanderRulesConfig;
  /** Monotonic clock of the AI runtime (ms), the same clock as `CommanderRunContext.deadline`. */
  monotonicNow: () => number;
  timer?: DeadlineTimer;
  /**
   * Called with the class name of an unexpected error (no message, no data) and the run's session id, so the log line
   * can be linked to its session / `AiUsage.budgetKey` (review F-5; the id is never sent to a model, Q-BE-1).
   */
  onUnexpectedError?: (errorName: string, sessionId: string) => void;
  /**
   * SWR-008 (TC-FB-09, QD-27): called with the class name of a failed rules selection (no message, no data) and the
   * run's session / game ids (server log only, like F-5; never sent to a model); the decision goes on without rules.
   */
  onRulesSelectionError?: (errorName: string, sessionId: string, gameId: string) => void;
}

/** Codes after which the rest of the run is played by the bot without calls (Q-7). */
const RUN_STOPPING: ReadonlySet<AutomationFallbackCode> = new Set([
  'AI_NOT_CONFIGURED',
  'AI_BUDGET_EXCEEDED',
  'AI_DEADLINE',
]);

/** Fallback code of an AI-layer failure (anything outside the D-PO-3 list → `AI_PROVIDER_ERROR`, Q-23). */
export function fallbackCodeOf(failure: AiFailure): AutomationFallbackCode {
  switch (failure.code) {
    case 'AI_TIMEOUT':
    case 'AI_RATE_LIMITED':
    case 'AI_PROVIDER_ERROR':
    case 'AI_INVALID_DECISION':
    case 'AI_NOT_CONFIGURED':
    case 'AI_BUDGET_EXCEEDED':
      return failure.code;
    default:
      return 'AI_PROVIDER_ERROR';
  }
}

/** Whether a failure ends model calls for the rest of the run (Q-7: not configured, budget, quota). */
function stopsRun(failure: AiFailure, code: AutomationFallbackCode): boolean {
  return RUN_STOPPING.has(code) || failure.reason === 'quota';
}

function safeErrorName(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : 'UnknownError';
}

type RaceOutcome =
  | { kind: 'decision'; selectedActionId: string }
  | { kind: 'failure'; error: unknown }
  | { kind: 'deadline' };

export class OpenAiCommanderStrategy implements CommanderStrategy {
  readonly id = 'openai' as const;
  private readonly timer: DeadlineTimer;

  constructor(private readonly deps: OpenAiCommanderDeps) {
    this.timer = deps.timer ?? realDeadlineTimer;
  }

  startRun(ctx: CommanderRunContext): CommanderRun {
    let stopCode: AutomationFallbackCode | null = null;
    return {
      choose: async (point) => {
        if (point.candidates.length < 2) return botChoice(point);
        if (stopCode !== null) return botChoice(point, stopCode);
        const remaining = ctx.deadline - this.deps.monotonicNow();
        if (remaining <= 0) {
          stopCode = 'AI_DEADLINE';
          return botChoice(point, stopCode);
        }
        const fit = buildCommanderContext(point, {
          budgetKey: ctx.sessionId,
          modelRole: this.deps.modelRole,
          rules: ctx.rules,
          config: this.deps.rules,
          onSelectionError: (name) =>
            this.deps.onRulesSelectionError?.(name, ctx.sessionId, ctx.gameId ?? '-'),
        });
        // Even the prompt without rules is above the hard limit: no call, no reservation, the run goes on.
        if (!fit.ok) return botChoice(point, 'AI_PROMPT_TOO_LARGE');
        const raced = await this.race(fit.ctx, remaining);
        const choice = this.choiceOf(point, raced, ctx.sessionId);
        if (raced.kind === 'deadline') stopCode = 'AI_DEADLINE';
        if (raced.kind === 'failure' && raced.error instanceof AiFailure) {
          const code = fallbackCodeOf(raced.error);
          if (stopsRun(raced.error, code)) stopCode = code;
        }
        return choice;
      },
    };
  }

  private async race(ctx: AIDecisionContext, remainingMs: number): Promise<RaceOutcome> {
    let decision: Promise<RaceOutcome>;
    try {
      decision = this.deps.decisions.decide(ctx, 'auto').then(
        (result): RaceOutcome => ({
          kind: 'decision',
          selectedActionId: result.decision.selectedActionId,
        }),
        (error: unknown): RaceOutcome => ({ kind: 'failure', error }),
      );
    } catch (error) {
      decision = Promise.resolve({ kind: 'failure', error });
    }
    let cancel: () => void = () => undefined;
    const deadline = new Promise<RaceOutcome>((resolve) => {
      cancel = this.timer(remainingMs, () => resolve({ kind: 'deadline' }));
    });
    try {
      return await Promise.race([decision, deadline]);
    } finally {
      cancel();
    }
  }

  private choiceOf(
    point: AutomationDecisionPoint,
    raced: RaceOutcome,
    sessionId: string,
  ): CommanderChoice {
    switch (raced.kind) {
      case 'decision':
        return point.candidates.some((c) => c.id === raced.selectedActionId)
          ? { candidateId: raced.selectedActionId, source: 'openai' }
          : botChoice(point, 'AI_INVALID_DECISION');
      case 'deadline':
        return botChoice(point, 'AI_DEADLINE');
      case 'failure':
        if (raced.error instanceof AiFailure) {
          return botChoice(point, fallbackCodeOf(raced.error));
        }
        this.deps.onUnexpectedError?.(safeErrorName(raced.error), sessionId);
        return botChoice(point, 'AI_PROVIDER_ERROR');
    }
  }
}
