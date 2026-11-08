// TC-E2E-02 → TC-GP-13 (AC-2, AC-4) + SWR-003 screenshots 01-catalog, 02-game-page-empty (SWR-003 test-cases.md §10).
// SWR-004: these screenshots belong to SWR-003 and are written to test-results/screenshots/SWR-003/ unless
// `SCREENSHOT_TASK=SWR-003` (support/board.ts saveScreenshot routing) — SWR-003 evidence is not rewritten.
// Must run FIRST on the fresh e2e DB: requires `workers: 1` (files run alphabetically, `00-` sorts first).
import { expect, test } from '@playwright/test';
import { listSessions, REBELLION } from './support/api';
import { gamePath, saveScreenshot, urlOf } from './support/board';
import { RECENT_SESSION_ITEM, T } from './support/testids';

const SWR003 = 'SWR-003';

test.describe('empty database', () => {
  test.use({ reducedMotion: 'reduce' });

  test('TC-GP-13 (was TC-E2E-02): catalog → Rebellion page with no sessions — Continue is disabled', async ({
    page,
    request,
  }) => {
    const sessions = await listSessions(request);
    expect(
      sessions,
      'e2e DB must be empty: this file has to run before any spec that creates sessions (workers: 1)',
    ).toEqual([]);

    await page.goto('/');
    await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
    await expect(page.getByTestId(T.gameCard(REBELLION))).toBeVisible();
    await expect(page.getByTestId(T.navSettings)).toBeVisible();
    await expect(
      page.getByTestId(T.gameCard(REBELLION)).getByTestId(T.gameCardCover),
    ).toHaveJSProperty('complete', true);
    await saveScreenshot(page, '01-catalog', SWR003);

    const listed = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === '/api/sessions' &&
        new URL(r.url()).searchParams.get('gameId') === REBELLION,
    );
    await page.getByTestId(T.gameCard(REBELLION)).click();
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    expect((await listed).status()).toBe(200);

    const gamePage = page.getByTestId(T.gamePage);
    await expect(gamePage).toHaveAttribute('data-game-id', REBELLION);
    await expect(gamePage).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId(T.gameNewSession)).toBeEnabled();
    const cont = page.getByTestId(T.gameContinue);
    await expect(cont).toBeVisible();
    await expect(cont).toBeDisabled();
    await expect(page.locator(RECENT_SESSION_ITEM)).toHaveCount(0);

    await saveScreenshot(page, '02-game-page-empty', SWR003);

    await cont.click({ force: true }).catch(() => undefined);
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    // TC-GP-18 (disabled part): Enter on the disabled button does not navigate either.
    await cont.focus().catch(() => undefined);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
  });
});
