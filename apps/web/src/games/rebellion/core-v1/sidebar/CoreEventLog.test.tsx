import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
// Test-only: SessionHost provides the automation context in the app.
import { SessionAutomationContext, type SessionAutomationState } from '@/platform';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import {
  CORE_HOT_SEAT,
  CORE_SESSION_ID,
  CS_SULLUST,
  CS_YAVIN,
  L_LEIA,
  L_VADER,
  U_XWING,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
  makeSessionAutomationState,
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { CoreGameInfoPanel } from '../top-bar/CoreGameInfoPanel';
import { CoreEventLog } from './CoreEventLog';
import { MapLegend } from './MapLegend';

const AT = '2026-11-08T10:00:00.000Z';

function renderCore(
  view: PlayerViewCore,
  ui: ReactNode,
  automation: SessionAutomationState | null = null,
) {
  const ctx: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
  return renderWithProviders({
    element: (
      <SessionAutomationContext value={automation}>
        <CoreBoardContext.Provider value={ctx}>{ui}</CoreBoardContext.Provider>
      </SessionAutomationContext>
    ),
  });
}

describe('CoreEventLog (SWR-005 P2, TC-C-09, AC-08)', () => {
  it('AI auto-pass entry (SWR-006 L-2): data attrs, «Повстанцы (AI) пасуют» + chip «AI»; no «авто» / hint', () => {
    renderCore(makeCoreEmpireView(), <CoreEventLog />);
    const log = screen.getByTestId('event-log');
    expect(log).toHaveAttribute('role', 'log');
    expect(log).toHaveAttribute('aria-live', 'off');
    // newest first
    const items = within(log).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-seq'))).toEqual(['3', '2', '1']);

    const entry = screen.getByTestId('log-entry-3');
    expect(entry).toHaveAttribute('data-type', 'PASSED');
    expect(entry).toHaveAttribute('data-actor', 'rebels');
    expect(entry).toHaveAttribute('data-auto', 'true');
    expect(entry).toHaveAttribute('data-ai', 'true');
    expect(entry).toHaveTextContent('Повстанцы (AI) пасуют');
    const chip = within(entry).getByTestId('log-entry-3-ai');
    expect(chip).toHaveTextContent('AI');
    // The line already says «(AI)»: the chip is not read twice.
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('log-entry-3-auto')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-entry-3-auto-hint')).not.toBeInTheDocument();
    expect(log).not.toHaveTextContent(/не реализован|авто/);

    expect(screen.getByTestId('log-entry-2')).toHaveAttribute('data-ai', 'false');
    expect(screen.queryByTestId('log-entry-2-ai')).not.toBeInTheDocument();
  });

  it('SWR-009 C2: data-time = event.at (ISO), <time> shows HH:MM of that instant; AI rows have the 2 px red edge, others not', () => {
    const view = makeCoreEmpireView();
    renderCore(view, <CoreEventLog />);
    for (const e of view.log) {
      const entry = screen.getByTestId(`log-entry-${e.seq}`);
      expect(entry).toHaveAttribute('data-time', e.at);
      const time = entry.querySelector('time');
      expect(time).toHaveAttribute('datetime', e.at);
      const expected = new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(e.at));
      expect(time).toHaveTextContent(expected);
    }
    const ai = screen.getByTestId('log-entry-3');
    expect(ai).toHaveAttribute('data-edge', 'ai');
    expect(ai).toHaveStyle({ borderLeftWidth: '2px', borderLeftStyle: 'solid' });
    expect(ai).toHaveStyle({ borderLeftColor: '#DD6B59' });
    // QD-8: the red is an edge, not a text colour; the tag uses the light red text shade.
    expect(ai).not.toHaveStyle({ color: '#DD6B59' });
    const tag = screen.getByTestId('log-entry-3-ai');
    expect(tag).toHaveAttribute('data-tone', 'red');
    expect(tag).toHaveStyle({ color: '#F39788' });
    const human = screen.getByTestId('log-entry-2');
    expect(human).not.toHaveAttribute('data-edge');
    expect(human).not.toHaveStyle({ borderLeftColor: '#DD6B59' });
  });

  it('SWR-009 C2 (AC-16): no invented clock — every shown time comes from an event of the view', () => {
    const view = makeCoreView();
    renderCore(view, <CoreEventLog />);
    const ats = new Set(view.log.map((e) => e.at));
    const times = screen.getByTestId('event-log').querySelectorAll('time');
    expect(times).toHaveLength(view.log.length);
    times.forEach((el) => expect(ats.has(el.getAttribute('datetime') ?? '')).toBe(true));
  });

  it('every event of the AI Empire is marked (Q-FE-4): activation, move, finish without `auto`; human ones are not', () => {
    const base = makeCoreView();
    renderCore(
      makeCoreView({
        log: [
          ...base.log,
          {
            seq: 3,
            at: AT,
            type: 'SYSTEM_ACTIVATED',
            actor: 'rebels',
            payload: { leaderId: L_LEIA, systemId: CS_SULLUST },
          },
          { seq: 4, at: AT, type: 'PASSED', actor: 'rebels', payload: { auto: false } },
          {
            seq: 5,
            at: AT,
            type: 'SYSTEM_ACTIVATED',
            actor: 'empire',
            payload: { leaderId: L_VADER, systemId: CS_SULLUST },
          },
          {
            seq: 6,
            at: AT,
            type: 'PIECES_MOVED',
            actor: 'empire',
            payload: { pieceIds: ['u-e-sd'], fromSystemId: 'coruscant', toSystemId: CS_SULLUST },
          },
          {
            seq: 7,
            at: AT,
            type: 'ACTIVATION_FINISHED',
            actor: 'empire',
            payload: { auto: false },
          },
        ],
      }),
      <CoreEventLog />,
    );
    for (const seq of [5, 6, 7]) {
      const entry = screen.getByTestId(`log-entry-${seq}`);
      expect(entry, `seq ${seq}`).toHaveAttribute('data-ai', 'true');
      expect(entry, `seq ${seq}`).toHaveAttribute('data-auto', 'false');
      expect(within(entry).getByTestId(`log-entry-${seq}-ai`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('log-entry-5')).toHaveTextContent('Империя (AI):');
    expect(screen.getByTestId('log-entry-6')).toHaveTextContent('Империя (AI):');
    expect(screen.getByTestId('log-entry-7')).toHaveTextContent('Империя (AI) завершает активацию');
    for (const seq of [3, 4]) {
      expect(screen.getByTestId(`log-entry-${seq}`)).toHaveAttribute('data-ai', 'false');
      expect(screen.getByTestId(`log-entry-${seq}`)).not.toHaveTextContent('(AI)');
    }
  });

  it("hot-seat: no event is marked as the AI's", () => {
    const base = makeCoreView({ settings: { ...CORE_HOT_SEAT } });
    renderCore(
      {
        ...base,
        log: [
          ...base.log,
          { seq: 3, at: AT, type: 'PASSED', actor: 'empire', payload: { auto: false } },
        ],
      },
      <CoreEventLog />,
    );
    expect(screen.getByTestId('log-entry-3')).toHaveAttribute('data-ai', 'false');
    expect(screen.getByTestId('log-entry-3')).toHaveTextContent('Империя пасует');
    expect(screen.queryByTestId('log-entry-3-ai')).not.toBeInTheDocument();
  });

  it('L-4 hidden base: AI Rebels moving in/out of the base read «скрытая зона» for the human Empire; the base system never shows', () => {
    const base = makeCoreEmpireView();
    renderCore(
      makeCoreEmpireView({
        log: [
          ...base.log,
          {
            seq: 4,
            at: AT,
            type: 'SYSTEM_ACTIVATED',
            actor: 'rebels',
            payload: { leaderId: L_LEIA, systemId: null },
          },
          {
            seq: 5,
            at: AT,
            type: 'PIECES_MOVED',
            actor: 'rebels',
            payload: { pieceIds: [U_XWING], fromSystemId: CS_SULLUST, toSystemId: null },
          },
          {
            seq: 6,
            at: AT,
            type: 'PIECES_MOVED',
            actor: 'rebels',
            payload: { pieceIds: [U_XWING], fromSystemId: null, toSystemId: CS_SULLUST },
          },
        ],
      }),
      <CoreEventLog />,
    );
    expect(screen.getByTestId('log-entry-4')).toHaveTextContent('Повстанцы (AI):');
    expect(screen.getByTestId('log-entry-4')).toHaveTextContent('скрытая зона');
    expect(screen.getByTestId('log-entry-5')).toHaveTextContent('→ скрытая зона');
    expect(screen.getByTestId('log-entry-6')).toHaveTextContent('Повстанцы (AI):');
    const text = screen.getByTestId('event-log').textContent ?? '';
    const yavin = i18n.t(`systems.${CS_YAVIN}`, { ns: 'rebellion.data', defaultValue: CS_YAVIN });
    expect(text).not.toContain(yavin);
    expect(screen.getByTestId('event-log').innerHTML).not.toContain(CS_YAVIN);
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

  it('«Партия» tab: time, reputation, phase, passed, base unknown for the Empire, status + slice text (legend → map housing, SWR-009)', () => {
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
    expect(within(info).queryByTestId('map-legend')).not.toBeInTheDocument();
    // SWR-006 R-6: the «не активен в прототипе» placeholder is gone in core-v1.
    expect(within(info).queryByTestId('ai-status')).not.toBeInTheDocument();
  });

  it('SWR-006 R-6: rows «Противник» and «AI Commander» (bot / OpenAI / none); hot-seat — no AI Commander row', () => {
    const { unmount } = renderCore(
      makeCoreEmpireView(),
      <CoreGameInfoPanel status="prototype" />,
      makeSessionAutomationState({ strategy: 'bot' }),
    );
    expect(screen.getByTestId('game-info-opponent')).toHaveTextContent('Обычная');
    const commander = screen.getByTestId('game-info-ai-commander');
    expect(commander).toHaveAttribute('data-strategy', 'bot');
    expect(commander).toHaveTextContent('Бот (детерминированный)');
    expect(screen.getByTestId('game-info')).toHaveTextContent('AI CommanderБот');
    expect(screen.getByTestId('game-info')).not.toHaveTextContent(/не реализован|не активен/);
    unmount();

    const { unmount: unmount2 } = renderCore(
      makeCoreView(),
      <CoreGameInfoPanel status="prototype" />,
      makeSessionAutomationState({ strategy: 'openai' }),
    );
    expect(screen.getByTestId('game-info-ai-commander')).toHaveAttribute('data-strategy', 'openai');
    expect(screen.getByTestId('game-info-ai-commander')).toHaveTextContent(
      'OpenAI (при сбое — бот)',
    );
    unmount2();

    const { unmount: unmount3 } = renderCore(
      makeCoreView(),
      <CoreGameInfoPanel status="prototype" />,
    );
    expect(screen.getByTestId('game-info-ai-commander')).toHaveAttribute('data-strategy', 'none');
    expect(screen.getByTestId('game-info-ai-commander')).toHaveTextContent('—');
    unmount3();

    renderCore(
      makeCoreView({ settings: { ...CORE_HOT_SEAT } }),
      <CoreGameInfoPanel status="prototype" />,
    );
    expect(screen.getByTestId('game-info-opponent')).toHaveTextContent(
      i18n.t('rebellion.session:info.opponentHuman'),
    );
    expect(screen.queryByTestId('game-info-ai-commander')).not.toBeInTheDocument();
  });

  it('«Партия» tab after the game: status «Завершена» from view.outcome, base visible (Q-14)', () => {
    renderCore(makeCoreOutcomeView('empire'), <CoreGameInfoPanel status="prototype" />);
    const status = screen.getByTestId('game-info-status');
    expect(status).toHaveAttribute('data-status', 'completed');
    expect(status).toHaveTextContent('Завершена');
    expect(screen.getByTestId('game-info')).not.toHaveTextContent('неизвестна');
  });
});
