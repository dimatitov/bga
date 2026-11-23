import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { mq } from '@/shared/theme';
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
import { aiActivationTask, makePhysicalRebelsView } from '../test/tableFixtures';
import { PX_TITLE_ID } from './panels/focus';

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
  it('console: header, status bar, map housing, rail with turn controls / context / tabs, footer', async () => {
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
    const header = within(table).getByTestId('console-header');
    expect(within(header).getByTestId('session-back-to-game')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
    expect(within(header).getByTestId('session-settings')).toBeInTheDocument();
    const footer = within(table).getByTestId('console-footer');
    expect(within(footer).getByTestId('prototype-badge')).toHaveAttribute(
      'data-variant',
      'core-v1',
    );
    expect(within(table).getByTestId('table-top-bar')).toContainElement(
      within(table).getByTestId('save-status'),
    );
    expect(within(table).getAllByTestId('save-status')).toHaveLength(1);
  });

  it('SWR-009 §4: DOM order = Tab order — h1 → skip links → header → status → map → rail → footer', async () => {
    renderTable();
    const table = await screen.findByTestId('game-table');
    const order = [
      table.querySelector('h1')!,
      within(table).getByTestId('skip-to-turn'),
      within(table).getByTestId('skip-to-list'),
      within(table).getByTestId('console-header'),
      within(table).getByTestId('table-top-bar'),
      within(table).getByTestId('map-housing'),
      within(table).getByTestId('core-sidebar'),
      within(table).getByTestId('console-footer'),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${i}`,
      ).toBeTruthy();
    }
    // Tab order: the first focusable element of each part follows the same sequence.
    const focusables = Array.from(
      table.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'),
    );
    const firstIn = (id: string) =>
      focusables.findIndex((el) => within(table).getByTestId(id).contains(el));
    const idx = ['console-header', 'table-top-bar', 'core-sidebar', 'console-footer'].map(firstIn);
    expect(idx[0]).toBeGreaterThan(-1);
    expect(idx[0]).toBeLessThan(idx[2]!);
  });

  it('SWR-009 §4: console grid — areas per width (mobile-first media queries on game-table), case background', async () => {
    renderTable();
    const table = await screen.findByTestId('game-table');
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    const cls = Array.from(table.classList).filter((c) => c.startsWith('css-'));
    expect(cls.length).toBeGreaterThan(0);
    const own = cls.map((c) => css.slice(css.indexOf(`.${c}`) - 200)).join('\n');
    // Fix round 2: each mode has its own disjoint width range, so the emitted order of the queries cannot matter.
    const esc = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = (minWidth: number, maxWidth?: number) =>
      new RegExp(
        `${esc(maxWidth === undefined ? mq.up(minWidth) : mq.between(minWidth, maxWidth))
          .replace(/:/g, ':\\s*')
          .replace(/ and /, '\\s+and\\s+')}\\s*\\{[^}]*grid-template-columns:\\s*([^;]+);`,
      );
    expect(css.match(rule(1400))![1]).toBe('minmax(0, 1fr) 530px');
    expect(css.match(rule(1200, 1400))![1]).toBe('minmax(0, 1fr) 440px');
    expect(css.match(rule(900, 1200))![1]).toBe('minmax(0, 1fr) 340px');
    expect(css.match(rule(760, 900))![1]).toBe('minmax(0, 1fr)');
    expect(css).toMatch(
      /@media \(min-width:\s*900px\) and \(max-width:\s*1199\.95px\)\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden/,
    );
    // No open-ended `min-width` rule below the widest mode on the console root (that was the 1280 px defect).
    for (const w of [760, 900, 1200]) {
      expect(css).not.toMatch(new RegExp(`@media \\(min-width:\\s*${w}px\\)\\s*\\{\\.${cls[0]}`));
    }
    expect(own).toMatch(/grid-template-areas:\s*"header"\s*"status"\s*"board"\s*"side"\s*"footer"/);
    // Every part sits in its own area.
    expect(getComputedStyle(within(table).getByTestId('console-header')).gridArea).toMatch(
      /header/,
    );
    expect(getComputedStyle(within(table).getByTestId('table-top-bar')).gridArea).toMatch(/status/);
    expect(getComputedStyle(within(table).getByTestId('console-footer')).gridArea).toMatch(
      /footer/,
    );
  });

  it('SWR-009 K-7 skeleton: map housing (screen + legend) and rail order turn panel → controls → inspector → tabs', async () => {
    renderTable();
    const table = await screen.findByTestId('game-table');
    const housing = within(table).getByTestId('map-housing');
    expect(housing).toContainElement(within(table).getByTestId('board-canvas'));
    expect(housing).toContainElement(within(table).getByTestId('map-legend'));
    expect(within(table).getByTestId('game-info')).not.toContainElement(
      within(table).getByTestId('map-legend'),
    );
    expect(within(table).queryByTestId('top-bar-controls')).not.toBeInTheDocument();
    expect(within(table).getByTestId('table-top-bar')).not.toContainElement(
      within(table).getByTestId('turn-controls'),
    );
    const rail = within(table).getByTestId('core-sidebar');
    const order = ['turn-panel', 'turn-controls', 'core-context-panel', 'sidebar-tab-log'].map(
      (id) => within(rail).getByTestId(id),
    );
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${i}`,
      ).toBeTruthy();
    }
    // DOM order = Tab order: status bar → map → rail.
    expect(
      within(table).getByTestId('table-top-bar').compareDocumentPosition(housing) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(housing.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('CoreTable — SWR-010 FE-B Physical Execution mode (plan-frontend §2, §9)', () => {
  function renderSession(view: Parameters<typeof makeCoreSession>[0]) {
    mockFetch({
      [`GET /api/sessions/${CORE_SESSION_ID}`]: { status: 200, body: makeCoreSession(view) },
    });
    return renderWithProviders({ path: `/sessions/${CORE_SESSION_ID}` });
  }

  it('digital legacy game: data-console-mode="turn", data-cards-tracked="false"', async () => {
    renderTable();
    const table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-console-mode', 'turn');
    expect(table).toHaveAttribute('data-cards-tracked', 'false');
  });

  it('TC-RST-04 / TC-PX-06: the mode is restored from the view after a remount (reload), same task, same status', async () => {
    const view = makePhysicalRebelsView({
      unregistered: false,
      aiWaiting: true,
      tasks: [aiActivationTask()],
    });
    const first = renderSession(view);
    let table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-console-mode', 'physical');
    expect(table).toHaveAttribute('data-cards-tracked', 'true');
    expect(within(table).getByTestId('physical-execution')).toHaveAttribute(
      'data-head-kind',
      'aiActivation',
    );
    first.unmount();
    resetCoreStores();

    // «Reload»: a fresh app, the same server view → the same mode and task without any local state.
    renderSession(view);
    table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-console-mode', 'physical');
    expect(within(table).getByTestId('table-task-t-5-1')).toHaveAttribute('data-head', 'true');
    expect(within(table).getByTestId('table-task-waiting')).toHaveTextContent(
      t('rebellion.table:px.waiting.ai'),
    );
    expect(within(table).queryByTestId('turn-panel')).not.toBeInTheDocument();
    // Base registered → Game info names the base; before the registration it says «не зарегистрирована».
    expect(within(table).getByTestId('game-info-base')).not.toHaveTextContent(
      t('rebellion.table:register.notRegistered'),
    );
  });

  it('before the registration Game info says «base not registered»; the skip link goes to the PX heading', async () => {
    const { user } = renderSession(makePhysicalRebelsView());
    const table = await screen.findByTestId('game-table');
    expect(within(table).getByTestId('game-info-base')).toHaveTextContent(
      t('rebellion.table:register.notRegistered'),
    );
    await user.click(within(table).getByTestId('skip-to-turn'));
    await waitFor(() => expect(document.activeElement?.id).toBe(PX_TITLE_ID));
  });
});
