// Scenario 8 — settings: TC-E2E-25, TC-E2E-26, TC-E2E-27 (AC-3, AC-10).
import { expect, test, type Page } from '@playwright/test';
import { createGame } from './support/api';
import { openGame, waitViewportStable, dbg } from './support/board';
import { CYRILLIC, T } from './support/testids';

async function setLanguage(page: Page, lang: 'ru' | 'en') {
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage(lang)).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test('TC-E2E-25: switching ru → en → ru changes the UI language and persists over reload', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  // textContent, not innerText: MUI buttons are CSS-uppercased (innerText reflects text-transform).
  const ruLabel = ((await page.getByTestId(T.menuNewGame).textContent()) ?? '').trim();
  expect(ruLabel).toMatch(CYRILLIC);

  await setLanguage(page, 'en');
  await page.goto('/');
  const enLabel = ((await page.getByTestId(T.menuNewGame).textContent()) ?? '').trim();
  expect(enLabel).not.toMatch(CYRILLIC);
  expect(enLabel).not.toBe(ruLabel);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId(T.menuNewGame)).toHaveText(enLabel);

  const { gameId } = await createGame(request);
  await openGame(page, gameId);
  await expect(page.getByTestId(T.contextPanel)).not.toContainText(CYRILLIC);

  await setLanguage(page, 'ru');
  await page.goto('/');
  await expect(page.getByTestId(T.menuNewGame)).toHaveText(ruLabel);
});

test('TC-E2E-26: in English no Cyrillic text remains on the main screens (incl. system names)', async ({
  page,
  request,
}) => {
  await setLanguage(page, 'en');
  const { gameId } = await createGame(request);
  const screens: [string, () => Promise<void>][] = [
    ['/', () => page.goto('/').then(() => undefined)],
    ['/games/new', () => page.goto('/games/new').then(() => undefined)],
    [`/games/${gameId}`, () => openGame(page, gameId)],
    ['/settings', () => page.goto('/settings').then(() => undefined)],
  ];
  for (const [name, open] of screens) {
    await open();
    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    const hits = text.match(new RegExp(`.{0,20}${CYRILLIC.source}+.{0,20}`, 'g')) ?? [];
    expect(hits, `Cyrillic on ${name}`).toEqual([]);
  }
  // Hidden tabs of the table (objects list) also carry translated system names.
  const listText = await page
    .goto(`/games/${gameId}`)
    .then(() => page.getByTestId(T.boardList).evaluate((el) => el.textContent ?? ''));
  expect(listText).not.toMatch(CYRILLIC);
});

test('TC-E2E-27: reduce motion toggles the documented flag, persists and makes zoom instant', async ({
  page,
  request,
}) => {
  const flag = () => page.evaluate(() => document.documentElement.dataset.reducedMotion ?? null);
  await page.goto('/settings');
  const toggle = page.getByTestId(T.settingsReduceMotion);
  const initial = await flag();
  if (initial === 'true') {
    await toggle.click(); // default follows prefers-reduced-motion; start from "off"
    await expect.poll(flag).not.toBe('true');
  }
  await toggle.click();
  await expect.poll(flag).toBe('true');

  await page.reload();
  await expect.poll(flag).toBe('true');

  const { gameId } = await createGame(request);
  await openGame(page, gameId);
  const s0 = (await dbg.viewport(page)).scale;
  await page.getByTestId(T.zoomIn).click();
  // Without tween the target scale is applied immediately (no intermediate values).
  const right = (await dbg.viewport(page)).scale;
  await waitViewportStable(page);
  expect(right).toBeGreaterThan(s0);
  expect((await dbg.viewport(page)).scale).toBeCloseTo(right, 6);
});
