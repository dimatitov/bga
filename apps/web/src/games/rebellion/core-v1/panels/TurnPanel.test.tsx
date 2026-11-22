import type { PlayerEvent } from '@bga/game-rebellion/schema';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockReply } from '@/shared/test';
import { useFeedbackStore } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import {
  CORE_HOT_SEAT,
  CS_SULLUST,
  L_LEIA,
  makeAutomationSummary,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
  makeSessionAutomationState,
} from '../../test/coreFixtures';
import { TURN_PANEL_ID, TURN_TITLE_ID } from './focus';
import { factionLabel } from './labels';
import { CMD_PATH, commandsOf, ok, renderCore, resetCoreStores } from './test/harness';
import { TurnControls } from './TurnControls';
import { TurnPanel } from './TurnPanel';
import { responseAnnouncements } from './useTurnCommands';

beforeEach(resetCoreStores);

const t = i18n.t;

describe('TurnPanel states (P1, plan-frontend §5.1, §9)', () => {
  it('idle: «your turn» text, pool, no move panel', () => {
    renderCore(<TurnPanel />, makeCoreView());
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'idle');
    expect(screen.getByTestId('turn-status')).toHaveTextContent(t('rebellion.turn:panel.yourTurn'));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      t('rebellion.turn:panel.label', { phase: t('rebellion.common:phase.command') }),
    );
    expect(screen.getByTestId('turn-panel')).toHaveAccessibleName('Ваша задача · Приказы');
    expect(screen.getByTestId('turn-task')).toHaveTextContent('Выберите лидера');
    expect(screen.getByTestId('turn-led-line')).toHaveAttribute('data-led', 'green');
    expect(screen.getByTestId('turn-led-line')).toHaveTextContent('Ваш ход · Повстанцы');
    expect(screen.queryByTestId('move-panel')).not.toBeInTheDocument();
  });

  it('R-6 rev.2: the opponent has passed → consecutive turns are explained', () => {
    renderCore(<TurnPanel />, makeCoreEmpireView());
    expect(screen.getByTestId('turn-status')).toHaveTextContent(
      t('rebellion.turn:panel.opponentPassed.rebels'),
    );
    expect(screen.getByTestId('leader-pool')).toBeInTheDocument();
  });

  it('waiting: not my turn → the side to play, no pool and no actions', () => {
    renderCore(<TurnPanel />, makeCoreView({ activeSide: 'empire', legalActions: [] }));
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'waiting');
    expect(screen.getByTestId('turn-status')).toHaveTextContent(
      t('rebellion.turn:panel.waiting', { side: factionLabel(t, 'empire') }),
    );
    expect(screen.queryByTestId('leader-pool')).not.toBeInTheDocument();
  });

  it('waiting after my own pass → «you passed»', () => {
    renderCore(
      <TurnPanel />,
      makeCoreView({
        activeSide: 'empire',
        passed: { rebels: true, empire: false },
        legalActions: [],
      }),
    );
    expect(screen.getByTestId('turn-status')).toHaveTextContent(
      t('rebellion.turn:panel.youPassed'),
    );
  });

  it('activation and over', () => {
    const { unmount } = renderCore(<TurnPanel />, makeCoreActivationView());
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'activation');
    expect(screen.getByTestId('move-panel')).toBeInTheDocument();
    unmount();
    renderCore(<TurnPanel />, makeCoreOutcomeView());
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'over');
    expect(screen.getByTestId('turn-status')).toHaveTextContent(t('rebellion.turn:panel.gameOver'));
    expect(screen.queryByTestId('leader-pool')).not.toBeInTheDocument();
  });
});

describe('TurnPanel «Your task» module (SWR-009 C2)', () => {
  it('the header span is the focus target (TURN_TITLE_ID) inside the h2; the section is turn-panel with the panel id', () => {
    renderCore(<TurnPanel />, makeCoreView());
    const title = document.getElementById(TURN_TITLE_ID);
    expect(title).not.toBeNull();
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title?.closest('h2')).not.toBeNull();
    expect(screen.getByTestId('turn-panel').id).toBe(TURN_PANEL_ID);
    expect(screen.getByTestId('turn-panel').tagName).toBe('SECTION');
  });

  it('task line per state: armed → «Выберите систему», activation → «Переместите юниты», waiting, over', async () => {
    const { user, unmount } = renderCore(<TurnPanel />, makeCoreView());
    await user.click(screen.getByTestId(`leader-${L_LEIA}`));
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'armed');
    expect(screen.getByTestId('turn-task')).toHaveTextContent('Выберите систему');
    unmount();
    resetCoreStores();

    const a = renderCore(<TurnPanel />, makeCoreActivationView());
    expect(screen.getByTestId('turn-task')).toHaveTextContent('Переместите юниты');
    expect(screen.getByTestId('turn-led-line')).toHaveAttribute('data-led', 'green');
    a.unmount();

    const w = renderCore(<TurnPanel />, makeCoreView({ activeSide: 'empire', legalActions: [] }));
    expect(screen.getByTestId('turn-task')).toHaveTextContent('Ожидайте свой ход');
    expect(screen.getByTestId('turn-led-line')).toHaveAttribute('data-led', 'off');
    expect(screen.getByTestId('turn-led-line')).toHaveTextContent('Ход: Империя');
    w.unmount();

    renderCore(<TurnPanel />, makeCoreOutcomeView());
    expect(screen.getByTestId('turn-task')).toHaveTextContent('Партия завершена');
    expect(screen.getByTestId('turn-led-line')).toHaveAttribute('data-led', 'off');
  });

  it('LED line: AI running → amber «AI выполняет ход · Империя»; stalled → red', () => {
    const { unmount } = renderCore(
      <TurnPanel />,
      makeCoreView(),
      {},
      { automation: makeSessionAutomationState({ phase: 'running' }) },
    );
    expect(screen.getByTestId('turn-led-line')).toHaveAttribute('data-led', 'amber');
    expect(screen.getByTestId('turn-led-line')).toHaveTextContent('AI выполняет ход · Империя');
    unmount();
    renderCore(
      <TurnPanel />,
      makeCoreView({ activeSide: 'empire', legalActions: [] }),
      {},
      { automation: makeSessionAutomationState({ phase: 'stalled', pending: true }) },
    );
    expect(screen.getByTestId('turn-led-line')).toHaveAttribute('data-led', 'red');
  });

  it('en: header and LED line without Cyrillic', async () => {
    renderCore(<TurnPanel />, makeCoreView());
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('turn-panel')).toHaveAccessibleName('Your task · Command'),
    );
    expect(screen.getByTestId('turn-led-line')).toHaveTextContent('Your turn · Rebels');
    expect(screen.getByTestId('turn-panel').textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('responseAnnouncements', () => {
  const events: PlayerEvent[] = [
    {
      seq: 5,
      at: '2026-11-08T10:00:00.000Z',
      type: 'PASSED',
      actor: 'empire',
      payload: { auto: true },
    } as PlayerEvent,
  ];

  it('reads the AI auto-pass with the side name when the match key exists', () => {
    const texts = responseAnnouncements(
      ((key: string, values?: Record<string, unknown>) =>
        key === 'rebellion.match:announce.autoPass'
          ? `auto:${String(values?.side)}`
          : t(key, values)) as typeof t,
      () => true,
      makeCoreView(),
      events,
    );
    expect(texts).toEqual([`auto:${factionLabel(t, 'empire')}`]);
  });

  it('skips announcements whose key does not exist yet (no raw keys read out)', () => {
    expect(responseAnnouncements(t, () => false, makeCoreView(), events)).toEqual([]);
  });
});

/** A command reply the test releases by hand (to look at the UI while the request is in flight). */
function deferredReply() {
  let release: (reply: MockReply) => void = () => {};
  const promise = new Promise<MockReply>((resolve) => {
    release = resolve;
  });
  return { handler: () => promise, release };
}

describe('TurnPanel / actions while the AI moves (SWR-006 R-5, plan-frontend §6.2, §6.4)', () => {
  it('an automation run in flight: «ИИ думает…», pass / leaders disabled', () => {
    renderCore(
      <>
        <TurnControls />
        <TurnPanel />
      </>,
      makeCoreView(),
      {},
      { automation: makeSessionAutomationState({ phase: 'running' }) },
    );
    expect(screen.getByTestId('turn-status')).toHaveTextContent('ИИ думает…');
    expect(screen.getByTestId('pass-turn')).toBeDisabled();
    expect(screen.getByTestId(`leader-${L_LEIA}`)).toHaveAttribute('aria-disabled', 'true');
  });

  it.each(['error', 'stalled'] as const)(
    'waiting for the AI after a %s run → «Ход AI не завершён — …»',
    (phase) => {
      renderCore(
        <TurnPanel />,
        makeCoreView({ activeSide: 'empire', legalActions: [] }),
        {},
        { automation: makeSessionAutomationState({ phase, pending: true }) },
      );
      expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'waiting');
      expect(screen.getByTestId('turn-status')).toHaveTextContent(
        t('rebellion.turn:panel.aiStalled'),
      );
    },
  );

  it('hot-seat ignores the automation (no «ИИ думает…», actions enabled)', () => {
    renderCore(
      <>
        <TurnControls />
        <TurnPanel />
      </>,
      makeCoreView({ settings: { ...CORE_HOT_SEAT } }),
      {},
      { automation: makeSessionAutomationState({ strategy: null, phase: 'running' }) },
    );
    expect(screen.getByTestId('turn-status')).toHaveTextContent(t('rebellion.turn:panel.yourTurn'));
    expect(screen.getByTestId('pass-turn')).toBeEnabled();
  });

  it('FINISH_ACTIVATION in flight → «ИИ думает…»; the AI summary of the response is read out once', async () => {
    const view = makeCoreActivationView();
    const reply = deferredReply();
    const { user, api } = renderCore(
      <>
        <TurnControls />
        <TurnPanel />
      </>,
      view,
      { [CMD_PATH]: reply.handler },
      { automation: makeSessionAutomationState() },
    );
    await user.click(screen.getByTestId('finish-activation'));
    await waitFor(() => expect(commandsOf(api.requests)).toEqual([{ type: 'FINISH_ACTIVATION' }]));
    expect(screen.getByTestId('turn-status')).toHaveTextContent('ИИ думает…');
    expect(screen.getByTestId('pass-turn')).toBeDisabled();

    const next = makeCoreView({ version: view.version + 3 });
    reply.release({
      ...ok(next),
      body: {
        ...ok(next).body,
        automation: makeAutomationSummary({ steps: 2, strategy: 'bot', stopReason: 'humanTurn' }),
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('turn-status')).toHaveTextContent(
        t('rebellion.turn:panel.yourTurn'),
      ),
    );
    const live = useFeedbackStore.getState().live?.text ?? '';
    expect(live).toContain(t('rebellion.turn:finish.done'));
    expect(live.match(/Ход AI: 2 действия/g)).toHaveLength(1);
  });

  it('MOVE_PIECES in flight is not an AI turn (Q-FE-3): no «ИИ думает…»', async () => {
    const view = makeCoreActivationView();
    const reply = deferredReply();
    const { user, api } = renderCore(
      <TurnPanel />,
      view,
      { [CMD_PATH]: reply.handler },
      { automation: makeSessionAutomationState() },
    );
    await user.click(screen.getByTestId(`move-select-all-${CS_SULLUST}`));
    await user.click(screen.getByTestId(`move-submit-${CS_SULLUST}`));
    await waitFor(() => expect(commandsOf(api.requests)).toHaveLength(1));
    expect(screen.queryByText('ИИ думает…')).not.toBeInTheDocument();
    reply.release(ok(makeCoreActivationView({ version: view.version + 1 })));
    // The move's own feedback is read out once the response is in.
    await waitFor(() => expect(useFeedbackStore.getState().live).not.toBeNull());
  });
});
