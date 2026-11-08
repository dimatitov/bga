// SWR-003 game page `/games/:gameId`, new-session screen and session host: TC-GP-18, TC-NEW-04 (e2e),
// TC-HOST-07, TC-HOST-08 (+ e2e part of TC-GP-01, TC-HOST-01) — AC-2, AC-3, AC-4.
// Does NOT need an empty DB (TR-10): every test creates the sessions it relies on. Screenshots: screenshots.spec.ts.
import { expect, test } from '@playwright/test';
import { createSession, listSessions, REBELLION } from './support/api';
import {
  gamePath,
  keyboardFocus,
  newSessionPath,
  openSession,
  sessionPath,
  urlOf,
  waitForTable,
} from './support/board';
import { RECENT_SESSION_ITEM, T } from './support/testids';

test('TC-GP-01 (e2e): Rebellion game page shows cover, name, description, players, AI and both actions', async ({
  page,
  request,
}) => {
  await createSession(request);
  await page.goto(gamePath(REBELLION));
  const gamePage = page.getByTestId(T.gamePage);
  await expect(gamePage).toHaveAttribute('data-game-id', REBELLION);
  await expect(gamePage).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId(T.gamePageName)).toHaveText('Star Wars: Rebellion');
  await expect(page.getByTestId(T.gamePageDescription)).not.toBeEmpty();
  await expect(page.getByTestId(T.gamePagePlayers)).toContainText('2');
  await expect(page.getByTestId(T.gamePageAi)).toBeVisible();
  const cover = page.getByTestId(T.gamePageCover);
  await expect(cover).toHaveAttribute('alt', /\S/);
  await expect
    .poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByTestId(T.gameComingSoon)).toHaveCount(0);
  await expect(page.getByTestId(T.gameNewSession)).toBeEnabled();
  await expect(page.getByTestId(T.gameContinue)).toBeEnabled();
  await expect(page.getByTestId(T.gameRecentSessions).locator(RECENT_SESSION_ITEM)).not.toHaveCount(
    0,
  );
});

test('TC-GP-18: keyboard only — "New session" and "Continue" are reachable and activate with Enter', async ({
  page,
  request,
}) => {
  const { sessionId } = await createSession(request);
  const latest = (await listSessions(request, REBELLION))[0]?.sessionId;
  expect(latest, 'the session just created is the latest one').toBe(sessionId);

  await page.goto(gamePath(REBELLION));
  const newSession = page.getByTestId(T.gameNewSession);
  const cont = page.getByTestId(T.gameContinue);
  await expect(cont).toBeEnabled(); // sessions list loaded

  await keyboardFocus(page, newSession);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(urlOf(newSessionPath(REBELLION)));
  await expect(page.getByTestId(T.setupStart)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
  await expect(cont).toBeEnabled();
  await keyboardFocus(page, cont);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
  await waitForTable(page, sessionId);
});

test('TC-NEW-04 (e2e): the new-session screen links back to the game page', async ({ page }) => {
  await page.goto(newSessionPath(REBELLION));
  await expect(page.getByTestId(T.setupStart)).toBeVisible();
  const back = page.getByTestId(T.newSessionBackToGame);
  await expect(back).toHaveAttribute('href', gamePath(REBELLION));
  await back.click();
  await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
  await expect(page.getByTestId(T.gamePage)).toBeVisible();
});

test('TC-HOST-07: session host → "back to game" → game page lists the session and continues it', async ({
  page,
  request,
}) => {
  const { sessionId } = await createSession(request);
  await openSession(page, sessionId);

  // TC-HOST-01 (e2e): the host dispatches by the server's gameId.
  const host = page.getByTestId(T.sessionHost);
  await expect(host).toHaveAttribute('data-session-id', sessionId);
  await expect(host).toHaveAttribute('data-game-id', REBELLION);

  // The host and the Rebellion table header may both render the link (plan-frontend §7.1) — same target.
  const back = page.getByTestId(T.sessionBackToGame).first();
  await expect(back).toHaveAttribute('href', gamePath(REBELLION));
  await back.click();
  await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));

  await expect(
    page.getByTestId(T.gameRecentSessions).getByTestId(T.recentSession(sessionId)),
  ).toBeVisible();
  const cont = page.getByTestId(T.gameContinue);
  await expect(cont).toBeEnabled();
  await cont.click();
  await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
  await waitForTable(page, sessionId);
});

test('TC-HOST-08: unknown session id shows "session not found" with a way to the catalog', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const lookup = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/sessions/does-not-exist',
  );
  await page.goto(sessionPath('does-not-exist'));
  const res = await lookup;
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' },
  });

  const nf = page.getByTestId(T.sessionNotFound);
  await expect(nf).toBeVisible();
  await expect(page.getByTestId(T.gameTable)).toHaveCount(0);
  await expect(page.getByTestId(T.sessionHost)).toHaveCount(0);
  const toCatalog = nf.getByRole('link').first();
  await expect(toCatalog).toHaveAttribute('href', '/');
  await toCatalog.click();
  await expect(page).toHaveURL(urlOf('/'));
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  expect(errors).toEqual([]);
});
