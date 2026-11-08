import type { CommandEnvelope } from '@swr/contracts';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDragStore, useSelectionStore } from '@/features/game-board';
import {
  GAME_ID,
  makeMovedView,
  makeView,
  P_E1,
  P_R1,
  S_A,
  S_B,
} from '@/features/game-board/test/fixtures';
import { i18n } from '@/shared/i18n';
import { mockFetch, renderWithProviders, type MockHandler } from '@/shared/test';
import { GameTablePage } from './GameTablePage';

// Konva needs a real <canvas>; the canvas is covered by Playwright (plan-frontend §6.4).
vi.mock('@/features/game-board/canvas/BoardStage', () => ({
  BoardStage: () => <div data-testid="board-canvas" />,
}));

const VIEW_PATH = `GET /api/games/${GAME_ID}`;
const CMD_PATH = `POST /api/games/${GAME_ID}/commands`;

function renderTable(routes: Record<string, MockHandler>) {
  const api = mockFetch(routes);
  const utils = renderWithProviders({
    path: `/games/${GAME_ID}`,
    routePattern: '/games/:id',
    element: <GameTablePage />,
  });
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

describe('GameTablePage', () => {
  it('TC-WEB-11: renders server view with round/phase, mock badge and a mock-labelled End phase', async () => {
    renderTable({ [VIEW_PATH]: { status: 200, body: makeView() } });
    const table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-game-id', GAME_ID);
    expect(table).toHaveAttribute('data-version', '3');
    expect(screen.getByTestId('round-indicator')).toHaveTextContent('1');
    expect(screen.getByTestId('phase-indicator')).toHaveAttribute('data-phase', 'assignment');
    expect(screen.getByTestId('mock-badge')).toBeVisible();
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

  it('shows game-not-found on 404', async () => {
    renderTable({
      [VIEW_PATH]: {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' } },
      },
    });
    expect(await screen.findByTestId('game-not-found')).toBeInTheDocument();
  });

  it('TC-WEB-06 (component): selecting P_E1 offers only server targets and highlights them', async () => {
    const { user } = renderTable({ [VIEW_PATH]: { status: 200, body: makeView() } });
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
    const { user } = renderTable({ [VIEW_PATH]: { status: 200, body: makeView() } });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_R1);
    expect(screen.getByTestId('piece-panel')).toBeInTheDocument();
    expect(document.querySelectorAll(`[data-testid^="action-move-${P_R1}-"]`)).toHaveLength(0);
    expect(screen.getByTestId('action-panel')).toHaveTextContent(
      i18n.t('board:actions.enemyNoActions'),
    );
  });

  it('moves via the actions panel: envelope from cache, view from response, log + feedback + focus', async () => {
    const moved = makeMovedView();
    const { user, api } = renderTable({
      [VIEW_PATH]: { status: 200, body: makeView() },
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
    const text = i18n.t('board:move.success', {
      piece: i18n.t('gameData:pieces.unit.empire.capital-ship'),
      system: i18n.t('gameData:systems.sys-brevora'),
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
      [VIEW_PATH]: { status: 200, body: makeView() },
      [CMD_PATH]: {
        status: 422,
        body: { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' } },
      },
    });
    await screen.findByTestId('game-table');
    await selectPieceViaList(user, P_E1);
    await user.click(screen.getByTestId(`action-move-${P_E1}-${S_B}`));
    const reason = i18n.t('errors:notAdjacent');
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent(reason));
    expect(screen.getByTestId('feedback')).toHaveTextContent(reason);
    expect(screen.getByTestId(`piece-item-${P_E1}`)).toHaveAttribute('data-system-id', S_A);
    expect(screen.getByTestId('game-table')).toHaveAttribute('data-version', '3');
  });

  it('TC-WEB-09: 409 → "state updated" message, view refetched, selection kept', async () => {
    let gets = 0;
    const fresh = makeView({ version: 5 });
    const { user } = renderTable({
      [VIEW_PATH]: () => ({ status: 200, body: gets++ === 0 ? makeView() : fresh }),
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
      [VIEW_PATH]: { status: 200, body: makeView() },
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
      [VIEW_PATH]: { status: 200, body: makeView() },
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
    renderTable({ [VIEW_PATH]: { status: 200, body: makeView({ legalActions: [] }) } });
    await screen.findByTestId('game-table');
    expect(screen.getByTestId('advance-phase')).toBeDisabled();
  });

  it('listbox keyboard: arrows move focus, Enter selects; Esc clears the selection', async () => {
    const { user } = renderTable({ [VIEW_PATH]: { status: 200, body: makeView() } });
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
    const { user } = renderTable({ [VIEW_PATH]: { status: 200, body: makeView() } });
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('sidebar-tab-objects'));
    await user.click(screen.getByTestId(`system-item-${S_A}`));
    expect(screen.getByTestId('context-panel')).toHaveAttribute('data-state', 'system');
    expect(
      within(screen.getByTestId('context-panel')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent(i18n.t('gameData:systems.sys-aurelis'));
    expect(screen.getByTestId('system-panel')).toHaveTextContent(
      i18n.t('gameData:regions.reg-inner'),
    );
    expect(screen.getByTestId('system-panel')).toHaveTextContent(
      i18n.t('gameData:systems.sys-brevora'),
    );
    expect(screen.getByTestId(`action-move-all-${S_A}-${S_B}`)).toBeInTheDocument();
  });
});
