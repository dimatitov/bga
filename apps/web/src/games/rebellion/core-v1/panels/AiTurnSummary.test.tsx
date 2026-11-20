/** SWR-006 R-4 (plan-frontend §6.4, §8): «Ход AI: N действий» and the OpenAI → bot fallback notice. */
import type { AutomationRunSummary } from '@bga/platform';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AutomationSource } from '@/platform';
import { i18n } from '@/shared/i18n';
import {
  CORE_HOT_SEAT,
  makeAutomationSummary,
  makeCoreEmpireView,
  makeCoreView,
  makeSessionAutomationState,
} from '../../test/coreFixtures';
import { AiTurnSummary } from './AiTurnSummary';
import { renderCore, resetCoreStores } from './test/harness';

beforeEach(resetCoreStores);

function withRun(summary: Partial<AutomationRunSummary>, source: AutomationSource = 'run') {
  return {
    automation: makeSessionAutomationState({
      strategy: summary.strategy ?? 'bot',
      lastRun: { source, summary: makeAutomationSummary(summary), events: [], seq: 1 },
    }),
  };
}

describe('AiTurnSummary (SWR-006 R-4)', () => {
  it.each([
    [1, 'Ход AI: 1 действие'],
    [3, 'Ход AI: 3 действия'],
    [5, 'Ход AI: 5 действий'],
    [21, 'Ход AI: 21 действие'],
  ])('ru plural: %i → «%s»', (steps, text) => {
    renderCore(<AiTurnSummary />, makeCoreView(), {}, withRun({ steps, stopReason: 'humanTurn' }));
    const el = screen.getByTestId('ai-turn-summary');
    expect(el).toHaveTextContent(text);
    expect(el).toHaveAttribute('data-steps', String(steps));
    expect(el).toHaveAttribute('data-source', 'run');
    expect(screen.queryByTestId('ai-fallback-notice')).not.toBeInTheDocument();
  });

  it('en; command source; the game-over suffix', async () => {
    renderCore(
      <AiTurnSummary />,
      makeCoreEmpireView(),
      {},
      withRun({ steps: 2, stopReason: 'gameOver' }, 'command'),
    );
    const el = screen.getByTestId('ai-turn-summary');
    expect(el).toHaveAttribute('data-source', 'command');
    expect(el).toHaveTextContent('Ход AI: 2 действия — партия окончена');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() => expect(el).toHaveTextContent('AI turn: 2 actions — the game is over'));
  });

  it('OpenAI with fallbacks → notice with the reasons by code (D-PO-3), no model details', () => {
    renderCore(
      <AiTurnSummary />,
      makeCoreView(),
      {},
      withRun({
        steps: 4,
        strategy: 'openai',
        fallbacks: 2,
        fallbackReasons: ['AI_TIMEOUT', 'AI_DEADLINE'],
        stopReason: 'humanTurn',
      }),
    );
    const notice = screen.getByTestId('ai-fallback-notice');
    expect(notice).toHaveAttribute('data-fallbacks', '2');
    expect(notice).toHaveAttribute('data-reasons', 'AI_TIMEOUT,AI_DEADLINE');
    expect(notice).toHaveTextContent(
      'Часть ходов AI (2) сделал бот: OpenAI недоступен — нет ответа вовремя, превышено время хода.',
    );
  });

  it('SWR-008: AI_PROMPT_TOO_LARGE → its own reason in the same fallback sentence (ru, en), no raw code', async () => {
    renderCore(
      <AiTurnSummary />,
      makeCoreView(),
      {},
      withRun({
        steps: 3,
        strategy: 'openai',
        fallbacks: 1,
        fallbackReasons: ['AI_PROMPT_TOO_LARGE'],
        stopReason: 'humanTurn',
      }),
    );
    const notice = screen.getByTestId('ai-fallback-notice');
    expect(notice).toHaveAttribute('data-fallbacks', '1');
    expect(notice).toHaveAttribute('data-reasons', 'AI_PROMPT_TOO_LARGE');
    expect(notice).toHaveTextContent(
      'Часть ходов AI (1) сделал бот: OpenAI недоступен — запрос к модели слишком большой.',
    );
    expect(notice).not.toHaveTextContent('AI_PROMPT_TOO_LARGE');
    expect(notice).not.toHaveTextContent('другая причина');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(notice).toHaveTextContent(
        '1 AI move(s) were made by the bot: OpenAI unavailable — model request too large.',
      ),
    );
    expect(notice).not.toHaveTextContent('AI_PROMPT_TOO_LARGE');
  });

  it('an unknown / missing code → the generic reason', () => {
    renderCore(
      <AiTurnSummary />,
      makeCoreView(),
      {},
      withRun({ steps: 1, strategy: 'openai', fallbacks: 1, fallbackReasons: [] }),
    );
    expect(screen.getByTestId('ai-fallback-notice')).toHaveTextContent('другая причина');
  });

  it('bot with fallbacks 0 → no notice; OpenAI with 0 fallbacks → no notice', () => {
    const { unmount } = renderCore(
      <AiTurnSummary />,
      makeCoreView(),
      {},
      withRun({ steps: 2, strategy: 'bot' }),
    );
    expect(screen.getByTestId('ai-turn-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-fallback-notice')).not.toBeInTheDocument();
    unmount();
    renderCore(<AiTurnSummary />, makeCoreView(), {}, withRun({ steps: 2, strategy: 'openai' }));
    expect(screen.queryByTestId('ai-fallback-notice')).not.toBeInTheDocument();
  });

  it('nothing: steps 0, no lastRun, outside SessionHost, hot-seat', () => {
    const cases = [
      withRun({ steps: 0 }),
      { automation: makeSessionAutomationState() },
      { automation: null },
    ];
    for (const options of cases) {
      const { unmount } = renderCore(<AiTurnSummary />, makeCoreView(), {}, options);
      expect(screen.queryByTestId('ai-turn-summary')).not.toBeInTheDocument();
      unmount();
    }
    renderCore(
      <AiTurnSummary />,
      makeCoreView({ settings: { ...CORE_HOT_SEAT } }),
      {},
      withRun({ steps: 3 }),
    );
    expect(screen.queryByTestId('ai-turn-summary')).not.toBeInTheDocument();
  });
});
