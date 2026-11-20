/**
 * Strategies of the automated participant (SWR-006 Contract §3, plan-backend §6.1, AM-BE-3). Game-agnostic: a strategy
 * sees only the validated `AutomationDecisionPoint` the game built from the actor's own view and returns the id of one
 * of its candidates. The game's bot lives in the game (its pick is `fallbackCandidateId`); the server never knows it.
 */
import type {
  AutomationDecisionPoint,
  AutomationFallbackCode,
  AutomationStrategyId,
} from '@bga/platform';

export interface CommanderChoice {
  candidateId: string;
  source: 'bot' | 'openai';
  /** Set when the step fell back to the bot because of a failure (D-PO-3). */
  fallbackCode?: AutomationFallbackCode;
}

/** State of one automation run (deadline, "no more model calls in this run"). `choose` never rejects. */
export interface CommanderRun {
  choose(point: AutomationDecisionPoint): Promise<CommanderChoice>;
}

export interface CommanderRunContext {
  /** Budget key of paid calls; never sent to a model (Q-BE-1). */
  sessionId: string;
  /** Deadline of the run on the monotonic clock of the AI runtime (ms). */
  deadline: number;
}

export interface CommanderStrategy {
  readonly id: AutomationStrategyId;
  startRun(ctx: CommanderRunContext): CommanderRun;
}

/** The bot's own pick, without a failure code. */
export function botChoice(
  point: AutomationDecisionPoint,
  fallbackCode?: AutomationFallbackCode,
): CommanderChoice {
  return fallbackCode === undefined
    ? { candidateId: point.fallbackCandidateId, source: 'bot' }
    : { candidateId: point.fallbackCandidateId, source: 'bot', fallbackCode };
}

/** Default strategy (`AI_COMMANDER_PROVIDER=bot`): free, deterministic, no calls. */
export class BotCommanderStrategy implements CommanderStrategy {
  readonly id = 'bot' as const;

  startRun(): CommanderRun {
    return { choose: (point) => Promise.resolve(botChoice(point)) };
  }
}
