// SWR-005 scenario 5 (victories) and the game page with core / legacy / completed sessions: TC-E-07, TC-E-08, TC-E-14
// (AC-07, AC-13). 5a: the Rebels win by time (12 passes through the public API, the 13th in the UI); 5b: the Empire
// wins from the hot-seat seed (W5 decision: unreachable in an AI game in this slice).
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  asCore,
  commandOk,
  createSession,
  EMPIRE_VS_AI,
  expectRejected,
  getSession,
  listSessions,
  REBELLION,
  REBELS_VS_AI,
  START_REPUTATION,
  type CorePlayerView,
} from './support/api';
import {
  dbg,
  gamePath,
  openCore,
  openLegacy,
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
  finishViaUi,
  passViaUi,
} from './support/core';
import { seedCore, seedLegacyV2 } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** AI game as the Empire: each Empire PASS ends a round (the AI Rebels pass automatically). */
async function passRounds(
  request: APIRequestContext,
  sessionId: string,
  view: CorePlayerView,
  rounds: number,
): Promise<CorePlayerView> {
  let v = view;
  for (let i = 0; i < rounds; i++) {
    v = asCore((await commandOk(request, sessionId, v, { type: 'PASS' })).view);
    expect(v.outcome, `no outcome after pass ${i + 1}`).toBeNull();
    expect(v.activeSide).toBe('empire');
  }
  return v;
}

/** Completes the hot-seat seed through the API (seed.nextCommands) → Empire victory. */
async function completeEmpireWinSeed(request: APIRequestContext) {
  const seed = await seedCore('hotseat-empire-before-win');
  let version = seed.version;
  let last: Awaited<ReturnType<typeof commandOk>> | null = null;
  for (const c of seed.nextCommands) {
    last = await commandOk(
      request,
      seed.sessionId,
      { version, viewer: c.actor },
      c.command as never,
      c.actor,
    );
    version = last.view.version;
  }
  return { seed, last: last! };
}

test.describe('SWR-005 victories (core-v1)', () => {
  test('TC-E-07 (scenario 5a): 13th Pass in the UI → time reaches reputation → «Rebels win», completed, commands → 422 gameOver, base shown to the Empire', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const { sessionId, view } = await createSession(request, EMPIRE_VS_AI);
    const before = await passRounds(request, sessionId, view, START_REPUTATION - 2);
    expect(before.markers.time).toBe(START_REPUTATION - 1);
    expect(before.rebelBase.systemId).toBeNull();

    await openCore(page, sessionId);
    await expectTrack(page, START_REPUTATION - 1);
    const passed = await passViaUi(page, true);
    const types = passed.body.events.map((e) => e.type);
    expect(types).toContain('TIME_ADVANCED');
    expect(types.at(-1)).toBe('GAME_OVER');
    expect(eventsOf(passed.body, 'GAME_OVER')[0]).toMatchObject({
      actor: 'system',
      payload: { winner: 'rebels', reason: 'timeReachedReputation' },
    });
    expect(passed.view.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    expect(passed.view.markers.time).toBe(START_REPUTATION);
    expect(passed.view.legalActions).toEqual([]);
    // Q-14: after the game is over there is no hidden information — the Empire sees the base.
    expect(passed.view.rebelBase.systemId).not.toBeNull();

    const banner = page.getByTestId(T.gameOverBanner);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-winner', 'rebels');
    await expect(banner).toHaveAttribute('data-reason', 'timeReachedReputation');
    await expect(page.getByTestId(T.gameOverTitle)).not.toBeEmpty();
    await expect(page.getByTestId(T.gameOverReason)).not.toBeEmpty();
    // plan-frontend §5.3: outcome → focus on the banner heading (once). Soft: the rest of the scenario still runs,
    // the test is reported failed if it does not hold (defect, see qa-results).
    await expect
      .soft(page.getByTestId(T.gameOverTitle), 'focus moves to the banner heading')
      .toBeFocused();
    await expect(page.getByTestId(T.turnControls)).toHaveCount(0);
    await expect(page.getByTestId(T.finishActivation)).toHaveCount(0);
    await expect(page.getByTestId(T.passTurn)).toHaveCount(0);
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'over');
    await expect(page.getByTestId(T.sessionStatusCompleted)).toBeVisible();
    await expectTrack(page, START_REPUTATION);
    expect(await dbg.rebelBase(page)).toBe(passed.view.rebelBase.systemId);

    // AC-07 / AC-13: completed via the platform status, in the response and in the list.
    const stored = await getSession(request, sessionId);
    expect(stored.status).toBe('completed');
    const summary = (await listSessions(request, REBELLION)).find((s) => s.sessionId === sessionId);
    expect(summary?.status).toBe('completed');
    expect(summary?.details).toMatchObject({ winner: 'rebels', rulesEngine: 'core-v1' });
    await expectRejected(request, sessionId, passed.view, { type: 'PASS' }, 'gameOver');
    await expectRejected(
      request,
      sessionId,
      { version: 1, viewer: 'empire' },
      { type: 'FINISH_ACTIVATION' },
      'gameOver',
    );

    // Game page: the row says «Completed» and the table reopens on the final screen.
    await page.goto(gamePath(REBELLION));
    const row = page.getByTestId(T.recentSession(sessionId));
    await expect(row).toBeVisible();
    await expect(row.getByTestId(T.recentSessionStatus)).toHaveAttribute(
      'data-status',
      'completed',
    );
    await expect(row.getByTestId(T.recentSessionOutcome)).not.toBeEmpty();
    await row.click();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expect(page.getByTestId(T.gameOverBanner)).toHaveAttribute('data-winner', 'rebels');
    await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-status', 'completed');
  });

  test('TC-E-08 (scenario 5b, hot-seat seed): Empire reveals an empty base → BASE_REVEALED + GAME_OVER (empire, rebelBaseCaptured), completed, no handoff', async ({
    page,
    request,
  }) => {
    const seed = await seedCore('hotseat-empire-before-win');
    const baseId = seed.rebelBaseSystemId;
    const [activate, move] = seed.nextCommands;
    const leaderId = activate!.command.leaderId as string;
    const { pieceIds, fromSystemId } = move!.command as unknown as {
      pieceIds: string[];
      fromSystemId: string;
    };

    await openCore(page, seed.sessionId);
    await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-active-side', 'empire');
    // The base holds no Rebel units: the zone «location unknown» is shown empty.
    await expect(page.getByTestId(T.hiddenBaseZone)).toHaveAttribute('data-count', '0');

    await armLeader(page, leaderId);
    await commandViaUi(page, () => clickSystem(page, baseId));
    for (const id of pieceIds) await page.getByTestId(T.movePiece(id)).check();
    const moved = await commandViaUi(page, () =>
      page.getByTestId(T.moveSubmit(fromSystemId)).click(),
    );
    expect(moved.view.outcome, 'no win before the reveal').toBeNull();

    const fin = await finishViaUi(page);
    // Q-41: ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER.
    expect(fin.body.events.map((e) => e.type)).toEqual([
      'ACTIVATION_FINISHED',
      'BASE_REVEALED',
      'GAME_OVER',
    ]);
    expect(eventsOf(fin.body, 'GAME_OVER')[0]?.payload).toEqual({
      winner: 'empire',
      reason: 'rebelBaseCaptured',
    });
    expect(fin.view.kind).toBe('player'); // Q-14: no handoff screen after the game is over
    expect(fin.view.outcome).toEqual(seed.expectAfter.outcome);
    expect(fin.view.legalActions).toEqual([]);

    const banner = page.getByTestId(T.gameOverBanner);
    await expect(banner).toHaveAttribute('data-winner', 'empire');
    await expect(banner).toHaveAttribute('data-reason', 'rebelBaseCaptured');
    await expect(page.getByTestId(T.handoffScreen)).toHaveCount(0);
    await expect(page.getByTestId(T.mapSystem(baseId))).toHaveAttribute('data-rebel-base', 'true');
    await openSidebarTab(page, 'log');
    for (const e of fin.body.events)
      await expect(page.getByTestId(T.logEntry(e.seq))).toHaveCount(1);

    expect((await getSession(request, seed.sessionId)).status).toBe('completed');
    for (const actor of ['empire', 'rebels'] as const) {
      await expectRejected(
        request,
        seed.sessionId,
        { version: fin.view.version, viewer: actor },
        { type: 'PASS' },
        'gameOver',
      );
    }
    // After the game is over nothing is hidden any more (Q-14): the stored final view carries the reveal.
    const finalView = asCore((await getSession(request, seed.sessionId)).view);
    expect(finalView.log.some((e) => e.type === 'BASE_REVEALED')).toBe(true);
    expect(finalView.rebelBase).toEqual({ systemId: baseId, revealed: true });
  });

  test('TC-E-14: game page — core, legacy and completed sessions are distinguishable; «Continue» → latest unfinished', async ({
    page,
    request,
  }) => {
    const core = await createSession(request, REBELS_VS_AI);
    const legacy = await seedLegacyV2('rebelsAi');
    const { seed: done } = await completeEmpireWinSeed(request);
    const list = await listSessions(request, REBELLION);
    expect(list[0]?.sessionId, 'the completed session is the newest').toBe(done.sessionId);

    await page.goto(gamePath(REBELLION));
    const rows = page.getByTestId(T.gameRecentSessions);
    const doneRow = rows.getByTestId(T.recentSession(done.sessionId));
    const legacyRow = rows.getByTestId(T.recentSession(legacy.sessionId));
    const coreRow = rows.getByTestId(T.recentSession(core.sessionId));
    await expect(doneRow.getByTestId(T.recentSessionStatus)).toHaveAttribute(
      'data-status',
      'completed',
    );
    await expect(doneRow.getByTestId(T.recentSessionOutcome)).not.toBeEmpty();
    await expect(legacyRow.getByTestId(T.recentSessionStatus)).toHaveAttribute(
      'data-status',
      'prototype',
    );
    await expect(legacyRow.getByTestId(T.recentSessionEngine)).not.toBeEmpty();
    await expect(coreRow.getByTestId(T.recentSessionStatus)).toHaveAttribute(
      'data-status',
      'prototype',
    );
    await expect(coreRow.getByTestId(T.recentSessionEngine)).toHaveCount(0);
    await expect(coreRow.getByTestId(T.recentSessionOutcome)).toHaveCount(0);
    await expect(coreRow.getByTestId(T.recentSessionProgress)).not.toBeEmpty();
    expect(await legacyRow.getByTestId(T.recentSessionProgress).textContent()).not.toEqual(
      await coreRow.getByTestId(T.recentSessionProgress).textContent(),
    );

    // Q-31: «Continue» skips the completed newest session and opens the latest unfinished one (the legacy row).
    await page.getByTestId(T.gameContinue).click();
    await expect(page).toHaveURL(urlOf(sessionPath(legacy.sessionId)));
    await waitForTable(page, legacy.sessionId, { engine: 'mock-v1' });
    await openLegacy(page, legacy.sessionId);
    await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-variant', 'legacy');
  });
});
