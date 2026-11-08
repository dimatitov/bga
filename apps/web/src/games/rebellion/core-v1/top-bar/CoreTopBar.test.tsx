import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import type { SessionStatus } from '@bga/platform';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import {
  CORE_HOT_SEAT,
  CORE_SESSION_ID,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { CoreTopBar } from './CoreTopBar';

const BACK = '/games/star-wars-rebellion';

function renderBar(
  view: PlayerViewCore,
  opts: { status?: SessionStatus; controls?: ReactNode } = {},
) {
  const ctx: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
  return renderWithProviders({
    element: (
      <CoreBoardContext.Provider value={ctx}>
        <CoreTopBar
          status={opts.status ?? 'prototype'}
          saveStatus="idle"
          backHref={BACK}
          controls={opts.controls}
        />
      </CoreBoardContext.Provider>
    ),
  });
}

describe('CoreTopBar (SWR-005 P2, TC-C-01, TC-C-14; AC-07, AC-12, AC-13)', () => {
  it('AI game, Rebels: «Ход: Повстанцы (вы)», против AI · Обычная, time track 1/14, «Фаза: Приказы», slice badge', () => {
    renderBar(makeCoreView());
    const bar = screen.getByTestId('table-top-bar');
    const turn = within(bar).getByTestId('turn-indicator');
    expect(turn).toHaveAttribute('data-side', 'rebels');
    expect(turn).toHaveAttribute('data-mine', 'true');
    expect(turn).toHaveTextContent('Ход:');
    expect(turn).toHaveTextContent('Повстанцы');
    expect(turn).toHaveTextContent('(вы)');
    expect(turn).toHaveTextContent('против AI · Обычная');

    const track = within(bar).getByTestId('time-track');
    expect(track).toHaveAttribute('data-time', '1');
    expect(track).toHaveAttribute('data-reputation', '14');
    expect(track).toHaveTextContent('Время 1 · Репутация 14');

    const phase = within(bar).getByTestId('phase-indicator');
    expect(phase).toHaveAttribute('data-phase', 'command');
    expect(phase).toHaveTextContent('Фаза: Приказы');

    const badge = within(bar).getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-variant', 'core-v1');
    expect(badge).toHaveTextContent(
      'Реальная карта; правила частично: раунд и активация. Бой, миссии, производство — позже',
    );
    expect(within(bar).queryByTestId('session-status-completed')).not.toBeInTheDocument();
    expect(within(bar).queryByTestId('passed-indicator')).not.toBeInTheDocument();
    expect(within(bar).getByTestId('session-back-to-game')).toHaveAttribute('href', BACK);
    expect(within(bar).getByTestId('save-status')).toBeInTheDocument();
    expect(within(bar).getByTestId('session-settings')).toBeInTheDocument();
  });

  it('who has passed: the Empire view after the AI Rebels passed → «Повстанцы: пас»; Empire is the active side', () => {
    renderBar(makeCoreEmpireView());
    const passed = screen.getByTestId('passed-indicator');
    expect(passed).toHaveAttribute('data-rebels', 'true');
    expect(passed).toHaveAttribute('data-empire', 'false');
    expect(passed).toHaveTextContent('Повстанцы: пас');
    expect(screen.queryByTestId('passed-empire')).not.toBeInTheDocument();
    expect(screen.getByTestId('turn-indicator')).toHaveAttribute('data-side', 'empire');
    expect(screen.getByTestId('turn-indicator')).toHaveTextContent('(вы)');
  });

  it('hot-seat: no «(вы)», «против второго игрока»; data-mine follows viewer === activeSide', () => {
    renderBar(
      makeCoreView({ settings: { ...CORE_HOT_SEAT }, viewer: 'rebels', activeSide: 'empire' }),
    );
    const turn = screen.getByTestId('turn-indicator');
    expect(turn).toHaveAttribute('data-side', 'empire');
    expect(turn).toHaveAttribute('data-mine', 'false');
    expect(turn).not.toHaveTextContent('(вы)');
    expect(turn).toHaveTextContent('против второго игрока');
  });

  it('`controls` slot (P1 TurnControls) is rendered inside the state group', () => {
    renderBar(makeCoreView(), { controls: <button type="button">pass-slot</button> });
    const slot = screen.getByTestId('top-bar-controls');
    expect(slot).toContainElement(screen.getByRole('button', { name: 'pass-slot' }));
    expect(slot.closest('[data-group="state"]')).not.toBeNull();
  });

  it('game over: «Завершена» from view.outcome even before the status refresh (AM-FE-10); badge kept; no «пас» chips', () => {
    renderBar(makeCoreOutcomeView('rebels'), { status: 'prototype' });
    const done = screen.getByTestId('session-status-completed');
    expect(done).toHaveTextContent('Завершена');
    expect(screen.getByTestId('prototype-badge')).toHaveAttribute('data-variant', 'core-v1');
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

  it('en: phase «Command», «(you)», no Cyrillic in the bar', async () => {
    renderBar(makeCoreView());
    await act(() => i18n.changeLanguage('en'));
    const bar = screen.getByTestId('table-top-bar');
    await waitFor(() =>
      expect(screen.getByTestId('phase-indicator')).toHaveTextContent('Phase: Command'),
    );
    expect(screen.getByTestId('turn-indicator')).toHaveTextContent('(you)');
    expect(bar.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});
