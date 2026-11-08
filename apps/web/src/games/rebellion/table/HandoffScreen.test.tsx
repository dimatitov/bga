import type { PlayerView, PlayerViewMock } from '@bga/game-rebellion/schema';
import { screen, waitFor, within } from '@testing-library/react';
import { useMemo, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEnvelope } from '@/platform';
import { sessionKeys } from '@/platform';
import { i18n } from '@/shared/i18n';
import { mockFetch, renderWithProviders, type MockHandler } from '@/shared/test';
import { useBoard, useDragStore, useSelectionStore, useViewportStore } from '../board';
import { computeBoardLayout } from '../board/model/boardLayout';
import { useBoardDebug } from '../board/hooks/useBoardDebug';
import {
  makeHandoffView,
  makeRebellionSession,
  makeView,
  P_R1,
  SESSION_ID,
} from '../test/fixtures';

/**
 * Konva needs a real <canvas> (covered by Playwright). The stand-in keeps what matters for the handoff: it activates
 * the viewport for the session, installs the real `window.__boardDebug` hook (TR-10) and lets a test zoom in.
 */
vi.mock('../board/canvas/BoardStage', () => ({
  BoardStage: function FakeBoardStage() {
    const { gameId, view } = useBoard();
    const stage = useRef(null);
    const layout = useMemo(() => computeBoardLayout(view), [view]);
    useViewportStore.getState().activateGame(gameId);
    useBoardDebug(stage, layout);
    return <div data-testid="board-canvas" />;
  },
}));

const VIEW_PATH = `GET /api/sessions/${SESSION_ID}`;
const CMD_PATH = `POST /api/sessions/${SESSION_ID}/commands`;

const HUMAN_SETTINGS = {
  playerFaction: 'rebels',
  opponentFaction: 'empire',
  opponentType: 'human',
  aiDifficulty: null,
  ruleset: 'base',
  gameMode: 'digital',
} as const;

/** Rebels' table of a human game (Rebels vs second player), `END_TURN` legal. */
function rebelsView(overrides: Partial<PlayerViewMock> = {}): PlayerViewMock {
  const base = makeView();
  return makeView({
    viewer: 'rebels',
    activeSide: 'rebels',
    settings: { ...HUMAN_SETTINGS },
    legalActions: [
      { type: 'MOVE_PIECES', pieceId: P_R1, toSystemIds: [base.systems[1]!.id] },
      { type: 'END_TURN' },
    ],
    ...overrides,
  });
}

function empireView(): PlayerViewMock {
  return makeView({
    viewer: 'empire',
    activeSide: 'empire',
    version: 6,
    settings: { ...HUMAN_SETTINGS },
    legalActions: [{ type: 'END_TURN' }],
  });
}

const envelope = (view: PlayerView) => ({
  status: 200,
  body: makeRebellionSession(view, { settings: { ...HUMAN_SETTINGS } }),
});

function renderTable(routes: Record<string, MockHandler>) {
  const api = mockFetch(routes);
  const utils = renderWithProviders({ path: `/sessions/${SESSION_ID}` });
  return { ...utils, api };
}

const posts = (api: ReturnType<typeof renderTable>['api']) =>
  api.requests.filter((r) => r.method === 'POST').map((r) => r.body);

beforeEach(() => {
  useSelectionStore.setState({ gameId: null, selection: { kind: 'none' }, sidebarTab: 'log' });
  useDragStore.getState().clear();
  useViewportStore.setState({ gameId: null, byGame: {}, bounds: null });
  delete window.__boardDebug;
});

describe('Rebellion hot-seat HandoffScreen (SWR-004 plan-frontend §5.3)', () => {
  it('TC-C-17 + TC-C-20: "Pass the turn" → handoff screen; cache, stores and __boardDebug hold nothing of the table', async () => {
    const handoff = makeHandoffView({
      activeSide: 'empire',
      version: 5,
      round: 2,
      phase: 'command',
    });
    const { user, api, queryClient } = renderTable({
      [VIEW_PATH]: envelope(rebelsView()),
      [CMD_PATH]: { status: 200, body: { ok: true, view: handoff, events: [] } },
    });
    await screen.findByTestId('game-table');
    expect(screen.getByTestId('active-side')).toHaveAttribute('data-side', 'rebels');
    expect(screen.getByTestId('active-side')).toHaveTextContent(
      i18n.t('rebellion.session:topBar.turn'),
    );
    await waitFor(() => expect(window.__boardDebug).toBeDefined());

    // Player A leaves a selection, a pending drag and a zoom behind.
    useSelectionStore.getState().selectPiece(P_R1);
    useDragStore.getState().start(P_R1, 'sys-dovmaren');
    useViewportStore.getState().setViewport({ scale: 2, x: 10, y: 20 });
    expect(useViewportStore.getState().byGame[SESSION_ID]).toBeDefined();

    await user.click(screen.getByTestId('end-turn'));
    const screenEl = await screen.findByTestId('handoff-screen');

    expect(posts(api)).toEqual([
      { actor: 'rebels', expectedVersion: 3, command: { type: 'END_TURN' } },
    ]);
    // The cache holds the handoff view only — the player view was replaced, not merged.
    const cached = queryClient.getQueryData<SessionEnvelope>(sessionKeys.detail(SESSION_ID));
    expect(cached?.view).toEqual(handoff);
    for (const key of ['systems', 'pieces', 'log', 'legalActions', 'rebelBase', 'settings']) {
      expect(cached?.view as Record<string, unknown>).not.toHaveProperty(key);
    }
    // No board UI in the DOM.
    for (const id of [
      'game-table',
      'board-canvas',
      'context-panel',
      'event-log',
      'board-list',
      'end-turn',
    ]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    expect(window.__boardDebug).toBeUndefined();
    // Stores wiped (plan-frontend §5.3 step 2).
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
    expect(useSelectionStore.getState().gameId).toBeNull();
    expect(useDragStore.getState().drag).toBeNull();
    expect(useViewportStore.getState().byGame[SESSION_ID]).toBeUndefined();

    expect(screenEl).toHaveAttribute('data-active-side', 'empire');
    expect(screenEl).toHaveAttribute('data-version', '5');
    expect(screenEl).toHaveAttribute('data-round', '2');
    const title = screen.getByTestId('handoff-title');
    expect(title).toHaveTextContent(i18n.t('rebellion.session:handoff.title.empire'));
    expect(screen.getByRole('heading', { level: 1 })).toBe(title);
    expect(screen.getByTestId('handoff-accept')).toHaveTextContent(
      i18n.t('rebellion.session:handoff.accept.empire'),
    );
    expect(screen.getByTestId('handoff-accept')).toHaveAttribute('aria-busy', 'false');
    expect(within(screenEl).getByTestId('prototype-badge')).toHaveAttribute(
      'data-status',
      'prototype',
    );
    expect(screenEl).toHaveTextContent(i18n.t('rebellion.session:handoff.trustNote'));
    // OQ-1 / D-SW4-21: focus on the heading, not on the button; the first Tab reaches the button.
    await waitFor(() => expect(title).toHaveFocus());
    await user.tab();
    expect(screen.getByTestId('handoff-accept')).toHaveFocus();
  });

  it('TC-C-18: "I am the Empire" → ACCEPT_HANDOFF (actor = activeSide, version of the handoff view) → Empire table, fresh state', async () => {
    const handoff = makeHandoffView({ activeSide: 'empire', version: 5 });
    const { user, api } = renderTable({
      [VIEW_PATH]: envelope(handoff),
      [CMD_PATH]: { status: 200, body: { ok: true, view: empireView(), events: [] } },
    });
    // Stale state of a previous table in this browser tab.
    useSelectionStore.setState({ gameId: SESSION_ID, selection: { kind: 'piece', pieceId: P_R1 } });
    useViewportStore.setState({ byGame: { [SESSION_ID]: { scale: 3, x: 1, y: 2 } } });

    await screen.findByTestId('handoff-screen');
    expect(useViewportStore.getState().byGame[SESSION_ID]).toBeUndefined();
    await user.click(screen.getByTestId('handoff-accept'));

    const table = await screen.findByTestId('game-table');
    expect(posts(api)).toEqual([
      { actor: 'empire', expectedVersion: 5, command: { type: 'ACCEPT_HANDOFF' } },
    ]);
    expect(table).toHaveAttribute('data-version', '6');
    expect(screen.queryByTestId('handoff-screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('active-side')).toHaveAttribute('data-side', 'empire');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
    expect(useDragStore.getState().drag).toBeNull();
    // Viewport restarts from scratch (BoardStage fits once bounds are known), not the remembered zoom.
    expect(useViewportStore.getState().viewport.scale).not.toBe(3);
    await waitFor(() =>
      expect(window.__boardDebug?.getSelection()).toEqual({ kind: null, id: null }),
    );
    // The new side starts on the table heading.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: i18n.t('rebellion.session:page.title') }),
      ).toHaveFocus(),
    );
  });

  it('TC-C-18: 422 notYourTurn → handoff-error (role=alert), the button is enabled again', async () => {
    const { user } = renderTable({
      [VIEW_PATH]: envelope(makeHandoffView({ activeSide: 'empire' })),
      [CMD_PATH]: {
        status: 422,
        body: { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notYourTurn' } },
      },
    });
    await screen.findByTestId('handoff-screen');
    await user.click(screen.getByTestId('handoff-accept'));
    const alert = await screen.findByTestId('handoff-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(i18n.t('rebellion.errors:notYourTurn'));
    expect(screen.getByTestId('handoff-accept')).toBeEnabled();
    expect(screen.getByTestId('handoff-screen')).toBeInTheDocument();
  });

  it('pending accept: button disabled with aria-busy; a network failure shows the network error', async () => {
    let release: (reply: 'network') => void = () => {};
    const { user } = renderTable({
      [VIEW_PATH]: envelope(makeHandoffView({ activeSide: 'rebels' })),
      [CMD_PATH]: () =>
        new Promise<'network'>((resolve) => {
          release = resolve;
        }),
    });
    await screen.findByTestId('handoff-screen');
    expect(screen.getByTestId('handoff-accept')).toHaveTextContent(
      i18n.t('rebellion.session:handoff.accept.rebels'),
    );
    await user.click(screen.getByTestId('handoff-accept'));
    await waitFor(() =>
      expect(screen.getByTestId('handoff-accept')).toHaveAttribute('aria-busy', 'true'),
    );
    expect(screen.getByTestId('handoff-accept')).toBeDisabled();
    release('network');
    expect(await screen.findByTestId('handoff-error')).toHaveTextContent(i18n.t('errors:network'));
    expect(screen.getByTestId('handoff-accept')).toHaveAttribute('aria-busy', 'false');
  });

  it('handoff-specific errors are translated (handoffPending, handoffNotAvailable)', () => {
    for (const name of ['notYourTurn', 'handoffPending', 'handoffNotAvailable']) {
      const text = i18n.t(`rebellion.errors:${name}`);
      expect(text).not.toBe(name);
      expect(text).not.toContain('errors');
    }
  });
});
