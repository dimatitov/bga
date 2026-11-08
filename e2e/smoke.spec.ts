import { expect, test } from '@playwright/test';

// W0 smoke: API health through the web proxy, and "/" loads without console errors (TC-E2E-01 base).
test('api health is reachable through the web proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('home page loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#root')).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(errors).toEqual([]);
});
