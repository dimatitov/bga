/** SWR-006 R-3 (plan-frontend §6.3, §8): `ai-commander-status` / `ai-thinking` of the `core-v1` top bar. */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { AiCommanderStatus } from './AiCommanderStatus';

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
