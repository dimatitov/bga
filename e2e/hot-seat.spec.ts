// SWR-004 hot-seat (spec "Hot-seat", plan-frontend §5.2–§5.3, plan-backend §4.2): TC-E2E-HS-01..HS-05 — AC-14, AC-13.
// Leaks are checked on server responses (browser-qa §4); the DOM is checked for "no map / no panels".
// OQ-1: on the handoff screen focus goes to `handoff-title`, not to the accept button.
import { expect, test, type Page } from '@playwright/test';
import {
  acceptHandoff,
  asHandoff,
  asPlayer,
  boardIdsOf,
  createSession,
  endTurn,
  EMPIRE_VS_AI,
  expectHandoffOnly,
  getSession,
  moveActions,
  piece,
  postCommand,
  REBELS_VS_HUMAN,
  type CommandResponse,
  type ErrorBody,
  type PlayerView,
  type SessionResponse,
} from './support/api';
import {
  dbg,
  openSession,
  recordApi,
  sessionPath,
  waitForCommand,
  waitForTable,
  waitViewportStable,
} from './support/board';
import { T } from './support/testids';

declare global {
  interface Window {
    __sawBoardCanvas?: boolean;
  }
}

/** Board UI that must not exist while the handoff screen is shown. */
const BOARD_UI = [
  T.boardCanvas,
  T.contextPanel,
  T.eventLog,
  T.boardList,
  T.endTurn,
  T.advancePhase,
];

async function expectHandoffScreen(page: Page, activeSide: 'rebels' | 'empire'): Promise<void> {
  const screen = page.getByTestId(T.handoffScreen);
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute('data-active-side', activeSide);
  await expect(page.getByTestId(T.handoffTitle)).toBeVisible();
  await expect(page.getByTestId(T.handoffAccept)).toBeVisible();
  await expect(page.getByTestId(T.handoffAccept)).toBeEnabled();
  for (const id of BOARD_UI) await expect(page.getByTestId(id), `${id} hidden`).toHaveCount(0);
  // TR-10 / plan-frontend §5.3: the debug hook is removed (undefined), not an object with empty data.
  expect(await page.evaluate(() => window.__boardDebug === undefined)).toBe(true);
}

/** Clicks a piece on the canvas (via `__boardDebug` coordinates) and waits until it is selected. */
async function selectPiece(page: Page, pieceId: string) {
  const pos = await dbg.piecePos(page, pieceId);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: pieceId });
}

const errorKey = async (res: { json(): Promise<unknown> }) =>
  ((await res.json()) as ErrorBody).error;

test.describe('SWR-004 hot-seat', () => {
  test('TC-E2E-HS-01: "Pass the turn" → handoff screen without map, panels, log; responses carry no board data', async ({
    page,
    request,
  }) => {
    const { sessionId, view, settings } = await createSession(request, REBELS_VS_HUMAN);
    const boardIds = boardIdsOf(view);
    await openSession(page, sessionId);
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'rebels');
    const recorder = recordApi(page);

    const cmd = waitForCommand(page);
    await page.getByTestId(T.endTurn).click();
    const res = await cmd;
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toEqual({
      actor: 'rebels',
      expectedVersion: view.version,
      command: { type: 'END_TURN' },
    });
    const body = (await res.json()) as CommandResponse;
    expectHandoffOnly(body, boardIds, 'END_TURN response');
    const handoff = asHandoff(body.view);
    expect(handoff).toMatchObject({
      activeSide: 'empire',
      version: view.version + 1,
      round: view.round,
      phase: view.phase, // END_TURN does not change the phase (Q-10)
      sessionStatus: 'prototype',
    });

    await expectHandoffScreen(page, 'empire');
    await expect(page.getByTestId(T.handoffTitle)).toBeFocused(); // OQ-1
    await expect(page.getByTestId(T.handoffAccept)).not.toBeFocused();
    await expect(page.getByTestId(T.handoffScreen)).toHaveAttribute(
      'data-version',
      String(handoff.version),
    );
    await expect(page.getByTestId(T.prototypeBadge)).toBeVisible(); // same badge on the handoff screen

    // The server keeps answering with the handoff view (Q-24: public settings are allowed).
    const getRes = await page.request.get(`/api/sessions/${sessionId}`);
    const got = (await getRes.json()) as SessionResponse;
    expectHandoffOnly(got, boardIds, 'GET /api/sessions/:id');
    expect(got.settings).toEqual(settings);
    // TC-I-27: a viewer query parameter is ignored.
    const spoof = await page.request.get(`/api/sessions/${sessionId}?viewer=rebels`);
    expectHandoffOnly(await spoof.json(), boardIds, 'GET ?viewer=rebels');

    // Every response for this session after END_TURN (command, refetch, lists) stays board-free.
    await page.waitForTimeout(500);
    await recorder.settle();
    for (const c of recorder.calls.filter((x) => x.url.includes(sessionId))) {
      expectHandoffOnly(c.body, boardIds, `${c.method} ${c.url}`);
    }
  });

  test('TC-E2E-HS-02: reload during the handoff shows the handoff screen again; the map never renders', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    const handoff = await endTurn(request, sessionId, view);
    const boardIds = boardIdsOf(view);

    await page.addInitScript((canvasId) => {
      window.__sawBoardCanvas = false;
      const check = () => {
        if (document.querySelector(`[data-testid="${canvasId}"]`)) window.__sawBoardCanvas = true;
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true });
    }, T.boardCanvas);
    const recorder = recordApi(page);

    await page.goto(sessionPath(sessionId));
    await expectHandoffScreen(page, handoff.activeSide);
    await page.reload();
    await expectHandoffScreen(page, handoff.activeSide);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__sawBoardCanvas)).toBe(false);

    await recorder.settle();
    const sessionCalls = recorder.calls.filter((c) => c.url.includes(sessionId));
    expect(sessionCalls.length).toBeGreaterThan(0);
    for (const c of sessionCalls) expectHandoffOnly(c.body, boardIds, `${c.method} ${c.url}`);
  });

  test('TC-E2E-HS-03: "I am the Empire" → Empire table (own secrets only), selection/zoom reset; full cycle back', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    await openSession(page, sessionId);
    const fitScale = (await dbg.viewport(page)).scale;

    // Player A leaves a selection and a zoom behind.
    const own = moveActions(view)[0];
    expect(own, 'Rebels have a move').toBeDefined();
    await selectPiece(page, own!.pieceId);
    await page.getByTestId(T.zoomIn).click();
    await waitViewportStable(page);
    expect((await dbg.viewport(page)).scale).toBeGreaterThan(fitScale);

    let cmd = waitForCommand(page);
    await page.getByTestId(T.endTurn).click();
    const handoff = asHandoff(((await (await cmd).json()) as CommandResponse).view);
    await expectHandoffScreen(page, 'empire');

    cmd = waitForCommand(page);
    await page.getByTestId(T.handoffAccept).click();
    const acc = await cmd;
    expect(acc.status()).toBe(200);
    expect(acc.request().postDataJSON()).toEqual({
      actor: 'empire',
      expectedVersion: handoff.version,
      command: { type: 'ACCEPT_HANDOFF' },
    });
    const empireView = asPlayer(((await acc.json()) as CommandResponse).view);
    expect(empireView.viewer).toBe('empire');
    expect(empireView.activeSide).toBe('empire');
    expect(empireView.rebelBase.systemId, 'Rebel base hidden from the Empire').toBeNull();
    for (const p of empireView.pieces.filter((x) => x.owner === 'rebels' && x.hidden)) {
      expect(p.typeKey, `hidden Rebel piece ${p.id}`).toBe('unknown');
    }
    const moves = moveActions(empireView);
    expect(moves.length).toBeGreaterThan(0);
    for (const a of moves) expect(piece(empireView, a.pieceId).owner).toBe('empire');

    await waitForTable(page, sessionId);
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'empire');
    // The previous player's selection and zoom are gone (plan-frontend §5.3 step 2).
    expect(await dbg.selection(page)).toEqual({ kind: null, id: null });
    const scaleAfter = (await dbg.viewport(page)).scale;
    expect(Math.abs(scaleAfter - fitScale) / fitScale, 'zoom reset to fit').toBeLessThan(0.05);

    // Empire passes the turn back → "…Rebels player" → Rebels table.
    cmd = waitForCommand(page);
    await page.getByTestId(T.endTurn).click();
    expect((await cmd).status()).toBe(200);
    await expectHandoffScreen(page, 'rebels');
    cmd = waitForCommand(page);
    await page.getByTestId(T.handoffAccept).click();
    const back = asPlayer(((await (await cmd).json()) as CommandResponse).view);
    expect(back.viewer).toBe('rebels');
    expect(back.rebelBase.systemId).not.toBeNull();
    await waitForTable(page, sessionId);
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'rebels');
    expect(back.version).toBe(view.version + 4);
  });

  test('TC-E2E-HS-04: commands of the inactive side and board commands during the handoff are rejected (422)', async ({
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    const handoff = await endTurn(request, sessionId, view);
    const empirePiece = view.pieces.find((p) => p.owner === 'empire')!;
    const anyOtherSystem = view.systems.find((s) => s.id !== empirePiece.systemId)!;

    const during = [
      {
        actor: 'empire' as const,
        command: {
          type: 'MOVE_PIECES' as const,
          pieceIds: [empirePiece.id],
          fromSystemId: empirePiece.systemId,
          toSystemId: anyOtherSystem.id,
        },
        key: 'errors.handoffPending',
      },
      {
        actor: 'empire' as const,
        command: { type: 'ADVANCE_PHASE' as const },
        key: 'errors.handoffPending',
      },
      {
        actor: 'empire' as const,
        command: { type: 'END_TURN' as const },
        key: 'errors.handoffPending',
      },
      {
        actor: 'rebels' as const,
        command: { type: 'ACCEPT_HANDOFF' as const },
        key: 'errors.notYourTurn',
      },
    ];
    for (const c of during) {
      const res = await postCommand(request, sessionId, handoff, c.command, c.actor);
      expect(res.status(), `${c.actor} ${c.command.type} during handoff`).toBe(422);
      expect(await errorKey(res)).toMatchObject({ code: 'ILLEGAL_COMMAND', messageKey: c.key });
    }
    const still = await getSession(request, sessionId);
    expect(asHandoff(still.view).version, 'version unchanged').toBe(handoff.version);

    // After the Empire accepts, the Rebels (inactive) cannot act.
    const empireView: PlayerView = await acceptHandoff(request, sessionId, handoff);
    const rebelMove = moveActions(view)[0]!;
    const res = await postCommand(
      request,
      sessionId,
      empireView,
      {
        type: 'MOVE_PIECES',
        pieceIds: [rebelMove.pieceId],
        fromSystemId: piece(view, rebelMove.pieceId).systemId,
        toSystemId: rebelMove.toSystemIds[0]!,
      },
      'rebels',
    );
    expect(res.status()).toBe(422);
    expect(await errorKey(res)).toMatchObject({
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.notYourTurn',
    });
    const after = asPlayer((await getSession(request, sessionId)).view);
    expect(after.version).toBe(empireView.version);
    expect(after.viewer).toBe('empire');
  });

  test('TC-E2E-HS-05: AI game has no "pass the turn"; END_TURN / ACCEPT_HANDOFF → 422 handoffNotAvailable', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, EMPIRE_VS_AI);
    expect(view.legalActions.some((a) => a.type === 'END_TURN')).toBe(false);
    await openSession(page, sessionId);
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'empire');
    await expect(page.getByTestId(T.endTurn)).toHaveCount(0);
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);

    for (const type of ['END_TURN', 'ACCEPT_HANDOFF'] as const) {
      const res = await postCommand(request, sessionId, view, { type });
      expect(res.status(), type).toBe(422);
      expect(await errorKey(res)).toMatchObject({
        code: 'ILLEGAL_COMMAND',
        messageKey: 'errors.handoffNotAvailable',
      });
    }
    const after = asPlayer((await getSession(request, sessionId)).view);
    expect(after.version).toBe(view.version);
    await page.reload();
    await waitForTable(page, sessionId);
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
  });
});
