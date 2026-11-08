// AC-11 screenshots (TC-E2E-33): docs/tasks/SWR-002/artifacts/screenshots/<name>.png, 1440×900, reduced motion.
// 01-main-menu-empty is captured by 00-empty-db.spec.ts (needs an empty DB).
// Steps are serial on purpose: one game walked through all screens.
import { expect, test, type Page } from '@playwright/test';
import { createGame, pickMove, type MoveFixture } from './support/api';
import {
  dbg,
  emptyCanvasPoint,
  mouseDrag,
  openGame,
  openSidebarTab,
  saveScreenshot,
  waitForCommand,
  waitViewportStable,
} from './support/board';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

async function selectPiece(page: Page, move: MoveFixture) {
  const pos = await dbg.piecePos(page, move.pieceId);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: move.pieceId });
}

test('TC-E2E-33: capture AC-11 screenshots', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { gameId, view } = await createGame(request);
  const move = pickMove(view);

  await page.goto('/');
  await expect(page.getByTestId(T.menuContinue)).toBeEnabled();
  await saveScreenshot(page, '02-main-menu-with-games');

  await page.goto('/games/new');
  await page.getByTestId(T.setupOpponent('ai')).click();
  await page.getByTestId(T.setupDifficultyOption('normal')).click();
  await saveScreenshot(page, '03-new-game');

  await openGame(page, gameId);
  await saveScreenshot(page, '04-board-initial');

  await page.getByTestId(T.zoomIn).click();
  const start = await emptyCanvasPoint(page, view);
  await mouseDrag(page, start, { x: start.x + 120, y: start.y + 60 });
  await waitViewportStable(page);
  await saveScreenshot(page, '05-board-zoomed-panned');
  await page.getByTestId(T.zoomFit).click();
  await waitViewportStable(page);

  const sys = await dbg.systemPos(page, move.fromSystemId);
  await page.mouse.click(sys.x, sys.y);
  await expect(page.getByTestId(T.systemPanel)).toBeVisible();
  await saveScreenshot(page, '06-system-panel');

  await selectPiece(page, move);
  await expect(page.getByTestId(T.actionPanel)).toBeVisible();
  await saveScreenshot(page, '07-piece-actions');

  // drag preview: hold the mouse over the legal target, capture, then release outside (cancel).
  const from = await dbg.piecePos(page, move.pieceId);
  const to = await dbg.systemPos(page, move.toSystemId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await saveScreenshot(page, '08-move-drag-preview');
  await page.mouse.move(from.x, from.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => dbg.isDragging(page)).toBe(false);

  const illegal = await dbg.systemPos(page, move.illegalSystemId);
  await mouseDrag(page, await dbg.piecePos(page, move.pieceId), illegal);
  await expect(page.getByTestId(T.feedback)).toBeVisible();
  await saveScreenshot(page, '09-illegal-move-feedback');

  await selectPiece(page, move);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  expect((await cmd).status()).toBe(200);
  await openSidebarTab(page, 'log');
  await saveScreenshot(page, '10-event-log-after-move');

  await page.reload();
  await openGame(page, gameId);
  await saveScreenshot(page, '11-after-reload');

  for (const phase of ['command', 'refresh', 'assignment']) {
    const c = waitForCommand(page);
    await page.getByTestId(T.advancePhase).click();
    expect((await c).status()).toBe(200);
    await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', phase);
  }
  await saveScreenshot(page, '12-phase-advanced');

  await page.goto('/settings');
  await saveScreenshot(page, '13-settings-ru');
  await page.getByTestId(T.settingsLanguage('en')).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await saveScreenshot(page, '14-settings-en');
  await openGame(page, gameId);
  await saveScreenshot(page, '14b-board-en');

  // 15: visible keyboard focus in the objects list
  await openSidebarTab(page, 'objects');
  await page.getByTestId(T.pieceItem(move.pieceId)).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await saveScreenshot(page, '15-keyboard-focus');
});
