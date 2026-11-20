/**
 * AI Commander of a `core-v1` AI game, as the table shows it (SWR-006 plan-frontend §6.2–§6.4). Pure helpers:
 * which side is the AI (public settings), whether an event / a command concerns it, the label and the turn
 * summary texts. Everything comes from the public settings and the automation aggregates of the server
 * (`strategy`, `steps`, `fallbacks`, `fallbackReasons`, `stopReason`) — never from the model (no reasons, no budgets).
 */
import type { AutomationRunSummary, AutomationStrategyId } from '@bga/platform';
import type { Command, FactionId, RebellionSettings } from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';
import type { AutomationPhase } from '@/platform';

type AiSettings = Pick<RebellionSettings, 'opponentType' | 'opponentFaction'>;

/** The AI side of the game, or `null` in a hot-seat game. */
export function aiSideOf(settings: AiSettings): FactionId | null {
  return settings.opponentType === 'ai' ? settings.opponentFaction : null;
}

/** Whether `actor` (an event actor: a side or `system`) is the AI side of the game. */
export function isAiActor(actor: string, settings: AiSettings): boolean {
  const ai = aiSideOf(settings);
  return ai !== null && actor === ai;
}

/** Commands that hand the turn over (the AI may move in the same response, Q-FE-3). */
export function handsTurnOver(command: Pick<Command, 'type'> | null | undefined): boolean {
  return command?.type === 'PASS' || command?.type === 'FINISH_ACTIVATION';
}

/**
 * «ИИ думает…» (Q-FE-3): only in an AI game — while an automation run is in flight, or while the viewer's
 * `PASS` / `FINISH_ACTIVATION` request is in flight (the server plays the AI in the same request).
 */
export function isAiThinking(
  settings: AiSettings,
  phase: AutomationPhase | null | undefined,
  pendingCommand: Pick<Command, 'type'> | null | undefined,
): boolean {
  if (aiSideOf(settings) === null) return false;
  return phase === 'running' || handsTurnOver(pendingCommand);
}

export type AiCommanderState = 'idle' | 'thinking' | 'stalled' | 'over';

/** `ai-commander-status[data-state]`: the game is over → `over`; a move in flight → `thinking`; a failed / unfinished run → `stalled`. */
export function aiCommanderState(input: {
  over: boolean;
  thinking: boolean;
  phase: AutomationPhase | null | undefined;
}): AiCommanderState {
  if (input.over) return 'over';
  if (input.thinking) return 'thinking';
  if (input.phase === 'error' || input.phase === 'stalled') return 'stalled';
  return 'idle';
}

/** «AI Commander · бот · Обычная» (no provider when the server reports none, Q-FE-6). */
export function aiCommanderLabel(
  t: TFunction,
  strategy: AutomationStrategyId | null | undefined,
  difficulty: RebellionSettings['aiDifficulty'],
): string {
  const provider = strategy ? t(`rebellion.match:ai.provider.${strategy}`) : null;
  const level = difficulty ? t(`rebellion.common:difficulty.${difficulty}`) : null;
  if (provider && level) return t('rebellion.match:ai.label', { provider, difficulty: level });
  if (level) return t('rebellion.match:ai.labelNoProvider', { difficulty: level });
  if (provider) return t('rebellion.match:ai.labelNoDifficulty', { provider });
  return t('rebellion.match:ai.name');
}

/** «Ход AI: 3 действия» (+ «— партия окончена» when the AI turn ended the game); `null` without steps. */
export function aiSummaryText(
  t: TFunction,
  summary: Pick<AutomationRunSummary, 'steps' | 'stopReason'>,
): string | null {
  if (summary.steps <= 0) return null;
  const text = t('rebellion.match:ai.summary', { count: summary.steps });
  return summary.stopReason === 'gameOver'
    ? `${text} ${t('rebellion.match:ai.summaryGameOver')}`
    : text;
}

/** Whether the fallback notice is shown: OpenAI strategy and at least one step made by the bot (spec §6). */
export function hasAiFallback(
  summary: Pick<AutomationRunSummary, 'strategy' | 'fallbacks'>,
): boolean {
  return summary.strategy === 'openai' && summary.fallbacks > 0;
}

/**
 * `isPending` / `aiThinking` of the table context (plan-frontend §6.2): actions are blocked while the viewer's
 * command or an AI run is in flight; «ИИ думает…» per `isAiThinking`. Hot-seat: the automation is ignored.
 */
export function coreAutomationFlags(
  settings: AiSettings,
  phase: AutomationPhase | null | undefined,
  sending: boolean,
  pendingCommand: Pick<Command, 'type'> | null | undefined,
): { isPending: boolean; aiThinking: boolean } {
  const aiGame = aiSideOf(settings) !== null;
  return {
    isPending: sending || (aiGame && phase === 'running'),
    aiThinking: isAiThinking(settings, phase, pendingCommand),
  };
}
