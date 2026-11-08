// Scenarios 2 & 6 — save/restore: TC-E2E-22, TC-E2E-23, TC-E2E-23b (AC-3, AC-8, AC-10).
// Relies on `workers: 1`: "Continue" opens the most recently updated game in the whole e2e DB.
import { expect, test } from '@playwright/test';
import { createGame, getView, listGames, pickMove, postCommand } from './support/api';
import {
  dbg,
  openGame,
  openSidebarTab,
  version,
  waitForCommand,
  waitForTable,
} from './support/board';
import { T } from './support/testids';

test('TC-E2E-22: after a move, reload restores the state from the server', async ({
  page,
  request,
}) => {
  const { gameId, view } = await createGame(request);
  const move = pickMove(view);
  await openGame(page, gameId);

  const pos = await dbg.piecePos(page, move.pieceId);
  await page.mouse.click(pos.x, pos.y);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  expect((await cmd).status()).toBe(200);
  await expect.poll(() => version(page)).toBe(view.version + 1);

  await page.reload();
  await waitForTable(page, gameId);
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

test('TC-E2E-23: "Continue" in a fresh browser context opens the latest game with its state', async ({
  browser,
  request,
}) => {
  const { gameId, view } = await createGame(request);
  const move = pickMove(view);
  const res = await postCommand(request, view, {
    type: 'MOVE_PIECES',
    pieceIds: [move.pieceId],
    fromSystemId: move.fromSystemId,
    toSystemId: move.toSystemId,
  });
  expect(res.status()).toBe(200);
  expect((await listGames(request))[0]?.gameId).toBe(gameId);

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/');
    const cont = page.getByTestId(T.menuContinue);
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`));
    await waitForTable(page, gameId);
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

test('TC-E2E-23b: "Recent games" lists ≤ 5 games newest first and opens the chosen one', async ({
  page,
  request,
}) => {
  const older = await createGame(request);
  const newer = await createGame(request);

  await page.goto('/');
  const items = page.getByTestId(T.recentGames).locator('[data-testid^="recent-game-"]');
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(2);
  expect(count).toBeLessThanOrEqual(5);

  const ids = await items.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid')!.replace('recent-game-', '')),
  );
  const summaries = await listGames(request);
  expect(ids).toEqual(summaries.slice(0, count).map((s) => s.gameId));
  expect(ids.indexOf(newer.gameId)).toBeLessThan(ids.indexOf(older.gameId));

  await page.getByTestId(T.recentGame(older.gameId)).click();
  await expect(page).toHaveURL(new RegExp(`/games/${older.gameId}$`));
  await waitForTable(page, older.gameId);
  expect(await version(page)).toBe((await getView(request, older.gameId)).version);
});
