// Hot-seat. SWR-005: rewritten on core-v1 (Q-1) — the turn changes automatically after FINISH_ACTIVATION / PASS
// (spec Hot-seat, R-3, R-6), TC-E-05 (scenario 3, AC-09) + the SWR-004 cases TC-E2E-HS-01..HS-05 on core-v1.
// Mock behaviour (END_TURN → handoff → ACCEPT_HANDOFF) stays covered on a SEEDED legacy row (frozen v2
// «Rebels vs second player, handoff to the Empire pending»), TC-E2E-HS-M1/M2.
// Leaks are checked on server responses (browser-qa §4); the DOM is checked for "no map / no panels".
// OQ-1: on the handoff screen focus goes to `handoff-title`, not to the accept button.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  asCore,
  asHandoff,
  asPlayer,
  boardIdsOf,
  commandOk,
  createSession,
  EMPIRE_VS_AI,
  endTurn,
  expectHandoffOnly,
  expectRejected,
  getSession,
  planActivation,
  REBELS_VS_HUMAN,
  type CorePlayerView,
  type HandoffView,
  type SessionResponse,
} from './support/api';
import {
  dbg,
  openCore,
  openSidebarTab,
  recordApi,
  sessionPath,
  waitForTable,
  waitViewportStable,
} from './support/board';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  expectTurn,
  finishViaUi,
  nextCommand,
} from './support/core';
import { seedLegacyV2 } from './support/seed';
import { T } from './support/testids';

declare global {
  interface Window {
    __sawBoardCanvas?: boolean;
  }
}

test.use({ reducedMotion: 'reduce' });

/** Board UI that must not exist while the handoff screen is shown (both engines). */
const BOARD_UI = [
  T.boardCanvas,
  T.contextPanel,
  T.coreContextPanel,
  T.eventLog,
  T.boardList,
  T.endTurn,
  T.advancePhase,
  T.turnPanel,
  T.leaderPool,
  T.finishActivation,
  T.passTurn,
  T.hiddenBaseZone,
  T.coreMapState,
];

/** Ids of all systems, units and leaders of a core view (for leak checks of handoff responses). */
const coreBoardIds = (view: CorePlayerView): string[] => [
  ...view.map.systems.map((s) => s.id),
  ...view.units.map((u) => u.id),
  ...view.leaders.map((l) => l.id),
];

async function expectHandoffScreen(page: Page, activeSide: 'rebels' | 'empire'): Promise<void> {
  const screen = page.getByTestId(T.handoffScreen);
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute('data-active-side', activeSide);
  await expect(page.getByTestId(T.handoffTitle)).toBeVisible();
  await expect(page.getByTestId(T.handoffAccept)).toBeVisible();
  await expect(page.getByTestId(T.handoffAccept)).toBeEnabled();
  for (const id of BOARD_UI) await expect(page.getByTestId(id), `${id} hidden`).toHaveCount(0);
  // TR-10 / plan-frontend §9: the debug hook is removed (undefined), not an object with empty data.
  expect(await page.evaluate(() => window.__boardDebug === undefined)).toBe(true);
}

/** Rebels (hot-seat) activate + finish through the API → handoff to the Empire. */
async function rebelsActivateAndFinish(
  request: APIRequestContext,
  sessionId: string,
  view: CorePlayerView,
): Promise<HandoffView> {
  const plan = planActivation(view, [view.rebelBase.systemId!]);
  const act = asCore(
    (
      await commandOk(request, sessionId, view, {
        type: 'ACTIVATE_SYSTEM',
        leaderId: plan.leaderId,
        systemId: plan.systemId,
      })
    ).view,
  );
  return asHandoff((await commandOk(request, sessionId, act, { type: 'FINISH_ACTIVATION' })).view);
}

test.describe('SWR-005 hot-seat (core-v1)', () => {
  test('TC-E-05 (scenario 3): finish → handoff → «I am the Empire» → Empire passes → handoff → «I am the Rebels» → Rebels move again without a handoff', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    expect(view.legalActions.map((a) => a.type)).not.toContain('END_TURN');
    await openCore(page, sessionId);
    await expect(page.getByTestId(T.endTurn)).toHaveCount(0);

    // Rebels: activation + finish → the turn passes to the Empire automatically → handoff screen.
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    await armLeader(page, plan.leaderId);
    await commandViaUi(page, () => clickSystem(page, plan.systemId));
    const fin = await nextCommand(page, () => page.getByTestId(T.finishActivation).click());
    expect(fin.res.status()).toBe(200);
    const h1 = asHandoff(fin.body.view);
    expect(h1).toMatchObject({
      activeSide: 'empire',
      rulesEngine: 'core-v1',
      sessionStatus: 'prototype',
    });
    await expectHandoffScreen(page, 'empire');
    await expect(page.getByTestId(T.handoffTitle)).toBeFocused();

    // «I am the Empire» → the Empire's own view (base hidden, zone shown).
    const acc = await nextCommand(page, () => page.getByTestId(T.handoffAccept).click());
    expect(acc.res.status()).toBe(200);
    const emp = asCore(acc.body.view);
    expect(emp.viewer).toBe('empire');
    expect(emp.rebelBase.systemId).toBeNull();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expectTurn(page, 'empire');
    await expect(page.getByTestId(T.hiddenBaseZone)).toHaveCount(1);
    expect(await dbg.rebelBase(page)).toBeNull();

    // Empire passes (dialog: leaders left) → handoff to the Rebels.
    await page.getByTestId(T.passTurn).click();
    await expect(page.getByTestId(T.passConfirm)).toBeVisible();
    const passed = await nextCommand(page, () => page.getByTestId(T.passConfirmOk).click());
    expect(passed.res.status()).toBe(200);
    expect(asHandoff(passed.body.view).activeSide).toBe('rebels');
    await expectHandoffScreen(page, 'rebels');
    const acc2 = await nextCommand(page, () => page.getByTestId(T.handoffAccept).click());
    const reb = asCore(acc2.body.view);
    expect(reb.viewer).toBe('rebels');
    expect(reb.passed).toEqual({ rebels: false, empire: true });
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expectTurn(page, 'rebels');

    // The Empire has passed for the phase → the Rebels move again in a row, no handoff in between.
    const plan2 = planActivation(reb, [reb.rebelBase.systemId!]);
    await armLeader(page, plan2.leaderId);
    await commandViaUi(page, () => clickSystem(page, plan2.systemId));
    const fin2 = await finishViaUi(page);
    expect(fin2.view.kind).toBe('player');
    expect(fin2.view.activeSide).toBe('rebels');
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
    await expectTurn(page, 'rebels');
  });

  test('TC-E2E-HS-01 (core-v1): finish activation → handoff screen without map, panels, log; responses carry no board data', async ({
    page,
    request,
  }) => {
    const { sessionId, view, settings } = await createSession(request, REBELS_VS_HUMAN);
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    const act = asCore(
      (
        await commandOk(request, sessionId, view, {
          type: 'ACTIVATE_SYSTEM',
          leaderId: plan.leaderId,
          systemId: plan.systemId,
        })
      ).view,
    );
    const boardIds = coreBoardIds(view);
    await openCore(page, sessionId);
    const recorder = recordApi(page);

    const fin = await nextCommand(page, () => page.getByTestId(T.finishActivation).click());
    expect(fin.res.status()).toBe(200);
    expect(fin.res.request().postDataJSON()).toEqual({
      actor: 'rebels',
      expectedVersion: act.version,
      command: { type: 'FINISH_ACTIVATION' },
    });
    expectHandoffOnly(fin.body, boardIds, 'FINISH_ACTIVATION response');
    const handoff = asHandoff(fin.body.view);
    expect(handoff).toMatchObject({
      activeSide: 'empire',
      version: act.version + 1,
      round: 1,
      phase: 'command',
      sessionStatus: 'prototype',
      rulesEngine: 'core-v1',
    });
    await expectHandoffScreen(page, 'empire');
    await expect(page.getByTestId(T.handoffTitle)).toBeFocused(); // OQ-1
    await expect(page.getByTestId(T.handoffAccept)).not.toBeFocused();
    await expect(page.getByTestId(T.handoffScreen)).toHaveAttribute(
      'data-version',
      String(handoff.version),
    );
    await expect(page.getByTestId(T.prototypeBadge)).toBeVisible();

    const got = (await (
      await page.request.get(`/api/sessions/${sessionId}`)
    ).json()) as SessionResponse;
    expectHandoffOnly(got, boardIds, 'GET /api/sessions/:id');
    expect(got.settings).toEqual(settings);
    const spoof = await page.request.get(`/api/sessions/${sessionId}?viewer=rebels`);
    expectHandoffOnly(await spoof.json(), boardIds, 'GET ?viewer=rebels');

    await page.waitForTimeout(500);
    await recorder.settle();
    for (const c of recorder.calls.filter((x) => x.url.includes(sessionId))) {
      expectHandoffOnly(c.body, boardIds, `${c.method} ${c.url}`);
    }
  });

  test('TC-E2E-HS-02 (core-v1): reload during the handoff shows the handoff screen again; the map never renders', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    const handoff = await rebelsActivateAndFinish(request, sessionId, view);
    const boardIds = coreBoardIds(view);
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

  test('TC-E2E-HS-03 (core-v1): «I am the Empire» → Empire table (own secrets only), selection / armed leader / zoom reset; cycle back', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    await openCore(page, sessionId);
    const fitScale = (await dbg.viewport(page)).scale;

    // Player A leaves a selection and a zoom behind, then finishes an activation.
    await armLeader(page, plan.leaderId);
    await commandViaUi(page, () => clickSystem(page, plan.systemId));
    await openSidebarTab(page, 'objects');
    await page.getByTestId(T.systemItem(plan.fromSystemId)).click();
    await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'system', id: plan.fromSystemId });
    await page.getByTestId(T.zoomIn).click();
    await waitViewportStable(page);
    expect((await dbg.viewport(page)).scale).toBeGreaterThan(fitScale);
    const fin = await nextCommand(page, () => page.getByTestId(T.finishActivation).click());
    const handoff = asHandoff(fin.body.view);
    await expectHandoffScreen(page, 'empire');

    const acc = await nextCommand(page, () => page.getByTestId(T.handoffAccept).click());
    expect(acc.res.status()).toBe(200);
    expect(acc.res.request().postDataJSON()).toEqual({
      actor: 'empire',
      expectedVersion: handoff.version,
      command: { type: 'ACCEPT_HANDOFF' },
    });
    const emp = asCore(acc.body.view);
    expect(emp.viewer).toBe('empire');
    expect(emp.activeSide).toBe('empire');
    expect(emp.rebelBase.systemId, 'Rebel base hidden from the Empire').toBeNull();
    expect(emp.units.filter((u) => u.location.kind === 'rebelBase').length).toBeGreaterThan(0);
    const activate = emp.legalActions.find((a) => a.type === 'ACTIVATE_SYSTEM');
    expect(activate && 'leaderIds' in activate ? activate.leaderIds : []).toEqual(
      expect.arrayContaining(['vader']),
    );

    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
    await expectTurn(page, 'empire');
    expect(await dbg.selection(page)).toEqual({ kind: null, id: null });
    expect(await dbg.armedLeader(page)).toBeNull();
    // Reset = the Empire's own «fit» (its content bounds include the hidden zone, so the scale differs from the
    // Rebels' fit): pressing «fit» now must not change the viewport.
    await waitViewportStable(page);
    const vAfter = await dbg.viewport(page);
    await page.getByTestId(T.zoomFit).click();
    await waitViewportStable(page);
    const vFit = await dbg.viewport(page);
    expect(Math.abs(vAfter.scale - vFit.scale) / vFit.scale, 'zoom reset to fit').toBeLessThan(
      0.05,
    );
    expect(Math.abs(vAfter.x - vFit.x)).toBeLessThan(3);
    expect(Math.abs(vAfter.y - vFit.y)).toBeLessThan(3);

    // Empire passes → «… Rebels» → Rebels table with their base visible again.
    await page.getByTestId(T.passTurn).click();
    const passed = await nextCommand(page, () => page.getByTestId(T.passConfirmOk).click());
    expect(passed.res.status()).toBe(200);
    expect(asHandoff(passed.body.view).activeSide).toBe('rebels');
    await expectHandoffScreen(page, 'rebels');
    const back = await nextCommand(page, () => page.getByTestId(T.handoffAccept).click());
    const reb = asCore(back.body.view);
    expect(reb.viewer).toBe('rebels');
    expect(reb.rebelBase.systemId).not.toBeNull();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expectTurn(page, 'rebels');
  });

  test('TC-E2E-HS-04 (core-v1): commands of the inactive side and board commands during the handoff are rejected (422)', async ({
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_HUMAN);
    const handoff = await rebelsActivateAndFinish(request, sessionId, view);
    const anySystem = view.map.systems[0]!.id;

    await expectRejected(request, sessionId, handoff, { type: 'PASS' }, 'handoffPending', 'empire');
    await expectRejected(
      request,
      sessionId,
      handoff,
      { type: 'ACTIVATE_SYSTEM', leaderId: 'vader', systemId: anySystem },
      'handoffPending',
      'empire',
    );
    await expectRejected(
      request,
      sessionId,
      handoff,
      { type: 'ACCEPT_HANDOFF' },
      'notYourTurn',
      'rebels',
    );
    const still = await getSession(request, sessionId);
    expect(asHandoff(still.view).version, 'version unchanged').toBe(handoff.version);

    // After the Empire accepts, the Rebels (inactive) cannot act.
    const emp = asCore(
      (await commandOk(request, sessionId, handoff, { type: 'ACCEPT_HANDOFF' })).view,
    );
    await expectRejected(request, sessionId, emp, { type: 'PASS' }, 'notYourTurn', 'rebels');
    await expectRejected(
      request,
      sessionId,
      emp,
      { type: 'ACTIVATE_SYSTEM', leaderId: 'dodonna', systemId: anySystem },
      'notYourTurn',
      'rebels',
    );
    const after = asCore((await getSession(request, sessionId)).view);
    expect(after.version).toBe(emp.version);
    expect(after.viewer).toBe('empire');
  });

  test('TC-E2E-HS-05 (core-v1): AI game has no handoff — END_TURN → 422 commandUnavailable, ACCEPT_HANDOFF → 422 handoffNotAvailable', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, EMPIRE_VS_AI);
    await openCore(page, sessionId);
    await expectTurn(page, 'empire');
    await expect(page.getByTestId(T.endTurn)).toHaveCount(0);
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
    await expectRejected(request, sessionId, view, { type: 'END_TURN' }, 'commandUnavailable');
    await expectRejected(
      request,
      sessionId,
      view,
      { type: 'ACCEPT_HANDOFF' },
      'handoffNotAvailable',
    );
    expect(asCore((await getSession(request, sessionId)).view).version).toBe(view.version);
    // A finish/pass by the player never shows a handoff in an AI game (SWR-004 invariant).
    const passed = await commandOk(request, sessionId, view, { type: 'PASS' });
    expect(asCore(passed.view).activeSide).toBe('empire');
    await page.reload();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
  });
});

test.describe('SWR-004 hot-seat on a seeded legacy row (mock-v1 regression)', () => {
  test('TC-E2E-HS-M1: seeded handoff → «I am the Empire» → mock table → «Pass the turn» → handoff without board data', async ({
    page,
    request,
  }) => {
    const { sessionId, version: v } = await seedLegacyV2('rebelsHumanHandoff');
    const stored = asHandoff((await getSession(request, sessionId)).view);
    expect(stored).toMatchObject({ activeSide: 'empire', version: v, rulesEngine: 'mock-v1' });

    await page.goto(sessionPath(sessionId));
    await expectHandoffScreen(page, 'empire');
    await expect(page.getByTestId(T.handoffTitle)).toBeFocused();
    const acc = await nextCommand(page, () => page.getByTestId(T.handoffAccept).click());
    const emp = asPlayer(acc.body.view);
    expect(emp.viewer).toBe('empire');
    expect(emp.rebelBase.systemId).toBeNull();
    for (const p of emp.pieces.filter((x) => x.owner === 'rebels' && x.hidden)) {
      expect(p.typeKey).toBe('unknown');
    }
    await waitForTable(page, sessionId, { engine: 'mock-v1' });
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'empire');
    await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-variant', 'legacy');

    const recorder = recordApi(page);
    const end = await nextCommand(page, () => page.getByTestId(T.endTurn).click());
    expect(end.res.request().postDataJSON()).toEqual({
      actor: 'empire',
      expectedVersion: emp.version,
      command: { type: 'END_TURN' },
    });
    expectHandoffOnly(end.body, boardIdsOf(emp), 'END_TURN response');
    await expectHandoffScreen(page, 'rebels');
    await page.waitForTimeout(300);
    await recorder.settle();
    for (const c of recorder.calls.filter((x) => x.url.includes(sessionId))) {
      expectHandoffOnly(c.body, boardIdsOf(emp), `${c.method} ${c.url}`);
    }
  });

  test('TC-E2E-HS-M2: seeded handoff — mock commands during the handoff and of the inactive side → 422', async ({
    page,
    request,
  }) => {
    const { sessionId } = await seedLegacyV2('rebelsHumanHandoff');
    const handoff = asHandoff((await getSession(request, sessionId)).view);
    for (const type of ['ADVANCE_PHASE', 'END_TURN'] as const) {
      await expectRejected(request, sessionId, handoff, { type }, 'handoffPending', 'empire');
    }
    await expectRejected(
      request,
      sessionId,
      handoff,
      { type: 'ACCEPT_HANDOFF' },
      'notYourTurn',
      'rebels',
    );
    // core commands on a mock session → commandUnavailable (Q-2)
    await expectRejected(
      request,
      sessionId,
      handoff,
      { type: 'PASS' },
      'commandUnavailable',
      'empire',
    );
    const emp = asPlayer(
      (await commandOk(request, sessionId, handoff, { type: 'ACCEPT_HANDOFF' })).view,
    );
    await expectRejected(
      request,
      sessionId,
      emp,
      { type: 'ADVANCE_PHASE' },
      'notYourTurn',
      'rebels',
    );
    const back = await endTurn(request, sessionId, emp);
    expect(back.activeSide).toBe('rebels');
    await page.goto(sessionPath(sessionId));
    await expectHandoffScreen(page, 'rebels');
  });
});
