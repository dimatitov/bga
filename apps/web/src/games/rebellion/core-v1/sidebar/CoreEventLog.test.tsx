import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import {
  CORE_SESSION_ID,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { CoreGameInfoPanel } from '../top-bar/CoreGameInfoPanel';
import { CoreEventLog } from './CoreEventLog';
import { MapLegend } from './MapLegend';

const AT = '2026-11-08T10:00:00.000Z';

function renderCore(view: PlayerViewCore, ui: ReactNode) {
  const ctx: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
  return renderWithProviders({
    element: <CoreBoardContext.Provider value={ctx}>{ui}</CoreBoardContext.Provider>,
  });
}

describe('CoreEventLog (SWR-005 P2, TC-C-09, AC-08)', () => {
  it('AI auto-pass entry: data attrs, «Империя (AI) пасует» + chip «авто» + hint «AI Commander ещё не реализован»', () => {
    renderCore(makeCoreEmpireView(), <CoreEventLog />);
    const log = screen.getByTestId('event-log');
    expect(log).toHaveAttribute('role', 'log');
    expect(log).toHaveAttribute('aria-live', 'off');
    // newest first
    const items = within(log).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-seq'))).toEqual(['3', '2', '1']);

    // The fixture's auto-pass is by the AI Rebels; re-check with an AI Empire entry below.
    const entry = screen.getByTestId('log-entry-3');
    expect(entry).toHaveAttribute('data-type', 'PASSED');
    expect(entry).toHaveAttribute('data-actor', 'rebels');
    expect(entry).toHaveAttribute('data-auto', 'true');
    expect(entry).toHaveTextContent('Повстанцы (AI) пасуют');
    const chip = within(entry).getByTestId('log-entry-3-auto');
    expect(chip).toHaveTextContent('авто');
    const hint = within(entry).getByTestId('log-entry-3-auto-hint');
    expect(hint).toHaveTextContent('AI Commander ещё не реализован');
    expect(chip).toHaveAttribute('aria-describedby', expect.stringContaining(hint.id));

    expect(screen.getByTestId('log-entry-2')).toHaveAttribute('data-auto', 'false');
    expect(within(screen.getByTestId('log-entry-2')).queryByText('авто')).not.toBeInTheDocument();
  });

  it('AI Empire auto-pass (Rebels game): «Империя (AI) пасует — авто, AI Commander ещё не реализован»', () => {
    const base = makeCoreView();
    renderCore(
      makeCoreView({
        log: [
          ...base.log,
          { seq: 3, at: AT, type: 'PASSED', actor: 'empire', payload: { auto: true } },
        ],
      }),
      <CoreEventLog />,
    );
    const entry = screen.getByTestId('log-entry-3');
    expect(entry).toHaveAttribute('data-actor', 'empire');
    expect(entry).toHaveAttribute('data-auto', 'true');
    expect(entry).toHaveTextContent('Империя (AI) пасует');
    expect(entry).toHaveTextContent('авто');
    expect(entry).toHaveTextContent('AI Commander ещё не реализован');
  });

  it('hidden zone, base reveal, game over entries; en texts without Cyrillic', async () => {
    const base = makeCoreOutcomeView('rebels');
    renderCore(
      makeCoreOutcomeView('rebels', 'timeReachedReputation', {
        log: [
          ...base.log,
          {
            seq: 4,
            at: AT,
            type: 'PIECES_MOVED',
            actor: 'rebels',
            payload: { pieceIds: ['u-r-x'], fromSystemId: null, toSystemId: 'corellia' },
          },
          { seq: 5, at: AT, type: 'TIME_ADVANCED', actor: 'system', payload: { from: 13, to: 14 } },
        ],
      }),
      <CoreEventLog />,
    );
    expect(screen.getByTestId('log-entry-4')).toHaveTextContent('скрытая зона');
    expect(screen.getByTestId('log-entry-5')).toHaveTextContent('Маркер времени: 13 → 14');
    expect(screen.getByTestId('log-entry-3')).toHaveTextContent('Победа Повстанцев');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() => expect(screen.getByTestId('log-entry-4')).toHaveTextContent('hidden zone'));
    expect(screen.getByTestId('event-log').textContent).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('empty log → «Событий пока нет»', () => {
    renderCore(makeCoreView({ log: [] }), <CoreEventLog />);
    expect(screen.getByTestId('event-log-empty')).toHaveTextContent('Событий пока нет');
  });
});

describe('MapLegend + CoreGameInfoPanel (SWR-005 P2, TC-C-19)', () => {
  it('legend: remote, contested, activated, hidden base zone (and the rest) with text', () => {
    renderCore(makeCoreView(), <MapLegend />);
    const legend = screen.getByTestId('map-legend');
    expect(legend).toHaveAccessibleName('Легенда карты');
    for (const item of [
      'region',
      'remote',
      'contested',
      'activated',
      'target',
      'source',
      'leader',
      'base',
      'space',
      'ground',
      'structure',
      'chips',
      'hiddenZone',
    ]) {
      expect(within(legend).getByTestId(`map-legend-${item}`).textContent).toMatch(/\S{3}/);
    }
    expect(legend).not.toHaveTextContent('rebellion.');
    expect(within(legend).getByTestId('map-legend-remote')).toHaveTextContent(/удалённая/i);
    expect(within(legend).getByTestId('map-legend-contested')).toHaveTextContent(/спорная/i);
    expect(within(legend).getByTestId('map-legend-activated')).toHaveTextContent(/активированная/i);
    expect(within(legend).getByTestId('map-legend-hiddenZone')).toHaveTextContent(
      'местоположение неизвестно',
    );
  });

  it('«Партия» tab: time, reputation, phase, passed, base unknown for the Empire, status + slice text, legend', () => {
    renderCore(makeCoreEmpireView(), <CoreGameInfoPanel status="prototype" />);
    const info = screen.getByTestId('game-info');
    expect(info).toHaveTextContent('Время1');
    expect(info).toHaveTextContent('Репутация14');
    expect(info).toHaveTextContent('ФазаПриказы');
    expect(info).toHaveTextContent('СпасовалиПовстанцы');
    expect(info).toHaveTextContent('База Повстанцевнеизвестна');
    const status = screen.getByTestId('game-info-status');
    expect(status).toHaveAttribute('data-status', 'prototype');
    expect(status).toHaveTextContent('Реальная карта; правила частично');
    expect(within(info).getByTestId('map-legend')).toBeInTheDocument();
    expect(within(info).getByTestId('ai-status')).toBeInTheDocument();
  });

  it('«Партия» tab after the game: status «Завершена» from view.outcome, base visible (Q-14)', () => {
    renderCore(makeCoreOutcomeView('empire'), <CoreGameInfoPanel status="prototype" />);
    const status = screen.getByTestId('game-info-status');
    expect(status).toHaveAttribute('data-status', 'completed');
    expect(status).toHaveTextContent('Завершена');
    expect(screen.getByTestId('game-info')).not.toHaveTextContent('неизвестна');
  });
});
