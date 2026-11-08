import type {
  CommandEnvelope,
  HandoffView,
  PlayerView,
  PlayerViewCore,
} from '@bga/game-rebellion/schema';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { sessionKeys } from '@/platform';
import { mockFetch, renderWithProviders, type MockHandler } from '@/shared/test';
import { useDragStore, useSelectionStore } from '../board';
import {
  FIXTURE_SETTINGS,
  makeHandoffView,
  makeMovedView,
  makeRebellionSession,
  makeView,
  P_E1,
  P_R1,
  S_A,
  S_B,
  SESSION_ID,
} from '../test/fixtures';
import {
  CORE_SESSION_ID,
  makeCoreActivationView,
  makeCoreHandoffView,
  makeCoreSession,
  makeCoreView,
} from '../test/coreFixtures';

// Konva needs a real <canvas>; the canvas is covered by Playwright (plan-frontend §6.4).
vi.mock('../board/canvas/BoardStage', () => ({
  BoardStage: () => <div data-testid="board-canvas" />,
}));

const VIEW_PATH = `GET /api/sessions/${SESSION_ID}`;
const CMD_PATH = `POST /api/sessions/${SESSION_ID}/commands`;
const session = (view: PlayerView = makeView()) => ({
  status: 200,
  body: makeRebellionSession(view),
});

/** Real app routes: `/sessions/:id` → SessionHost → registry → lazy Rebellion `TableScreen` (SWR-003 §2.1). */
function renderTable(routes: Record<string, MockHandler>) {
  const api = mockFetch(routes);
  const utils = renderWithProviders({ path: `/sessions/${SESSION_ID}` });
  return { ...utils, api };
}

async function selectPieceViaList(user: ReturnType<typeof renderTable>['user'], pieceId: string) {
  await user.click(screen.getByTestId('sidebar-tab-objects'));
  await user.click(screen.getByTestId(`piece-item-${pieceId}`));
  await waitFor(() =>
    expect(screen.getByTestId(`piece-item-${pieceId}`)).toHaveAttribute('aria-selected', 'true'),
  );
}

beforeEach(() => {
  useSelectionStore.setState({ gameId: null, selection: { kind: 'none' }, sidebarTab: 'log' });
  useDragStore.getState().clear();
});

describe('Rebellion TableScreen (via SessionHost)', () => {
  it('TC-WEB-11: renders server view with round/phase, prototype badge and a mock-labelled End phase', async () => {
    renderTable({ [VIEW_PATH]: session() });
    const table = await screen.findByTestId('game-table');
    // SWR-005 FE-0: an old (mock-v1) session renders the legacy table.
    expect(table).toHaveAttribute('data-rules-engine', 'mock-v1');
    expect(screen.getByTestId('board-canvas')).toBeInTheDocument();
    // Q-10: data-game-id = game id, data-session-id = session id.
    expect(table).toHaveAttribute('data-game-id', 'star-wars-rebellion');
    expect(table).toHaveAttribute('data-session-id', SESSION_ID);
    expect(screen.getByTestId('session-host')).toHaveAttribute(
      'data-game-id',
      'star-wars-rebellion',
    );
    expect(table).toHaveAttribute('data-version', '3');
    expect(screen.getByTestId('round-indicator')).toHaveTextContent('1');
    expect(screen.getByTestId('phase-indicator')).toHaveAttribute('data-phase', 'assignment');
    expect(screen.getByTestId('prototype-badge')).toBeVisible();
    expect(screen.queryByTestId('mock-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('advance-phase')).toHaveTextContent(/mock/i);
    expect(screen.getByTestId('advance-phase-panel')).toHaveTextContent(/mock/i);
    expect(screen.getByTestId('context-panel')).toHaveAttribute('data-state', 'empty');
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-status', 'idle');
    expect(screen.getAllByTestId('event-log-item').map((e) => e.dataset.seq)).toEqual(['2', '1']);
    // Accessible list is in the DOM even while its tab is inactive (R-9).
    const list = screen.getByTestId('board-list');
    expect(list).toHaveAttribute('role', 'listbox');
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('role', 'option');
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('data-system-id', S_A);
    expect(screen.getByTestId('sidebar-tab-log')).toHaveAttribute('aria-selected', 'true');
  });

  it('404 → SessionHost shows session-not-found (the table never loads the session itself)', async () => {
    renderTable({
      [VIEW_PATH]: {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' } },
      },
    });
    expect(await screen.findByTestId('session-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('game-table')).not.toBeInTheDocument();
  });

  it('TC-WEB-06 (component): selecting P_E1 offers only server targets and highlights them', async () => {
    const { user } = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_E1);
    expect(screen.getByTestId('context-panel')).toHaveAttribute('data-state', 'piece');
    const panel = screen.getByTestId('piece-panel');
    const buttons = within(panel)
      .getAllByRole('button')
      .filter((b) => b.dataset.testid?.startsWith('action-move-'));
    expect(buttons.map((b) => b.dataset.testid)).toEqual([`action-move-${P_E1}-${S_B}`]);
    expect(screen.getByTestId(`system-item-${S_B}`)).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('system-item-sys-cindral')).toHaveAttribute(
      'data-highlighted',
      'false',
    );
    expect(screen.getByTestId(`system-item-${S_B}-move`)).toBeInTheDocument();
  });

  it('TC-WEB-07: an enemy piece shows info and no move actions', async () => {
    const { user } = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_R1);
    expect(screen.getByTestId('piece-panel')).toBeInTheDocument();
    expect(document.querySelectorAll(`[data-testid^="action-move-${P_R1}-"]`)).toHaveLength(0);
    expect(screen.getByTestId('action-panel')).toHaveTextContent(
      i18n.t('rebellion.board:actions.enemyNoActions'),
    );
  });

  it('moves via the actions panel: envelope from cache, view from response, log + feedback + focus', async () => {
    const moved = makeMovedView();
    const { user, api } = renderTable({
      [VIEW_PATH]: session(),
      [CMD_PATH]: { status: 200, body: { ok: true, view: moved, events: [moved.log.at(-1)] } },
    });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_E1);
    await user.click(screen.getByTestId(`action-move-${P_E1}-${S_B}`));

    await waitFor(() =>
      expect(screen.getByTestId('game-table')).toHaveAttribute('data-version', '4'),
    );
    const post = api.requests.find((r) => r.method === 'POST');
    expect(post?.body).toEqual({
      actor: 'empire',
      expectedVersion: 3,
      command: { type: 'MOVE_PIECES', pieceIds: [P_E1], fromSystemId: S_A, toSystemId: S_B },
    } satisfies CommandEnvelope);
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('data-system-id', S_B);
    expect(screen.getAllByTestId('event-log-item')[0]).toHaveAttribute('data-seq', '3');
    const text = i18n.t('rebellion.board:move.success', {
      piece: i18n.t('rebellion.gameData:pieces.unit.empire.capital-ship'),
      system: i18n.t('rebellion.gameData:systems.sys-brevora'),
    });
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent(text));
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    // Selection stays on the moved piece; focus goes into the context panel (D-C-6).
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(screen.getByTestId('context-panel')).toContainElement(
        document.activeElement as HTMLElement,
      ),
    );
  });

  it('TC-WEB-08: 422 shows the localized reason and leaves the state unchanged', async () => {
    const { user } = renderTable({
      [VIEW_PATH]: session(),
      [CMD_PATH]: {
        status: 422,
        body: { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' } },
      },
    });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_E1);
    await user.click(screen.getByTestId(`action-move-${P_E1}-${S_B}`));
    const reason = i18n.t('rebellion.errors:notAdjacent');
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent(reason));
    expect(screen.getByTestId('feedback')).toHaveTextContent(reason);
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('data-system-id', S_A);
    expect(screen.getByTestId('game-table')).toHaveAttribute('data-version', '3');
  });

  it('TC-WEB-09: 409 → "state updated" message, view refetched, selection kept', async () => {
    let gets = 0;
    const fresh = makeView({ version: 5 });
    const { user } = renderTable({
      [VIEW_PATH]: () => session(gets++ === 0 ? makeView() : fresh),
      [CMD_PATH]: {
        status: 409,
        body: {
          ok: false,
          error: {
            code: 'VERSION_CONFLICT',
            messageKey: 'errors.versionConflict',
            details: { currentVersion: 5 },
          },
        },
      },
    });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_E1);
    await user.click(screen.getByTestId(`action-move-${P_E1}-${S_B}`));
    await waitFor(() =>
      expect(screen.getByTestId('game-table')).toHaveAttribute('data-version', '5'),
    );
    expect(gets).toBe(2);
    await waitFor(() =>
      expect(screen.getByTestId('live-region')).toHaveTextContent(i18n.t('errors:versionConflict')),
    );
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('aria-selected', 'true');
  });

  it('network failure → error message with retry, save-status error', async () => {
    const { user } = renderTable({
      [VIEW_PATH]: session(),
      [CMD_PATH]: 'network',
    });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_E1);
    await user.click(screen.getByTestId(`action-move-${P_E1}-${S_B}`));
    await waitFor(() =>
      expect(screen.getByTestId('live-region')).toHaveTextContent(i18n.t('errors:network')),
    );
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-status', 'error');
    expect(
      within(screen.getByTestId('feedback')).getByRole('button', {
        name: i18n.t('common:actions.retry'),
      }),
    ).toBeInTheDocument();
  });

  it('mock End phase sends ADVANCE_PHASE and shows the new phase', async () => {
    const next = makeView({ version: 4, phase: 'command' });
    const { user, api } = renderTable({
      [VIEW_PATH]: session(),
      [CMD_PATH]: { status: 200, body: { ok: true, view: next, events: [] } },
    });
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('advance-phase'));
    await waitFor(() =>
      expect(screen.getByTestId('phase-indicator')).toHaveAttribute('data-phase', 'command'),
    );
    expect(api.requests.find((r) => r.method === 'POST')?.body).toEqual({
      actor: 'empire',
      expectedVersion: 3,
      command: { type: 'ADVANCE_PHASE' },
    });
  });

  it('End phase is disabled when ADVANCE_PHASE is not in legalActions', async () => {
    renderTable({ [VIEW_PATH]: session(makeView({ legalActions: [] })) });
    await screen.findByTestId('game-table');
    expect(screen.getByTestId('advance-phase')).toBeDisabled();
  });

  it('listbox keyboard: arrows move focus, Enter selects; Esc clears the selection', async () => {
    const { user } = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('sidebar-tab-objects'));
    const first = screen.getByTestId(`system-item-${S_A}`);
    expect(first).toHaveAttribute('tabindex', '0');
    act(() => first.focus());
    await user.keyboard('{ArrowDown}');
    // First option after S_A is the first own piece of S_A (P_E1).
    expect(document.activeElement).toBe(screen.getByTestId(`piece-item-${P_E1}`));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('context-panel')).toHaveAttribute('data-state', 'piece');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByTestId('context-panel')).toHaveAttribute('data-state', 'empty'),
    );
  });

  it('system selection shows the system panel with group move (intersection of legal targets)', async () => {
    const { user } = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('sidebar-tab-objects'));
    await user.click(screen.getByTestId(`system-item-${S_A}`));
    expect(screen.getByTestId('context-panel')).toHaveAttribute('data-state', 'system');
    expect(
      within(screen.getByTestId('context-panel')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent(i18n.t('rebellion.gameData:systems.sys-aurelis'));
    expect(screen.getByTestId('system-panel')).toHaveTextContent(
      i18n.t('rebellion.gameData:regions.reg-inner'),
    );
    expect(screen.getByTestId('system-panel')).toHaveTextContent(
      i18n.t('rebellion.gameData:systems.sys-brevora'),
    );
    expect(screen.getByTestId(`action-move-all-${S_A}-${S_B}`)).toBeInTheDocument();
  });

  it('D-SH-4: "← To game" leads to the game page; settings link kept', async () => {
    const { user, router } = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    const back = screen.getByTestId('session-back-to-game');
    expect(back).toHaveAttribute('href', '/games/star-wars-rebellion');
    expect(back).toHaveTextContent(i18n.t('rebellion.session:topBar.backToGame'));
    expect(screen.getByTestId('session-settings')).toHaveAttribute('href', '/settings');
    await user.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/star-wars-rebellion'));
  });

  it('a view that does not match the Rebellion schema → table-invalid-view with "← To game"', async () => {
    renderTable({
      [VIEW_PATH]: {
        status: 200,
        body: { ...makeRebellionSession(), view: { broken: true } },
      },
    });
    const invalid = await screen.findByTestId('table-invalid-view');
    expect(invalid).toHaveTextContent(i18n.t('rebellion.session:invalidView.text'));
    expect(within(invalid).getByTestId('session-back-to-game')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
    expect(screen.queryByTestId('game-table')).not.toBeInTheDocument();
  });

  it('TC-C-16 (AC-13): «Прототип» badge with the full text and data-status; «Статус» row in the Game tab', async () => {
    const { user } = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    const badge = screen.getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-status', 'prototype');
    // SWR-005 (TC-C-14, D-SW5-1): an old mock-v1 session shows the legacy variant «Старый прототип: тестовые правила».
    expect(badge).toHaveAttribute('data-variant', 'legacy');
    expect(badge).toHaveTextContent(i18n.t('rebellion.common:prototype.legacy'));
    expect(within(screen.getByTestId('table-top-bar')).getByTestId('prototype-badge')).toBe(badge);
    await user.click(screen.getByTestId('sidebar-tab-game'));
    const status = screen.getByTestId('game-info-status');
    expect(status).toHaveAttribute('data-status', 'prototype');
    expect(status).toHaveTextContent(i18n.t('common:sessionStatus.prototype'));
    expect(status).toHaveTextContent(i18n.t('rebellion.common:prototype.full'));
  });

  it('a non-prototype session has no «Прототип» badge; the status row shows its status', async () => {
    const { user } = renderTable({
      [VIEW_PATH]: { status: 200, body: makeRebellionSession(makeView(), { status: 'active' }) },
    });
    await screen.findByTestId('game-table');
    expect(screen.queryByTestId('prototype-badge')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('sidebar-tab-game'));
    expect(screen.getByTestId('game-info-status')).toHaveAttribute('data-status', 'active');
    expect(screen.getByTestId('game-info-status')).toHaveTextContent(
      i18n.t('common:sessionStatus.active'),
    );
  });

  it('TC-C-19: AI game — no "Pass the turn"; active-side is the player\'s side', async () => {
    renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    expect(screen.queryByTestId('end-turn')).not.toBeInTheDocument();
    const side = screen.getByTestId('active-side');
    expect(side).toHaveAttribute('data-side', 'empire');
    expect(side).toHaveTextContent(
      i18n.t('rebellion.session:topBar.vsAi', {
        difficulty: i18n.t('rebellion.common:difficulty.normal'),
      }),
    );
    expect(side).not.toHaveTextContent(i18n.t('rebellion.session:topBar.turn'));
  });

  it('human game: «Ход: <side>» and "Pass the turn", enabled only when END_TURN is a legal action', async () => {
    const human = {
      settings: { ...FIXTURE_SETTINGS, opponentType: 'human', aiDifficulty: null },
    } as const;
    const { unmount } = renderTable({
      [VIEW_PATH]: session(makeView({ ...human, legalActions: [{ type: 'END_TURN' }] })),
    });
    await screen.findByTestId('game-table');
    const side = screen.getByTestId('active-side');
    expect(side).toHaveAttribute('data-side', 'empire');
    expect(side).toHaveTextContent(i18n.t('rebellion.session:topBar.turn'));
    expect(side).toHaveTextContent(i18n.t('rebellion.session:topBar.vsHuman'));
    const endTurn = screen.getByTestId('end-turn');
    expect(endTurn).toHaveTextContent(i18n.t('rebellion.session:topBar.endTurn'));
    expect(endTurn).toBeEnabled();
    unmount();

    renderTable({ [VIEW_PATH]: session(makeView({ ...human, legalActions: [] })) });
    await screen.findByTestId('game-table');
    expect(screen.getByTestId('end-turn')).toBeDisabled();
  });

  it('Game tab: AI placeholder chip only in AI games (hidden in hot-seat games)', async () => {
    const first = renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    await first.user.click(screen.getByTestId('sidebar-tab-game'));
    expect(screen.getByTestId('ai-status')).toBeInTheDocument();
    first.unmount();

    const human = {
      settings: { ...FIXTURE_SETTINGS, opponentType: 'human', aiDifficulty: null },
    } as const;
    const second = renderTable({ [VIEW_PATH]: session(makeView({ ...human })) });
    await screen.findByTestId('game-table');
    await second.user.click(screen.getByTestId('sidebar-tab-game'));
    expect(screen.getByTestId('game-info-status')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-status')).not.toBeInTheDocument();
  });

  it('END_TURN rejected (422 handoffNotAvailable) → localized reason, table stays', async () => {
    const human = {
      settings: { ...FIXTURE_SETTINGS, opponentType: 'human', aiDifficulty: null },
    } as const;
    const { user } = renderTable({
      [VIEW_PATH]: session(makeView({ ...human, legalActions: [{ type: 'END_TURN' }] })),
      [CMD_PATH]: {
        status: 422,
        body: {
          ok: false,
          error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.handoffNotAvailable' },
        },
      },
    });
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('end-turn'));
    const reason = i18n.t('rebellion.errors:handoffNotAvailable');
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent(reason));
    expect(screen.getByTestId('game-table')).toBeInTheDocument();
    expect(screen.queryByTestId('handoff-screen')).not.toBeInTheDocument();
  });

  it('D-1: one top bar (table-top-bar) holds nav, sides, state and status groups; no horizontal scroll container', async () => {
    renderTable({ [VIEW_PATH]: session() });
    await screen.findByTestId('game-table');
    const bar = screen.getByTestId('table-top-bar');
    for (const id of [
      'session-back-to-game',
      'active-side',
      'round-indicator',
      'phase-indicator',
      'advance-phase',
      'prototype-badge',
      'save-status',
      'session-settings',
    ]) {
      expect(bar).toContainElement(screen.getByTestId(id));
    }
    expect(getComputedStyle(bar).overflowX).not.toBe('auto');
    expect(getComputedStyle(bar).flexWrap).toBe('wrap');
    // The back link keeps its accessible name when only the icon is shown (< 600 px).
    expect(screen.getByTestId('session-back-to-game')).toHaveAccessibleName(
      i18n.t('rebellion.session:topBar.backToGameIcon'),
    );
  });

  it('SWR-004 handoff view on open → handoff screen without board, canvas, sidebar or debug data', async () => {
    renderTable({ [VIEW_PATH]: session(makeHandoffView({ activeSide: 'rebels', version: 7 })) });
    const screenEl = await screen.findByTestId('handoff-screen');
    expect(screenEl).toHaveAttribute('data-active-side', 'rebels');
    expect(screenEl).toHaveAttribute('data-version', '7');
    expect(screen.getByTestId('handoff-title')).toHaveTextContent(
      i18n.t('rebellion.session:handoff.title.rebels'),
    );
    expect(within(screenEl).getByTestId('session-back-to-game')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
    expect(within(screenEl).getByTestId('prototype-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('game-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-canvas')).not.toBeInTheDocument();
    expect(window.__boardDebug).toBeUndefined();
  });

  it('404 on a command → session detail refetched → SessionHost shows session-not-found', async () => {
    let gets = 0;
    const { user } = renderTable({
      [VIEW_PATH]: () =>
        gets++ === 0
          ? session()
          : {
              status: 404,
              body: {
                ok: false,
                error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' },
              },
            },
      [CMD_PATH]: {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' } },
      },
    });
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('advance-phase'));
    expect(await screen.findByTestId('session-not-found')).toBeInTheDocument();
    expect(gets).toBe(2);
  });
});

describe('Rebellion TableScreen — dispatch by rules engine (SWR-005 FE-0, plan-frontend §3.1)', () => {
  const CORE_VIEW_PATH = `GET /api/sessions/${CORE_SESSION_ID}`;

  function renderCore(routes: Record<string, MockHandler>) {
    const api = mockFetch(routes);
    const utils = renderWithProviders({ path: `/sessions/${CORE_SESSION_ID}` });
    return { ...utils, api };
  }

  it('core-v1 view → CoreTable: game-table[data-rules-engine=core-v1] with a heading, no legacy board', async () => {
    renderCore({ [CORE_VIEW_PATH]: { status: 200, body: makeCoreSession(makeCoreView()) } });
    const table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-rules-engine', 'core-v1');
    expect(table).toHaveAttribute('data-session-id', CORE_SESSION_ID);
    expect(table).toHaveAttribute('data-game-id', 'star-wars-rebellion');
    expect(table).toHaveAttribute('data-version', '2');
    expect(table).toHaveAttribute('data-phase', 'command');
    expect(table).toHaveAttribute('data-active-side', 'rebels');
    expect(within(table).getByRole('heading', { level: 1 })).toHaveTextContent(
      i18n.t('rebellion.session:page.title'),
    );
    expect(within(table).getByTestId('session-back-to-game')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
    // The core table is mounted (turn panel, core sidebar); nothing of the legacy mock board / top bar is.
    expect(within(table).getByTestId('turn-panel')).toBeInTheDocument();
    expect(within(table).getByTestId('core-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('advance-phase')).not.toBeInTheDocument();
    expect(screen.queryByTestId('end-turn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('round-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId(`piece-item-${P_R1}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId('table-invalid-view')).not.toBeInTheDocument();
  });

  it('a core view of the wrong shape (mock fields under core-v1) → table-invalid-view', async () => {
    renderCore({
      [CORE_VIEW_PATH]: {
        status: 200,
        body: { ...makeCoreSession(), view: { ...makeView(), rulesEngine: 'core-v1' } },
      },
    });
    expect(await screen.findByTestId('table-invalid-view')).toBeInTheDocument();
    expect(screen.queryByTestId('game-table')).not.toBeInTheDocument();
  });

  it('core-v1 handoff view → the unchanged handoff screen (no table)', async () => {
    renderCore({
      [CORE_VIEW_PATH]: {
        status: 200,
        body: makeCoreSession(makeCoreHandoffView({ activeSide: 'empire', version: 9 })),
      },
    });
    const handoff = await screen.findByTestId('handoff-screen');
    expect(handoff).toHaveAttribute('data-active-side', 'empire');
    expect(handoff).toHaveAttribute('data-version', '9');
    expect(screen.queryByTestId('game-table')).not.toBeInTheDocument();
  });

  it('a new viewer remounts the core table and a handoff in between focuses the new heading', async () => {
    const { queryClient } = renderCore({
      [CORE_VIEW_PATH]: { status: 200, body: makeCoreSession(makeCoreView()) },
    });
    const first = await screen.findByTestId('game-table');
    const setView = (view: PlayerViewCore | HandoffView) =>
      act(() => {
        queryClient.setQueryData(sessionKeys.detail(CORE_SESSION_ID), makeCoreSession(view));
      });
    // Same viewer, new version: same element (no remount).
    setView(makeCoreActivationView());
    await waitFor(() =>
      expect(screen.getByTestId('game-table')).toHaveAttribute('data-version', '3'),
    );
    expect(screen.getByTestId('game-table')).toBe(first);
    // Hot-seat: handoff, then the other side's table.
    setView(makeCoreHandoffView({ activeSide: 'empire', version: 4 }));
    await screen.findByTestId('handoff-screen');
    setView(makeCoreView({ viewer: 'empire', activeSide: 'empire', version: 5, legalActions: [] }));
    const second = await screen.findByTestId('game-table');
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute('data-active-side', 'empire');
    await waitFor(() =>
      expect(document.activeElement).toBe(within(second).getByRole('heading', { level: 1 })),
    );
  });
});
