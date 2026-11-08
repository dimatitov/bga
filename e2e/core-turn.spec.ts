// SWR-005 scenario 1 (AI game as the Rebels) and the core-v1 turn flow: TC-E-01, TC-E-02, TC-E-03, TC-E-10, TC-E-11,
// TC-E-13 (AC-01, AC-03..AC-06, AC-08, AC-12, AC-13). Fixtures come from the server view (never hard-coded ids except
// the base-game leader ids of spec Data clarifications).
import { expect, test } from '@playwright/test';
import {
  actionOf,
  asCore,
  commandOk,
  CORE_REGION_IDS,
  CORE_SYSTEM_COUNT,
  coreMoveActions,
  createSession,
  expectRejected,
  getCoreView,
  LEADERS,
  MON_MOTHMA,
  planActivation,
  poolOf,
  REBELLION,
  REBELS_VS_AI,
  START_REPUTATION,
  type CorePlayerView,
  type SessionResponse,
} from './support/api';
import {
  dbg,
  keyboardFocus,
  newSessionPath,
  openCore,
  openSidebarTab,
  sessionPath,
  urlOf,
  waitForTable,
} from './support/board';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  eventsOf,
  expectTrack,
  expectTurn,
  finishViaUi,
  midpoint,
  nextCommand,
  passViaUi,
  systemName,
  tableVersion,
  zoomToDetailAround,
} from './support/core';
import { expectFieldFocus, expectVisibleFocus } from './support/a11y';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** Activation + finish through the API (the AI auto-pass follows in the same response). */
async function activateAndFinishViaApi(
  request: Parameters<typeof commandOk>[0],
  sessionId: string,
  view: CorePlayerView,
): Promise<CorePlayerView> {
  const plan = planActivation(view, [view.rebelBase.systemId ?? '']);
  const a = asCore(
    (
      await commandOk(request, sessionId, view, {
        type: 'ACTIVATE_SYSTEM',
        leaderId: plan.leaderId,
        systemId: plan.systemId,
      })
    ).view,
  );
  return asCore((await commandOk(request, sessionId, a, { type: 'FINISH_ACTIVATION' })).view);
}

test.describe('SWR-005 scenario 1: AI game as the Rebels (core-v1)', () => {
  test('TC-E-01: setup defaults → core-v1 table: 32 systems in 8 regions, time 1 / reputation 14, Orders, Rebels to move, pool of 4, slice badge', async ({
    page,
  }) => {
    await page.goto(newSessionPath(REBELLION));
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/sessions',
    );
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    expect(body.status).toBe('prototype'); // AC-13
    expect(Object.keys(body.settings)).not.toContain('rulesEngine'); // AM-FE-1 / TC-R-08
    const view = asCore(body.view);
    expect(view.viewer).toBe('rebels');
    expect(view.activeSide).toBe('rebels');
    expect(view.phase).toBe('command'); // AC-03: assignment passed automatically
    expect(view.markers).toEqual({ time: 1, reputation: START_REPUTATION });
    expect(view.map.systems).toHaveLength(CORE_SYSTEM_COUNT);
    expect(view.log.map((e) => e.type)).toEqual(['GAME_CREATED', 'PHASE_STARTED', 'PHASE_STARTED']);

    await expect(page).toHaveURL(urlOf(sessionPath(body.sessionId)));
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    const table = page.getByTestId(T.gameTable);
    await expect(table).toHaveAttribute('data-phase', 'command');
    await expectTurn(page, 'rebels');
    await expect(page.getByTestId(T.turnIndicator)).toHaveAttribute('data-mine', 'true');
    await expectTrack(page, 1, START_REPUTATION);
    await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'command');
    await expect(page.getByTestId(T.phaseIndicator)).not.toBeEmpty();

    // 32 systems in the object list, 4 per region r1..r8, remote flags exactly as in the view.
    await expect(page.locator('[data-testid^="system-item-"][data-region]')).toHaveCount(
      CORE_SYSTEM_COUNT,
    );
    for (const r of CORE_REGION_IDS) {
      await expect(page.getByTestId(T.regionGroup(r))).toHaveCount(1);
      await expect(
        page.getByTestId(T.regionGroup(r)).locator('[data-testid^="system-item-"][data-region]'),
      ).toHaveCount(4);
    }
    for (const s of view.map.systems) {
      const item = page.getByTestId(T.systemItem(s.id));
      await expect(item).toHaveAttribute('data-region', s.regionId);
      await expect(item).toHaveAttribute('data-remote', String(s.remote));
      await dbg.systemPos(page, s.id); // drawn on the map
    }
    expect(view.map.systems.filter((s) => s.remote)).toHaveLength(8);

    // Pool of 4 own leaders; Mon Mothma shown but not available (no tactic values).
    const pool = page.getByTestId(T.leaderPool);
    await expect(pool).toHaveRole('radiogroup');
    await expect(pool.getByRole('radio')).toHaveCount(4);
    for (const id of LEADERS.rebels) {
      await expect(page.getByTestId(T.leader(id))).toHaveAttribute(
        'data-available',
        id === MON_MOTHMA ? 'false' : 'true',
      );
    }
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId(T.passTurn)).toBeEnabled();
    await expect(page.getByTestId(T.finishActivation)).toBeDisabled();
    await expect(page.getByTestId(T.advancePhase)).toHaveCount(0);
    await expect(page.getByTestId(T.endTurn)).toHaveCount(0);

    const badge = page.getByTestId(T.prototypeBadge);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-variant', 'core-v1');
    await expect(badge).toHaveAttribute('data-status', 'prototype');
    await expect(badge).not.toBeEmpty();
    expect(await dbg.rulesEngine(page)).toBe('core-v1');
  });

  test('TC-E-02: leader → system click → drag a unit from a neighbour → finish: PIECES_MOVED, ACTIVATION_FINISHED, auto PASSED of the AI; Rebels again', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    const activate = actionOf(view, 'ACTIVATE_SYSTEM')!;
    expect(activate.leaderIds).not.toContain(MON_MOTHMA);
    expect(activate.systemIds).toHaveLength(CORE_SYSTEM_COUNT);
    await openCore(page, sessionId);

    // Arm the leader: exactly the server's targets are highlighted (map + list).
    await armLeader(page, plan.leaderId);
    expect(await dbg.armedLeader(page)).toBe(plan.leaderId);
    expect(await dbg.highlighted(page)).toEqual([...activate.systemIds].sort());
    await expect(page.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
      'data-activatable',
      'true',
    );

    // Click the target on the map → ACTIVATE_SYSTEM right away (Q-FE-5).
    const act = await commandViaUi(page, () => clickSystem(page, plan.systemId));
    expect(act.res.request().postDataJSON()).toEqual({
      actor: 'rebels',
      expectedVersion: view.version,
      command: { type: 'ACTIVATE_SYSTEM', leaderId: plan.leaderId, systemId: plan.systemId },
    });
    expect(eventsOf(act.body, 'SYSTEM_ACTIVATED')).toHaveLength(1);
    expect(act.view.activation).toMatchObject({
      side: 'rebels',
      leaderId: plan.leaderId,
      location: { kind: 'system', systemId: plan.systemId },
    });
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'activation');
    await expect(page.getByTestId(T.movePanel)).toHaveAttribute('data-to', plan.systemId);
    await expect(page.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
      'data-activated',
      'true',
    );
    expect(await dbg.activated(page)).toBe(plan.systemId);
    await expect(page.getByTestId(T.finishActivation)).toBeEnabled();
    await expect(page.getByTestId(T.passTurn)).toBeDisabled(); // R-6: no pass during an activation

    // Only the server's sources are offered (panel + map).
    const sources = coreMoveActions(act.view).map((m) => m.fromSystemId);
    expect(sources).toContain(plan.fromSystemId);
    expect(await dbg.moveSources(page)).toEqual([...sources].sort());
    for (const from of sources) await expect(page.getByTestId(T.moveSource(from))).toHaveCount(1);
    await expect(page.locator('[data-testid^="move-source-"]')).toHaveCount(sources.length);

    // Drag the unit onto the activated system (detail LOD needed for unit drag).
    await zoomToDetailAround(page, await midpoint(page, plan.fromSystemId, plan.systemId));
    const from = await dbg.piecePos(page, plan.pieceId);
    const to = await dbg.systemPos(page, plan.systemId);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 15 });
    expect(await dbg.isDragging(page)).toBe(true);
    const moved = await commandViaUi(page, () => page.mouse.up());
    expect(moved.res.request().postDataJSON()).toEqual({
      actor: 'rebels',
      expectedVersion: act.view.version,
      command: {
        type: 'MOVE_PIECES',
        pieceIds: [plan.pieceId],
        fromSystemId: plan.fromSystemId,
        toSystemId: plan.systemId,
      },
    });
    expect(eventsOf(moved.body, 'PIECES_MOVED')).toHaveLength(1);
    await expect(page.getByTestId(T.pieceItem(plan.pieceId))).toHaveAttribute(
      'data-system-id',
      plan.systemId,
    );

    // Finish → the AI (Empire) passes automatically in the same response.
    const fin = await finishViaUi(page);
    const types = fin.body.events.map((e) => e.type);
    expect(types[0]).toBe('ACTIVATION_FINISHED');
    const autoPass = eventsOf(fin.body, 'PASSED');
    expect(autoPass).toHaveLength(1);
    expect(autoPass[0]).toMatchObject({ actor: 'empire', payload: { auto: true } });
    expect(fin.view.version).toBe(moved.view.version + 2); // Q-19: player command + AI command
    expect(fin.view.passed).toEqual({ rebels: false, empire: true });
    expect(fin.view.activeSide).toBe('rebels');
    await expectTurn(page, 'rebels');
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId(T.passedIndicator)).toHaveAttribute('data-empire', 'true');

    await openSidebarTab(page, 'log');
    const entry = page.getByTestId(T.logEntry(autoPass[0]!.seq));
    await expect(entry).toHaveAttribute('data-type', 'PASSED');
    await expect(entry).toHaveAttribute('data-actor', 'empire');
    await expect(entry).toHaveAttribute('data-auto', 'true');
    await expect(page.getByTestId(T.logEntryAuto(autoPass[0]!.seq))).toBeVisible();
    await expect(page.getByTestId(T.logEntryAutoHint(autoPass[0]!.seq))).not.toBeEmpty();
    await expect(page.getByTestId(T.liveRegion)).not.toBeEmpty();
  });

  test('TC-E-03: another activation (the AI does not move) → Pass + confirm → both passed: leaders back in the pool, time 2, Rebels to move', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    const v1 = await activateAndFinishViaApi(request, sessionId, view);
    expect(v1.passed.empire).toBe(true);
    await openCore(page, sessionId);
    await expect(page.getByTestId(T.leaderPool).getByRole('radio')).toHaveCount(3);

    // Second activation: the AI has passed for the phase → no AI event, Rebels keep the turn.
    const plan = planActivation(v1, [v1.rebelBase.systemId!]);
    await armLeader(page, plan.leaderId);
    const act = await commandViaUi(page, () => clickSystem(page, plan.systemId));
    expect(act.body.events.map((e) => e.type)).toEqual(['SYSTEM_ACTIVATED']);
    const fin = await finishViaUi(page);
    expect(fin.body.events.map((e) => e.type)).toEqual(['ACTIVATION_FINISHED']);
    expect(fin.view.activeSide).toBe('rebels');
    await expectTurn(page, 'rebels');

    // Pass: a leader can still activate → confirmation dialog (Q-FE-3).
    const passed = await passViaUi(page, true);
    const types = passed.body.events.map((e) => e.type);
    expect(types[0]).toBe('PASSED');
    expect(types).toEqual(
      expect.arrayContaining(['LEADERS_RETURNED', 'TIME_ADVANCED', 'PHASE_STARTED']),
    );
    expect(eventsOf(passed.body, 'TIME_ADVANCED')[0]?.payload).toEqual({ from: 1, to: 2 });
    expect(passed.view.markers.time).toBe(2);
    expect(passed.view.round).toBe(2);
    expect(passed.view.phase).toBe('command');
    expect(passed.view.activeSide).toBe('rebels');
    expect(passed.view.passed).toEqual({ rebels: false, empire: false });
    expect(passed.view.leaders.every((l) => l.location.kind === 'pool')).toBe(true);

    await expectTrack(page, 2);
    await expectTurn(page, 'rebels');
    await expect(page.getByTestId(T.leaderPool).getByRole('radio')).toHaveCount(4);
    for (const id of [...LEADERS.rebels, ...LEADERS.empire]) {
      await expect(page.getByTestId(T.leaderItem(id))).toHaveCount(1);
    }
    const server = await getCoreView(request, sessionId);
    expect(server.version).toBe(passed.view.version);
    expect(poolOf(server, 'rebels')).toHaveLength(4);
    expect(poolOf(server, 'empire')).toHaveLength(4);
  });

  test('TC-E-10: keyboard only — pool (arrows) → system picker → Activate → move panel → Move → Finish → Pass + dialog', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    const available = actionOf(view, 'ACTIVATE_SYSTEM')!.leaderIds;
    await openCore(page, sessionId);

    // 1) Tab to the pool (one tab stop, roving tabindex), arrows arm leaders.
    const first = page.getByTestId(T.leader(available[0]!));
    await keyboardFocus(page, first);
    await expectVisibleFocus(first, 'leader pool tab stop');
    await page.keyboard.press('ArrowRight');
    const second = page.getByTestId(T.leader(available[1]!));
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute('aria-checked', 'true');
    // walk back to the planned leader with arrows
    for (let i = 0; i < 4; i++) {
      if ((await page.getByTestId(T.leader(plan.leaderId)).getAttribute('aria-checked')) === 'true')
        break;
      await page.keyboard.press('ArrowLeft');
    }
    await expect(page.getByTestId(T.leader(plan.leaderId))).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'armed');

    // 2) Autocomplete: type the localized name, pick with arrows + Enter (Enter never sends the command).
    const input = page.getByTestId(T.activationSystemSelect).locator('input');
    await keyboardFocus(page, input);
    await expectFieldFocus(input, 'activation system picker');
    await page.keyboard.type(await systemName(page, plan.systemId));
    await page.keyboard.press('ArrowDown');
    const before = await tableVersion(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    expect(await tableVersion(page), 'Enter in the picker does not send a command').toBe(before);
    const confirm = page.getByTestId(T.activationConfirm);
    await expect(confirm).toBeEnabled();
    await expect(confirm).toContainText(await systemName(page, plan.systemId));
    await page.keyboard.press('Tab');
    await expectVisibleFocus(confirm, 'activate button');
    const act = await commandViaUi(page, () => page.keyboard.press('Enter'));
    expect(act.res.request().postDataJSON()).toMatchObject({
      command: { type: 'ACTIVATE_SYSTEM', leaderId: plan.leaderId, systemId: plan.systemId },
    });

    // 3) Focus lands on the move panel heading; Tab to the unit checkbox, Space, Tab to "Move", Enter.
    await expect(page.getByTestId(T.movePanel)).toBeVisible();
    await expect
      .poll(() =>
        page.getByTestId(T.movePanel).evaluate((el) => el.contains(document.activeElement)),
      )
      .toBe(true);
    const box = page.getByTestId(T.movePiece(plan.pieceId));
    await keyboardFocus(page, box);
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    const submit = page.getByTestId(T.moveSubmit(plan.fromSystemId));
    await keyboardFocus(page, submit);
    await expectVisibleFocus(submit, 'move submit');
    const moved = await commandViaUi(page, () => page.keyboard.press('Enter'));
    expect(moved.res.request().postDataJSON()).toMatchObject({
      command: {
        type: 'MOVE_PIECES',
        pieceIds: [plan.pieceId],
        fromSystemId: plan.fromSystemId,
        toSystemId: plan.systemId,
      },
    });

    // 4) Finish activation from the top bar by keyboard (Shift+Tab walks back up is not required: Tab cycles).
    const finish = page.getByTestId(T.finishActivation);
    await keyboardFocus(page, finish);
    await expectVisibleFocus(finish, 'finish activation');
    const fin = await commandViaUi(page, () => page.keyboard.press('Enter'));
    expect(fin.body.events[0]?.type).toBe('ACTIVATION_FINISHED');

    // 5) Pass → dialog: focus on Cancel, Esc closes; again → Tab to "Pass" → Enter.
    const pass = page.getByTestId(T.passTurn);
    await keyboardFocus(page, pass);
    await expectVisibleFocus(pass, 'pass');
    // The initial focus target («Cancel», plan-frontend §5.3 step 5) is checked strictly in TC-VA-11; here the
    // keyboard path only needs the focus to be trapped inside the dialog.
    const inDialog = () =>
      page.getByTestId(T.passConfirm).evaluate((el) => el.contains(document.activeElement));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(T.passConfirm)).toBeVisible();
    await expect.poll(inDialog).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(T.passConfirm)).toHaveCount(0);
    await expect(pass).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(inDialog).toBe(true);
    await keyboardFocus(page, page.getByTestId(T.passConfirmOk), 4);
    await expectVisibleFocus(page.getByTestId(T.passConfirmOk), 'pass confirm');
    const passed = await commandViaUi(page, () => page.keyboard.press('Enter'));
    expect(passed.body.events[0]).toMatchObject({ type: 'PASSED', actor: 'rebels' });
    expect(passed.view.markers.time).toBe(2);
    await expectTrack(page, 2);
  });

  test('TC-E-11: 422 notAdjacent / insufficientCapacity on MOVE_PIECES → readable inline message, draft kept, retry possible', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
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
    await openCore(page, sessionId);
    const pathRe = /\/api\/sessions\/[^/]+\/commands$/;

    for (const key of ['notAdjacent', 'insufficientCapacity']) {
      await page.route(pathRe, (route) =>
        route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { code: 'ILLEGAL_COMMAND', messageKey: `errors.${key}` },
          }),
        }),
      );
      const box = page.getByTestId(T.movePiece(plan.pieceId));
      if (!(await box.isChecked())) await box.check();
      const out = await nextCommand(page, () =>
        page.getByTestId(T.moveSubmit(plan.fromSystemId)).click(),
      );
      expect(out.res.status()).toBe(422);
      const err = page.getByTestId(T.moveError(plan.fromSystemId));
      await expect(err).toBeVisible();
      await expect(err).toHaveRole('alert');
      const text = ((await err.textContent()) ?? '').trim();
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/errors\.|rebellion\.|ILLEGAL_COMMAND|undefined|\b422\b/);
      await expect(box, 'draft kept after a rejection').toBeChecked();
      await page.unroute(pathRe);
    }
    // Retry against the real server succeeds; the state never changed in between.
    expect((await getCoreView(request, sessionId)).version).toBe(act.version);
    const retry = await commandViaUi(page, () =>
      page.getByTestId(T.moveSubmit(plan.fromSystemId)).click(),
    );
    expect(eventsOf(retry.body, 'PIECES_MOVED')).toHaveLength(1);
    await expect(page.getByTestId(T.moveError(plan.fromSystemId))).toHaveCount(0);
  });

  test('TC-E-13: ADVANCE_PHASE / END_TURN in core-v1 → 422 commandUnavailable, no state change; no mock buttons in the UI', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    for (const type of ['ADVANCE_PHASE', 'END_TURN'] as const) {
      await expectRejected(request, sessionId, view, { type }, 'commandUnavailable');
    }
    expect((await getCoreView(request, sessionId)).version).toBe(view.version);
    await openCore(page, sessionId);
    await expect(page.getByTestId(T.advancePhase)).toHaveCount(0);
    await expect(page.getByTestId(T.endTurn)).toHaveCount(0);
  });
});
