/** SWR-006 R-2 (plan-frontend §9): pure AI Commander helpers of the `core-v1` table. */
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import {
  CORE_EMPIRE_VS_AI,
  CORE_HOT_SEAT,
  CORE_REBELS_VS_AI,
  makeAutomationSummary,
} from '../../test/coreFixtures';
import {
  aiCommanderLabel,
  aiCommanderState,
  aiSideOf,
  aiSummaryText,
  coreAutomationFlags,
  handsTurnOver,
  hasAiFallback,
  isAiActor,
  isAiThinking,
} from './aiCommander';

const ru = i18n.getFixedT('ru');
const en = i18n.getFixedT('en');

describe('aiCommander (SWR-006 R-2)', () => {
  it('aiSideOf / isAiActor: the opponent faction of an AI game; nothing in hot-seat', () => {
    expect(aiSideOf(CORE_REBELS_VS_AI)).toBe('empire');
    expect(aiSideOf(CORE_EMPIRE_VS_AI)).toBe('rebels');
    expect(aiSideOf(CORE_HOT_SEAT)).toBeNull();
    expect(isAiActor('empire', CORE_REBELS_VS_AI)).toBe(true);
    expect(isAiActor('rebels', CORE_REBELS_VS_AI)).toBe(false);
    expect(isAiActor('system', CORE_REBELS_VS_AI)).toBe(false);
    expect(isAiActor('empire', CORE_HOT_SEAT)).toBe(false);
  });

  it('handsTurnOver: PASS / FINISH_ACTIVATION → true; ACTIVATE_SYSTEM / MOVE_PIECES / none → false (Q-FE-3)', () => {
    expect(handsTurnOver({ type: 'PASS' })).toBe(true);
    expect(handsTurnOver({ type: 'FINISH_ACTIVATION' })).toBe(true);
    expect(handsTurnOver({ type: 'ACTIVATE_SYSTEM' })).toBe(false);
    expect(handsTurnOver({ type: 'MOVE_PIECES' })).toBe(false);
    expect(handsTurnOver(null)).toBe(false);
  });

  it('isAiThinking / coreAutomationFlags: run in flight or hand-over command; hot-seat never', () => {
    expect(isAiThinking(CORE_REBELS_VS_AI, 'running', null)).toBe(true);
    expect(isAiThinking(CORE_REBELS_VS_AI, 'idle', { type: 'PASS' })).toBe(true);
    expect(isAiThinking(CORE_REBELS_VS_AI, 'idle', { type: 'ACTIVATE_SYSTEM' })).toBe(false);
    expect(isAiThinking(CORE_REBELS_VS_AI, 'stalled', null)).toBe(false);
    expect(isAiThinking(CORE_HOT_SEAT, 'running', { type: 'PASS' })).toBe(false);

    expect(coreAutomationFlags(CORE_REBELS_VS_AI, 'running', false, null)).toEqual({
      isPending: true,
      aiThinking: true,
    });
    expect(coreAutomationFlags(CORE_REBELS_VS_AI, null, true, { type: 'MOVE_PIECES' })).toEqual({
      isPending: true,
      aiThinking: false,
    });
    expect(coreAutomationFlags(CORE_HOT_SEAT, 'running', false, null)).toEqual({
      isPending: false,
      aiThinking: false,
    });
  });

  it('aiCommanderState: over > thinking > stalled (error|stalled) > idle', () => {
    expect(aiCommanderState({ over: true, thinking: true, phase: 'running' })).toBe('over');
    expect(aiCommanderState({ over: false, thinking: true, phase: 'running' })).toBe('thinking');
    expect(aiCommanderState({ over: false, thinking: false, phase: 'error' })).toBe('stalled');
    expect(aiCommanderState({ over: false, thinking: false, phase: 'stalled' })).toBe('stalled');
    expect(aiCommanderState({ over: false, thinking: false, phase: 'idle' })).toBe('idle');
    expect(aiCommanderState({ over: false, thinking: false, phase: null })).toBe('idle');
  });

  it('aiCommanderLabel: «AI Commander · бот · Обычная», OpenAI · Сложная, no provider (Q-FE-6)', () => {
    expect(aiCommanderLabel(ru, 'bot', 'normal')).toBe(
      `AI Commander · бот · ${ru('rebellion.common:difficulty.normal')}`,
    );
    expect(aiCommanderLabel(en, 'openai', 'hard')).toBe(
      `AI Commander · OpenAI · ${en('rebellion.common:difficulty.hard')}`,
    );
    expect(aiCommanderLabel(ru, null, 'easy')).toBe(
      `AI Commander · ${ru('rebellion.common:difficulty.easy')}`,
    );
    expect(aiCommanderLabel(en, 'bot', null)).toBe('AI Commander · bot');
    expect(aiCommanderLabel(en, null, null)).toBe('AI Commander');
  });

  it('aiSummaryText: ru plural 1/3/5/21, en; game over suffix; no steps → null', () => {
    const s = (steps: number) => aiSummaryText(ru, makeAutomationSummary({ steps }));
    expect(s(1)).toBe('Ход AI: 1 действие');
    expect(s(3)).toBe('Ход AI: 3 действия');
    expect(s(5)).toBe('Ход AI: 5 действий');
    expect(s(21)).toBe('Ход AI: 21 действие');
    expect(aiSummaryText(en, makeAutomationSummary({ steps: 1 }))).toBe('AI turn: 1 action');
    expect(aiSummaryText(en, makeAutomationSummary({ steps: 4 }))).toBe('AI turn: 4 actions');
    expect(aiSummaryText(ru, makeAutomationSummary({ steps: 2, stopReason: 'gameOver' }))).toBe(
      'Ход AI: 2 действия — партия окончена',
    );
    expect(s(0)).toBeNull();
  });

  it('hasAiFallback: only OpenAI with fallbacks > 0', () => {
    expect(hasAiFallback({ strategy: 'openai', fallbacks: 1 })).toBe(true);
    expect(hasAiFallback({ strategy: 'openai', fallbacks: 0 })).toBe(false);
    expect(hasAiFallback({ strategy: 'bot', fallbacks: 2 })).toBe(false);
    expect(hasAiFallback({ strategy: null, fallbacks: 2 })).toBe(false);
  });
});
