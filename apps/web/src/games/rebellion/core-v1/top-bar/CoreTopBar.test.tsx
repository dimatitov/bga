import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import type { SessionStatus } from '@bga/platform';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
// Test-only: SessionHost provides the automation context in the app.
import { SessionAutomationContext, type SessionAutomationState } from '@/platform';
import { renderWithProviders } from '@/shared/test';
import {
  CORE_HOT_SEAT,
  CORE_SESSION_ID,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
  makeSessionAutomationState,
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import type { SaveStatus as SaveStatusValue } from '../../table/hooks/useSendCommand';
import { CoreTopBar } from './CoreTopBar';

function renderBar(
  view: PlayerViewCore,
  opts: {
    status?: SessionStatus;
    automation?: SessionAutomationState | null;
    aiThinking?: boolean;
    saveStatus?: SaveStatusValue;
  } = {},
) {
  const ctx: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
    aiThinking: opts.aiThinking ?? false,
  };
  return renderWithProviders({
    element: (
      <SessionAutomationContext value={opts.automation ?? null}>
        <CoreBoardContext.Provider value={ctx}>
          <CoreTopBar status={opts.status ?? 'prototype'} saveStatus={opts.saveStatus ?? 'idle'} />
        </CoreBoardContext.Provider>
      </SessionAutomationContext>
    ),
  });
}

describe('CoreTopBar = console status bar (SWR-005 P2, TC-C-01; SWR-009 C1, AC-9)', () => {
  it('AI game, Rebels: «Текущая сторона / Повстанцы · Вы», time track 1/14, «Раунд 1 / Приказы», AI box, state', () => {
    renderBar(makeCoreView());
    const bar = screen.getByTestId('table-top-bar');
    expect(bar.tagName).toBe('SECTION');
    expect(bar).toHaveAccessibleName('Статус партии');
    const turn = within(bar).getByTestId('turn-indicator');
    expect(turn).toHaveAttribute('data-side', 'rebels');
    expect(turn).toHaveAttribute('data-mine', 'true');
    expect(turn).toHaveTextContent('Текущая сторона');
    expect(within(turn).getByTestId('turn-indicator-side')).toHaveTextContent('Повстанцы · Вы');
    // An AI game names the opponent in the AI box, not in the side cell.
    expect(turn).not.toHaveTextContent('против');

    const track = within(bar).getByTestId('time-track');
    expect(track).toHaveAttribute('data-time', '1');
    expect(track).toHaveAttribute('data-reputation', '14');
    expect(track).toHaveTextContent('Время 1 · Репутация 14');

    const phase = within(bar).getByTestId('phase-indicator');
    expect(phase).toHaveAttribute('data-phase', 'command');
    expect(phase).toHaveTextContent(/^Приказы$/);
    expect(phase.parentElement).toHaveTextContent(/^Раунд 1Приказы/);

    expect(within(bar).getByTestId('ai-commander-status')).toBeInTheDocument();
    const save = within(bar).getByTestId('save-status');
    expect(save).toHaveAttribute('data-status', 'idle');
    expect(save.parentElement).toHaveTextContent(/^Состояние/);
    expect(within(bar).queryByTestId('session-status-completed')).not.toBeInTheDocument();
    expect(within(bar).queryByTestId('passed-indicator')).not.toBeInTheDocument();
    // SWR-009 plan §4: nav, ⚙ and the slice badge moved to the console header / footer.
    for (const id of ['session-back-to-game', 'session-settings', 'prototype-badge']) {
      expect(within(bar).queryByTestId(id), id).not.toBeInTheDocument();
    }
  });

  it('cells in DOM (= Tab) order: side → track → phase → AI → state; the numbers come from the view', () => {
    const view = makeCoreView({ markers: { time: 3, reputation: 12 } });
    renderBar(view);
    const cells = Array.from(
      screen.getByTestId('table-top-bar').querySelectorAll(':scope > [data-cell]'),
      (c) => c.getAttribute('data-cell'),
    );
    expect(cells).toEqual(['side', 'track', 'phase', 'ai', 'save']);
    expect(screen.getByTestId('time-track')).toHaveTextContent(
      `Время ${view.markers.time} · Репутация ${view.markers.reputation}`,
    );
    expect(screen.getByTestId('phase-indicator').parentElement).toHaveTextContent(
      `Раунд ${view.markers.time}`,
    );
  });

  it('fix round 1: < 760 compact areas «side phase / track track / ai save» (hot-seat «track save»), one-line side name', () => {
    const { unmount } = renderBar(makeCoreView());
    const bar = screen.getByTestId('table-top-bar');
    expect(bar).toHaveAttribute('data-ai', 'true');
    const css = Array.from(document.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(css).toMatch(
      /@media \(max-width:759\.95px\)\s*\{[^}]*grid-template-areas:\s*"side phase"\s*"track track"\s*"ai save"/,
    );
    expect(css).toMatch(
      /\[data-ai="false"\][^{]*\{[^}]*grid-template-areas:\s*"side phase"\s*"track save"/,
    );
    const side = screen.getByTestId('turn-indicator-side');
    expect(getComputedStyle(side).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(side).textOverflow).toBe('ellipsis');
    unmount();
    renderBar(makeCoreView({ settings: { ...CORE_HOT_SEAT } }));
    expect(screen.getByTestId('table-top-bar')).toHaveAttribute('data-ai', 'false');
  });

  it.each(['saving', 'saved', 'error'] as const)('save state %s is said in words', (saveStatus) => {
    renderBar(makeCoreView(), { saveStatus });
    const save = screen.getByTestId('save-status');
    expect(save).toHaveAttribute('data-status', saveStatus);
    expect(save).toHaveTextContent(i18n.t(`rebellion.session:save.${saveStatus}`));
  });

  it('who has passed: the Empire view after the AI Rebels passed → «Повстанцы: пас»; Empire is the active side', () => {
    renderBar(makeCoreEmpireView());
    const passed = screen.getByTestId('passed-indicator');
    expect(passed).toHaveAttribute('data-rebels', 'true');
    expect(passed).toHaveAttribute('data-empire', 'false');
    expect(passed).toHaveTextContent('Повстанцы: пас');
    expect(screen.queryByTestId('passed-empire')).not.toBeInTheDocument();
    expect(screen.getByTestId('turn-indicator')).toHaveAttribute('data-side', 'empire');
    expect(screen.getByTestId('turn-indicator')).toHaveTextContent('Империя · Вы');
  });

  it('hot-seat: no «· Вы», «против второго игрока», no AI box; data-mine follows viewer === activeSide', () => {
    renderBar(
      makeCoreView({ settings: { ...CORE_HOT_SEAT }, viewer: 'rebels', activeSide: 'empire' }),
    );
    const turn = screen.getByTestId('turn-indicator');
    expect(turn).toHaveAttribute('data-side', 'empire');
    expect(turn).toHaveAttribute('data-mine', 'false');
    expect(turn).not.toHaveTextContent('Вы');
    expect(turn).toHaveTextContent('против второго игрока');
    expect(
      screen.getByTestId('table-top-bar').querySelector('[data-cell="ai"]'),
    ).not.toBeInTheDocument();
  });

  it('SWR-009 K-7: no turn controls in the bar — no `top-bar-controls` wrapper, no finish/pass keys', () => {
    renderBar(makeCoreView());
    expect(screen.queryByTestId('top-bar-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('turn-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pass-turn')).not.toBeInTheDocument();
    expect(screen.getByTestId('time-track').closest('[data-group="state"]')).not.toBeNull();
  });

  it('game over: «Завершена» from view.outcome even before the status refresh (AM-FE-10); no «пас» badges', () => {
    renderBar(makeCoreOutcomeView('rebels'), { status: 'prototype' });
    const done = screen.getByTestId('session-status-completed');
    expect(done).toHaveTextContent('Завершена');
    expect(done.closest('[data-cell="save"]')).not.toBeNull();
    expect(screen.queryByTestId('passed-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('time-track')).toHaveAttribute('data-time', '14');
  });

  it('status completed (platform) → «Завершена»', () => {
    renderBar(makeCoreOutcomeView('empire'), { status: 'completed' });
    expect(screen.getByTestId('session-status-completed')).toHaveAttribute(
      'data-status',
      'completed',
    );
  });

  it('en: phase «Command», «· You», no Cyrillic in the bar', async () => {
    renderBar(makeCoreView());
    await act(() => i18n.changeLanguage('en'));
    const bar = screen.getByTestId('table-top-bar');
    await waitFor(() => expect(screen.getByTestId('phase-indicator')).toHaveTextContent('Command'));
    expect(screen.getByTestId('turn-indicator')).toHaveTextContent('Rebels · You');
    expect(screen.getByTestId('turn-indicator')).toHaveTextContent('Current side');
    expect(bar.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('CoreTopBar — AI Commander (SWR-006 R-3, plan-frontend §6.3)', () => {
  it('AI game: «AI Commander · бот · Обычная» next to the turn indicator; no ai-status placeholder', () => {
    renderBar(makeCoreView(), { automation: makeSessionAutomationState({ strategy: 'bot' }) });
    const status = screen.getByTestId('ai-commander-status');
    expect(status).toHaveTextContent('AI Commander · бот · Обычная');
    expect(status).toHaveAttribute('data-strategy', 'bot');
    expect(status).toHaveAttribute('data-difficulty', 'normal');
    expect(status).toHaveAttribute('data-state', 'idle');
    expect(status.closest('[data-cell="ai"]')).not.toBeNull();
    expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('table-top-bar')).not.toHaveTextContent(/не реализован/);
  });

  it('while the AI moves: «ИИ думает…» (role=status); hot-seat: nothing', () => {
    const { unmount } = renderBar(makeCoreView(), {
      automation: makeSessionAutomationState({ phase: 'running' }),
      aiThinking: true,
    });
    expect(screen.getByTestId('ai-commander-status')).toHaveAttribute('data-state', 'thinking');
    expect(screen.getByTestId('ai-thinking')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('ai-thinking')).toHaveTextContent('ИИ думает…');
    unmount();
    renderBar(makeCoreView({ settings: { ...CORE_HOT_SEAT } }), {
      automation: makeSessionAutomationState({ strategy: null }),
      aiThinking: false,
    });
    expect(screen.queryByTestId('ai-commander-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
  });
});
