import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { resetAutomationStore } from '@/platform/automation';
import { useFeedbackStore } from '@/shared/feedback';
import { mockFetch, type MockReply, renderWithProviders } from '@/shared/test';
import { useSelectionStore } from '../board/model/selectionStore';
import {
  CORE_HOT_SEAT,
  CORE_SESSION_ID,
  CS_CORELLIA,
  L_LEIA,
  makeAutomationSummary,
  makeCoreSession,
  makeCoreView,
} from '../test/coreFixtures';
import { useCoreUiStore } from './model/coreUiStore';
import { TURN_TITLE_ID } from './panels/focus';
import { resetCoreStores } from './panels/test/harness';
import { PRELOAD_TIMEOUT_MS, preloadTableScreen } from '../test/preloadTable';

// The first render of a file waits for the lazy table chunk; load it here (SWR-006 final gate, see helper).
beforeAll(preloadTableScreen, PRELOAD_TIMEOUT_MS);

beforeEach(() => {
  resetCoreStores();
  resetAutomationStore();
});

const t = i18n.t;

/** Real app routes: `/sessions/:id` → SessionHost → Rebellion TableScreen → CoreTable. */
function renderTable() {
  mockFetch({
    [`GET /api/sessions/${CORE_SESSION_ID}`]: {
      status: 200,
      body: makeCoreSession(makeCoreView()),
    },
  });
  return renderWithProviders({ path: `/sessions/${CORE_SESSION_ID}` });
}

describe('CoreTable composition (P1, plan-frontend §3.4)', () => {
  it('top bar with turn controls, map container, sidebar with turn panel / context / tabs', async () => {
    renderTable();
    const table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-rules-engine', 'core-v1');
    expect(within(table).getByTestId('turn-controls')).toBeInTheDocument();
    expect(within(table).getByTestId('pass-turn')).toBeEnabled();
    expect(within(table).getByTestId('board-canvas')).toHaveAttribute('role', 'region');
    expect(within(table).getByTestId('turn-panel')).toHaveAttribute('data-state', 'idle');
    expect(within(table).getByTestId('core-context-panel')).toBeInTheDocument();
    // The accessible list is in the DOM even while its tab is hidden.
    expect(within(table).getByTestId('board-list')).toBeInTheDocument();
    expect(within(table).getByTestId('session-back-to-game')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
  });

  it('skip links focus the turn panel heading and the object list', async () => {
    const { user } = renderTable();
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('skip-to-turn'));
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(TURN_TITLE_ID)),
    );
    expect(screen.getByTestId('skip-to-turn')).toHaveTextContent(t('rebellion.turn:skip.toTurn'));
    await user.click(screen.getByTestId('skip-to-list'));
    await waitFor(() => expect(useSelectionStore.getState().sidebarTab).toBe('objects'));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        'data-testid',
        expect.stringMatching(/^system-item-/),
      ),
    );
  });

  it('skip links are clipped until focused, not hidden by a negative offset (SWR-006 D-1: content above the table)', async () => {
    renderTable();
    await screen.findByTestId('game-table');
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    for (const id of ['skip-to-turn', 'skip-to-list']) {
      const cls = Array.from(screen.getByTestId(id).classList).filter((c) => c.startsWith('css-'));
      expect(cls.length, id).toBeGreaterThan(0);
      const own = cls.map((c) => css.slice(css.indexOf(`.${c}`))).join('\n');
      expect(own, id).toMatch(/:not\(:focus-visible\)\s*\{[^}]*clip-path:\s*inset\(50%\)/);
      expect(own.slice(0, own.indexOf('}')), id).not.toMatch(/top:\s*-/);
      // `sx` width 1 = 100%: the clipped link must be 1px, or it widens the page by its `left` offset.
      expect(own, id).toMatch(/:not\(:focus-visible\)\s*\{[^}]*width:\s*1px/);
    }
  });

  it('Esc first drops the armed leader (selection kept), then clears the selection', async () => {
    const { user } = renderTable();
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId(`leader-${L_LEIA}`));
    useSelectionStore.getState().selectSystem(CS_CORELLIA);
    await user.keyboard('{Escape}');
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
    expect(useSelectionStore.getState().selection).toEqual({
      kind: 'system',
      systemId: CS_CORELLIA,
    });
    await user.keyboard('{Escape}');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });
});

const RUN_PATH = `POST /api/sessions/${CORE_SESSION_ID}/automation/run`;

describe('CoreTable — AI Commander through SessionHost (SWR-006 R-5, R-8)', () => {
  it('pending AI turn on load: one run; «ИИ думает…» + actions blocked while it runs; summary read out once', async () => {
    // The human Rebels wait for the AI Empire (pending): the server's view after the AI turn hands it back.
    const waiting = makeCoreView({ activeSide: 'empire', legalActions: [] });
    let release: (reply: MockReply) => void = () => {};
    const api = mockFetch({
      [`GET /api/sessions/${CORE_SESSION_ID}`]: {
        status: 200,
        body: makeCoreSession(waiting, { automation: { pending: true, strategy: 'bot' } }),
      },
      [RUN_PATH]: () =>
        new Promise<MockReply>((resolve) => {
          release = resolve;
        }),
    });
    renderWithProviders({ path: `/sessions/${CORE_SESSION_ID}` });
    await screen.findByTestId('game-table');
    await waitFor(() => expect(screen.getByTestId('ai-thinking')).toBeInTheDocument());
    expect(screen.getByTestId('ai-commander-status')).toHaveAttribute('data-state', 'thinking');
    expect(screen.getByTestId('turn-status')).toHaveTextContent('ИИ думает…');
    expect(screen.getByTestId('pass-turn')).toBeDisabled();

    const next = makeCoreView({ version: 6 });
    release({
      status: 200,
      body: {
        ok: true,
        view: next,
        events: [
          {
            seq: 3,
            at: '2026-11-08T10:00:00.000Z',
            type: 'PASSED',
            actor: 'empire',
            payload: { auto: true },
          },
        ],
        automation: makeAutomationSummary({ steps: 3, strategy: 'bot', stopReason: 'humanTurn' }),
      },
    });
    await waitFor(() => expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument());
    const summary = screen.getByTestId('ai-turn-summary');
    expect(summary).toHaveAttribute('data-source', 'run');
    expect(summary).toHaveAttribute('data-steps', '3');
    expect(screen.getByTestId('pass-turn')).toBeEnabled();
    await waitFor(() =>
      expect(useFeedbackStore.getState().live?.text).toBe('Ход AI: 3 действия Империя (AI) пасует'),
    );
    expect(api.requests.filter((r) => r.path.endsWith('/automation/run'))).toHaveLength(1);
  });

  it('hot-seat core-v1: no AI Commander, no summary, no «ИИ думает…», no run (R-8)', async () => {
    const api = mockFetch({
      [`GET /api/sessions/${CORE_SESSION_ID}`]: {
        status: 200,
        body: makeCoreSession(makeCoreView({ settings: { ...CORE_HOT_SEAT } })),
      },
    });
    renderWithProviders({ path: `/sessions/${CORE_SESSION_ID}` });
    await screen.findByTestId('game-table');
    expect(screen.queryByTestId('ai-commander-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-turn-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
    expect(screen.queryByTestId('game-info-ai-commander')).not.toBeInTheDocument();
    expect(api.requests.some((r) => r.path.endsWith('/automation/run'))).toBe(false);
  });
});
