// SWR-003 screenshots (SWR-003 test-cases.md §10, TC-E2E-33 successor), 1440×900, reduced motion.
// SWR-004: kept as a regression walk, but its PNGs are routed by support/board.ts `saveScreenshot`: by default they go to
// the untracked test-results/screenshots/SWR-003/; docs/tasks/SWR-003/artifacts/screenshots/ is rewritten only when
// `SCREENSHOT_TASK=SWR-003` is set (deliberate regeneration). SWR-002 screenshots are never touched.
// 01-catalog and 02-game-page-empty are captured by 00-empty-db.spec.ts (need an empty DB).
// Platform screens: 01b, 03–09. Table regression (SWR-002 04–15 on the new routes): table-NN-*.
import { expect, test, type Page } from '@playwright/test';
import {
  createSession,
  FORBIDDEN_STARS,
  pickMove,
  REBELLION,
  type MoveFixture,
} from './support/api';
import {
  dbg,
  emptyCanvasPoint,
  gamePath,
  keyboardFocus,
  mouseDrag,
  newSessionPath,
  openSession,
  openSidebarTab,
  saveScreenshot,
  sessionPath,
  waitForCommand,
  waitViewportStable,
} from './support/board';
import { RECENT_SESSION_ITEM, T } from './support/testids';

const SWR003 = 'SWR-003';

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

async function selectPiece(page: Page, move: MoveFixture) {
  const pos = await dbg.piecePos(page, move.pieceId);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: move.pieceId });
}

test('SWR-003 platform screenshots: catalog, game pages, new session, session table, not-found', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const { sessionId } = await createSession(request);

  // 09: keyboard focus on the first catalog card (TC-CAT-11)
  await page.goto('/');
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  await keyboardFocus(page, page.getByTestId(T.gameCard(REBELLION)));
  await saveScreenshot(page, '09-catalog-keyboard-focus', SWR003);

  // 03: game page with sessions (TC-GP-15)
  await page.goto(gamePath(REBELLION));
  await expect(page.getByTestId(T.gameContinue)).toBeEnabled();
  await expect(page.getByTestId(T.gameRecentSessions).locator(RECENT_SESSION_ITEM)).not.toHaveCount(
    0,
  );
  await saveScreenshot(page, '03-game-page-with-sessions', SWR003);

  // 04: coming_soon game page and its /new (TC-GP-16)
  await page.goto(gamePath(FORBIDDEN_STARS));
  await expect(page.getByTestId(T.gameComingSoon)).toBeVisible();
  await saveScreenshot(page, '04-game-page-coming-soon', SWR003);
  await page.goto(newSessionPath(FORBIDDEN_STARS));
  await expect(page.getByTestId(T.gameComingSoon)).toBeVisible();
  await saveScreenshot(page, '04b-new-session-coming-soon', SWR003);

  // 05: new session screen of Rebellion (TC-NEW-05)
  await page.goto(newSessionPath(REBELLION));
  await page.getByTestId(T.setupOpponent('ai')).click();
  await page.getByTestId(T.setupDifficultyOption('normal')).click();
  await saveScreenshot(page, '05-new-session', SWR003);

  // 06: session host with the Rebellion table (TC-NEW-05, TC-HOST-01)
  await openSession(page, sessionId);
  await expect(page.getByTestId(T.sessionHost)).toHaveAttribute('data-session-id', sessionId);
  await saveScreenshot(page, '06-session-table', SWR003);

  // 07 / 08: not found (TC-GP-17, TC-HOST-08)
  await page.goto(gamePath('does-not-exist'));
  await expect(page.getByTestId(T.gameNotFound)).toBeVisible();
  await saveScreenshot(page, '07-game-not-found', SWR003);
  await page.goto(sessionPath('does-not-exist'));
  await expect(page.getByTestId(T.sessionNotFound)).toBeVisible();
  await saveScreenshot(page, '08-session-not-found', SWR003);

  // 01b: catalog in English (TC-CAT-12)
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage('en')).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  await saveScreenshot(page, '01b-catalog-en', SWR003);
});

test('TC-E2E-33 (SWR-003 routes): table regression screenshots', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { sessionId, view } = await createSession(request);
  const move = pickMove(view);

  await openSession(page, sessionId);
  await saveScreenshot(page, 'table-04-board-initial', SWR003);

  await page.getByTestId(T.zoomIn).click();
  const start = await emptyCanvasPoint(page, view);
  await mouseDrag(page, start, { x: start.x + 120, y: start.y + 60 });
  await waitViewportStable(page);
  await saveScreenshot(page, 'table-05-board-zoomed-panned', SWR003);
  await page.getByTestId(T.zoomFit).click();
  await waitViewportStable(page);

  const sys = await dbg.systemPos(page, move.fromSystemId);
  await page.mouse.click(sys.x, sys.y);
  await expect(page.getByTestId(T.systemPanel)).toBeVisible();
  await saveScreenshot(page, 'table-06-system-panel', SWR003);

  await selectPiece(page, move);
  await expect(page.getByTestId(T.actionPanel)).toBeVisible();
  await saveScreenshot(page, 'table-07-piece-actions', SWR003);

  // drag preview: hold the mouse over the legal target, capture, then release outside (cancel).
  const from = await dbg.piecePos(page, move.pieceId);
  const to = await dbg.systemPos(page, move.toSystemId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await saveScreenshot(page, 'table-08-move-drag-preview', SWR003);
  await page.mouse.move(from.x, from.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => dbg.isDragging(page)).toBe(false);

  const illegal = await dbg.systemPos(page, move.illegalSystemId);
  await mouseDrag(page, await dbg.piecePos(page, move.pieceId), illegal);
  await expect(page.getByTestId(T.feedback)).toBeVisible();
  await saveScreenshot(page, 'table-09-illegal-move-feedback', SWR003);

  await selectPiece(page, move);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  expect((await cmd).status()).toBe(200);
  await openSidebarTab(page, 'log');
  await saveScreenshot(page, 'table-10-event-log-after-move', SWR003);

  await page.reload();
  await openSession(page, sessionId);
  await saveScreenshot(page, 'table-11-after-reload', SWR003);

  for (const phase of ['command', 'refresh', 'assignment']) {
    const c = waitForCommand(page);
    await page.getByTestId(T.advancePhase).click();
    expect((await c).status()).toBe(200);
    await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', phase);
  }
  await saveScreenshot(page, 'table-12-phase-advanced', SWR003);

  await page.goto('/settings');
  await saveScreenshot(page, 'table-13-settings-ru', SWR003);
  await page.getByTestId(T.settingsLanguage('en')).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await saveScreenshot(page, 'table-14-settings-en', SWR003);
  await openSession(page, sessionId);
  await saveScreenshot(page, 'table-14b-board-en', SWR003);

  // 15: visible keyboard focus in the objects list
  await openSidebarTab(page, 'objects');
  await page.getByTestId(T.pieceItem(move.pieceId)).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await saveScreenshot(page, 'table-15-keyboard-focus', SWR003);
});
