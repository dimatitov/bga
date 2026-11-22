/** SWR-006 R-3 (plan-frontend §6.3, §8): `ai-commander-status` / `ai-thinking` of the `core-v1` top bar. */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Test-only: SessionHost provides the automation context in the app.
import { SessionAutomationContext, type SessionAutomationState } from '@/platform';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import {
  CORE_HOT_SEAT,
  CORE_SESSION_ID,
  makeCoreEmpireView,
  makeCoreView,
  makeSessionAutomationState,
  withLastRun,
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { resetSettingsStore, useSettingsStore } from '@/shared/settings';
import { AiCommanderStatus } from './AiCommanderStatus';
import { AI_LEDS } from './statusBarModel';

function renderStatus(
  view: PlayerViewCore,
  {
    automation = null,
    aiThinking = false,
    over = false,
  }: { automation?: SessionAutomationState | null; aiThinking?: boolean; over?: boolean } = {},
) {
  const ctx: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: aiThinking,
    aiThinking,
  };
  return renderWithProviders({
    element: (
      <SessionAutomationContext value={automation}>
        <CoreBoardContext.Provider value={ctx}>
          <AiCommanderStatus over={over} />
        </CoreBoardContext.Provider>
      </SessionAutomationContext>
    ),
  });
}

describe('AiCommanderStatus (SWR-006 R-3)', () => {
  it('bot · normal (human Rebels vs AI Empire)', () => {
    renderStatus(makeCoreView(), { automation: makeSessionAutomationState({ strategy: 'bot' }) });
    const el = screen.getByTestId('ai-commander-status');
    expect(el).toHaveTextContent('AI Commander · бот · Обычная');
    expect(el).toHaveAttribute('data-strategy', 'bot');
    expect(el).toHaveAttribute('data-difficulty', 'normal');
    expect(el).toHaveAttribute('data-state', 'idle');
  });

  it('openai · hard (human Empire vs AI Rebels), en', async () => {
    renderStatus(
      makeCoreEmpireView({ settings: { ...makeCoreEmpireView().settings, aiDifficulty: 'hard' } }),
      { automation: makeSessionAutomationState({ strategy: 'openai' }) },
    );
    const el = screen.getByTestId('ai-commander-status');
    expect(el).toHaveAttribute('data-strategy', 'openai');
    expect(el).toHaveAttribute('data-difficulty', 'hard');
    expect(el).toHaveTextContent('AI Commander · OpenAI · Сложная');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() => expect(el).toHaveTextContent('AI Commander · OpenAI · Hard'));
  });

  it('strategy null (or outside SessionHost) → no provider (Q-FE-6), data-strategy none', () => {
    renderStatus(makeCoreView());
    const el = screen.getByTestId('ai-commander-status');
    expect(el).toHaveAttribute('data-strategy', 'none');
    expect(el).toHaveTextContent('AI Commander · Обычная');
  });

  it('thinking: «ИИ думает…» in role=status (polite) while the AI moves', () => {
    renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ phase: 'running' }),
      aiThinking: true,
    });
    expect(screen.getByTestId('ai-commander-status')).toHaveAttribute('data-state', 'thinking');
    const thinking = screen.getByTestId('ai-thinking');
    expect(thinking).toHaveAttribute('role', 'status');
    expect(thinking).toHaveAttribute('aria-live', 'polite');
    expect(thinking).toHaveTextContent('ИИ думает…');
  });

  it('thinking during the viewer’s PASS request (context aiThinking, automation idle)', () => {
    renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ phase: 'idle' }),
      aiThinking: true,
    });
    expect(screen.getByTestId('ai-thinking')).toBeInTheDocument();
  });

  it.each(['error', 'stalled'] as const)(
    'phase %s → data-state stalled, no «ИИ думает…»',
    (phase) => {
      renderStatus(makeCoreView(), { automation: makeSessionAutomationState({ phase }) });
      expect(screen.getByTestId('ai-commander-status')).toHaveAttribute('data-state', 'stalled');
      expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
    },
  );

  it('game over → data-state over, no «ИИ думает…» even if a request is in flight', () => {
    renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ phase: 'running' }),
      aiThinking: true,
      over: true,
    });
    expect(screen.getByTestId('ai-commander-status')).toHaveAttribute('data-state', 'over');
    expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
  });

  it('hot-seat → nothing rendered', () => {
    renderStatus(makeCoreView({ settings: { ...CORE_HOT_SEAT } }), {
      automation: makeSessionAutomationState({ strategy: null, phase: 'running' }),
      aiThinking: true,
    });
    expect(screen.queryByTestId('ai-commander-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
  });
});

afterEach(() => resetSettingsStore());

/** LED states of the box, left to right. */
function leds(): string[] {
  return Array.from(
    screen.getByTestId('ai-commander-led').querySelectorAll('[data-state]'),
    (el) => el.getAttribute('data-state') ?? '',
  );
}

describe('AiCommanderStatus — LEDs and state line (SWR-009 C1, AC-11)', () => {
  it('idle: LED power green, others off; «Готов»; with a last run — «Готов · N действия» from lastRun.summary', () => {
    const { unmount } = renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ strategy: 'bot' }),
    });
    const box = screen.getByTestId('ai-commander-led');
    expect(box).toHaveAttribute('data-state', 'idle');
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(leds()).toEqual([...AI_LEDS.idle]);
    expect(leds()).toEqual(['green', 'off', 'off']);
    expect(screen.getByTestId('ai-commander-state')).toHaveTextContent(/^Готов$/);
    unmount();
    const lastRun = withLastRun([{}, {}, {}]);
    renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ strategy: 'bot', lastRun }),
    });
    expect(screen.getByTestId('ai-commander-state')).toHaveTextContent(
      `Готов · ${lastRun.summary.steps} действия`,
    );
  });

  it('thinking: amber LED blinks + «ИИ думает…»; reduce motion → no blink', () => {
    const { unmount } = renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ phase: 'running' }),
      aiThinking: true,
    });
    expect(screen.getByTestId('ai-commander-led')).toHaveAttribute('data-state', 'thinking');
    expect(leds()).toEqual(['green', 'amber', 'off']);
    const amber = screen
      .getByTestId('ai-commander-led')
      .querySelector<HTMLElement>('[data-state="amber"]');
    expect(amber).toHaveAttribute('data-blink', 'true');
    expect(screen.getByTestId('ai-thinking')).toHaveTextContent('ИИ думает…');
    expect(screen.queryByTestId('ai-commander-state')).not.toBeInTheDocument();
    unmount();
    useSettingsStore.setState({ reduceMotion: true });
    renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState({ phase: 'running' }),
      aiThinking: true,
    });
    expect(
      screen.getByTestId('ai-commander-led').querySelector('[data-state="amber"]'),
    ).toHaveAttribute('data-blink', 'false');
  });

  it('stalled: red LED + «Ход не завершён»', () => {
    renderStatus(makeCoreView(), { automation: makeSessionAutomationState({ phase: 'stalled' }) });
    expect(screen.getByTestId('ai-commander-led')).toHaveAttribute('data-state', 'stalled');
    expect(leds()).toEqual(['green', 'off', 'red']);
    expect(screen.getByTestId('ai-commander-state')).toHaveTextContent('Ход не завершён');
  });

  it('over: every LED off + «Партия окончена»', () => {
    renderStatus(makeCoreView(), { automation: makeSessionAutomationState(), over: true });
    expect(screen.getByTestId('ai-commander-led')).toHaveAttribute('data-state', 'over');
    expect(leds()).toEqual(['off', 'off', 'off']);
    expect(screen.getByTestId('ai-commander-state')).toHaveTextContent('Партия окончена');
  });

  it('the four states have four different LED patterns; nothing blinks except while thinking', () => {
    const patterns = Object.values(AI_LEDS).map((p) => p.join());
    expect(new Set(patterns).size).toBe(4);
    for (const state of ['idle', 'stalled', 'over'] as const) {
      expect(AI_LEDS[state]).not.toContain('amber');
    }
  });

  it('en: «Ready», «Turn not finished»', async () => {
    const { unmount } = renderStatus(makeCoreView(), {
      automation: makeSessionAutomationState(),
    });
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-commander-state')).toHaveTextContent('Ready'),
    );
    unmount();
    renderStatus(makeCoreView(), { automation: makeSessionAutomationState({ phase: 'error' }) });
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-commander-state')).toHaveTextContent('Turn not finished'),
    );
  });
});
