// Scenarios 2 & 6 — save/restore: TC-E2E-22, TC-E2E-23 → TC-GP-14, TC-E2E-23b → TC-GP-15 (AC-4).
// SWR-003: reload of `/sessions/:id`; "Continue" and "recent sessions" live on the game page `/games/star-wars-rebellion`.
// SWR-005 (Q-1): rewritten on core-v1 — the persisted move is an activation + a unit move (the AI does not answer
// during an activation, so versions stay predictable). Relies on `workers: 1`: "Continue" opens the most recently
// updated unfinished Rebellion session of the whole e2e DB.
import { expect, test } from '@playwright/test';
import {
  asCore,
  commandOk,
  createSession,
  getCoreView,
  listSessions,
  planActivation,
  RECENT_SESSIONS_LIMIT,
  REBELLION,
  REBELS_VS_AI,
} from './support/api';
import {
  gamePath,
  openCore,
  openSidebarTab,
  sessionPath,
  urlOf,
  version,
  waitForTable,
} from './support/board';
import { armLeader, clickSystem, commandViaUi } from './support/core';
import { RECENT_SESSION_ITEM, RECENT_SESSION_PREFIX, T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

test('TC-E2E-22 (core-v1): after an activation and a move, reload of /sessions/:id restores the state from the server', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, REBELS_VS_AI);
  const plan = planActivation(view, [view.rebelBase.systemId!]);
  await openCore(page, sessionId);

  await armLeader(page, plan.leaderId);
  await commandViaUi(page, () => clickSystem(page, plan.systemId));
  await page.getByTestId(T.movePiece(plan.pieceId)).check();
  await commandViaUi(page, () => page.getByTestId(T.moveSubmit(plan.fromSystemId)).click());
  await expect.poll(() => version(page)).toBe(view.version + 2);

  await page.reload();
  await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
  await waitForTable(page, sessionId, { engine: 'core-v1' });
  expect(await version(page)).toBe(view.version + 2);
  await expect(page.getByTestId(T.pieceItem(plan.pieceId))).toHaveAttribute(
    'data-system-id',
    plan.systemId,
  );
  await expect(page.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
    'data-activated',
    'true',
  );
  await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'activation');
  await expect(page.getByTestId(T.leaderItem(plan.leaderId))).toHaveAttribute(
    'data-location',
    plan.systemId,
  );
  await expect(page.getByTestId(T.timeTrack)).toHaveAttribute(
    'data-time',
    String(view.markers.time),
  );
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', view.phase);
  await openSidebarTab(page, 'log');
  await expect(page.locator('[data-testid^="log-entry-"][data-seq]')).toHaveCount(
    view.log.length + 2,
  );
});

test('TC-GP-14 (core-v1, was TC-E2E-23): "Continue" on the game page in a fresh context opens the latest session', async ({
  browser,
  request,
}) => {
  const older = await createSession(request);
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
  const list = await listSessions(request, REBELLION);
  expect(list[0]?.sessionId).toBe(sessionId);
  expect(list.map((s) => s.sessionId)).toContain(older.sessionId);

  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId(T.gameCard(REBELLION)).click();
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    const cont = page.getByTestId(T.gameContinue);
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    expect(await version(page)).toBe(act.version);
    await expect(page.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
      'data-activated',
      'true',
    );
    await openSidebarTab(page, 'log');
    await expect(page.locator('[data-testid^="log-entry-"][data-seq]')).toHaveCount(act.log.length);
  } finally {
    await context.close();
  }
});

test('TC-GP-15 (was TC-E2E-23b): game page lists exactly 5 recent sessions newest first and opens one', async ({
  page,
  request,
}) => {
  for (let i = 0; i < RECENT_SESSIONS_LIMIT + 1; i++) await createSession(request);
  const summaries = await listSessions(request, REBELLION);
  expect(summaries.length).toBeGreaterThan(RECENT_SESSIONS_LIMIT);
  expect(summaries.every((s) => s.gameId === REBELLION)).toBe(true);
  const updated = summaries.map((s) => Date.parse(s.updatedAt));
  expect(updated, 'API order: updatedAt desc').toEqual([...updated].sort((a, b) => b - a));

  await page.goto(gamePath(REBELLION));
  const items = page.getByTestId(T.gameRecentSessions).locator(RECENT_SESSION_ITEM);
  await expect(items).toHaveCount(RECENT_SESSIONS_LIMIT);
  const ids = await items.evaluateAll(
    (els, prefix) => els.map((el) => el.getAttribute('data-testid')!.slice(prefix.length)),
    RECENT_SESSION_PREFIX,
  );
  expect(ids).toEqual(summaries.slice(0, RECENT_SESSIONS_LIMIT).map((s) => s.sessionId));
  await expect(page.getByTestId(T.gameContinue)).toBeEnabled();

  const oldestVisible = ids.at(-1)!;
  await page.getByTestId(T.recentSession(oldestVisible)).click();
  await expect(page).toHaveURL(urlOf(sessionPath(oldestVisible)));
  await waitForTable(page, oldestVisible, { engine: 'core-v1' });
  expect(await version(page)).toBe((await getCoreView(request, oldestVisible)).version);
});
