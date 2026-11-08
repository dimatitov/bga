// TC-E2E-02 (AC-3, AC-10 сц. 2) + AC-11 screenshot 01.
// Must run FIRST on the fresh e2e DB: requires `workers: 1` (files run alphabetically) — see report config diff.
import { expect, test } from '@playwright/test';
import { listGames } from './support/api';
import { saveScreenshot } from './support/board';
import { T } from './support/testids';

test.describe('empty database', () => {
  test.use({ reducedMotion: 'reduce' });

  test('TC-E2E-02: main menu with no saved games — Continue is disabled', async ({
    page,
    request,
  }) => {
    const games = await listGames(request);
    expect(
      games,
      'e2e DB must be empty: this file has to run before any spec that creates games (workers: 1)',
    ).toEqual([]);

    await page.goto('/');
    await expect(page.getByTestId(T.menuNewGame)).toBeEnabled();
    await expect(page.getByTestId(T.menuSettings)).toBeEnabled();
    const cont = page.getByTestId(T.menuContinue);
    await expect(cont).toBeVisible();
    await expect(cont).toBeDisabled();
    await expect(page.locator('[data-testid^="recent-game-"]')).toHaveCount(0);

    await saveScreenshot(page, '01-main-menu-empty');

    await cont.click({ force: true }).catch(() => undefined);
    await expect(page).toHaveURL(/\/$/);
  });
});
