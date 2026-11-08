// Scenarios 2 & 6 — save/restore: TC-E2E-22, TC-E2E-23 → TC-GP-14, TC-E2E-23b → TC-GP-15 (AC-4).
// SWR-003: reload of `/sessions/:id`; "Continue" and "recent sessions" live on the game page `/games/star-wars-rebellion`.
// Relies on `workers: 1`: "Continue" opens the most recently updated Rebellion session of the whole e2e DB
// (only Rebellion sessions can be created in e2e, so "latest Rebellion" = "latest overall").
import { expect, test } from '@playwright/test';
import {
  createSession,
  getView,
  listSessions,
  pickMove,
  postCommand,
  RECENT_SESSIONS_LIMIT,
  REBELLION,
} from './support/api';
import {
  dbg,
  gamePath,
  openSession,
  openSidebarTab,
  sessionPath,
  urlOf,
  version,
  waitForCommand,
  waitForTable,
} from './support/board';
import { RECENT_SESSION_ITEM, RECENT_SESSION_PREFIX, T } from './support/testids';

test('TC-E2E-22: after a move, reload of /sessions/:id restores the state from the server', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request);
  const move = pickMove(view);
  await openSession(page, sessionId);

  const pos = await dbg.piecePos(page, move.pieceId);
  await page.mouse.click(pos.x, pos.y);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  expect((await cmd).status()).toBe(200);
  await expect.poll(() => version(page)).toBe(view.version + 1);

  await page.reload();
  await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
  await waitForTable(page, sessionId);
  expect(await version(page)).toBe(view.version + 1);
  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.toSystemId,
  );
  await expect(page.getByTestId(T.roundIndicator)).toContainText(String(view.round));
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', view.phase);
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLogItem)).toHaveCount(view.log.length + 1);
});

test('TC-GP-14 (was TC-E2E-23): "Continue" on the game page in a fresh context opens the latest session', async ({
  browser,
  request,
}) => {
  const older = await createSession(request);
  const { sessionId, view } = await createSession(request);
  const move = pickMove(view);
  const res = await postCommand(request, sessionId, view, {
    type: 'MOVE_PIECES',
    pieceIds: [move.pieceId],
    fromSystemId: move.fromSystemId,
    toSystemId: move.toSystemId,
  });
  expect(res.status()).toBe(200);
  const list = await listSessions(request, REBELLION);
  expect(list[0]?.sessionId).toBe(sessionId);
  expect(list.map((s) => s.sessionId)).toContain(older.sessionId);

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId(T.gameCard(REBELLION)).click();
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    const cont = page.getByTestId(T.gameContinue);
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
    await waitForTable(page, sessionId);
    expect(await version(page)).toBe(view.version + 1);
    await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
      'data-system-id',
      move.toSystemId,
    );
    await openSidebarTab(page, 'log');
    await expect(page.getByTestId(T.eventLogItem)).toHaveCount(view.log.length + 1);
  } finally {
    await context.close();
  }
});

test('TC-GP-15 (was TC-E2E-23b): game page lists exactly 5 recent sessions newest first and opens one', async ({
  page,
  request,
}) => {
  // ≥ 6 sessions of this game regardless of what earlier specs created.
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

  // "Continue" points at the newest one (Q-14: it is also the first recent item).
  await expect(page.getByTestId(T.gameContinue)).toBeEnabled();

  const oldestVisible = ids.at(-1)!;
  await page.getByTestId(T.recentSession(oldestVisible)).click();
  await expect(page).toHaveURL(urlOf(sessionPath(oldestVisible)));
  await waitForTable(page, oldestVisible);
  expect(await version(page)).toBe((await getView(request, oldestVisible)).version);
});
