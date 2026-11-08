import { expect, test } from '@playwright/test';
import { T } from './support/testids';

// W0 smoke: API health through the web proxy, and "/" (the catalog since SWR-003) loads without console errors
// (TC-E2E-01 base, TC-CAT-10 base).
test('api health is reachable through the web proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('TC-E2E-01 (SWR-003: catalog): home page loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#root')).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  expect(errors).toEqual([]);
});
