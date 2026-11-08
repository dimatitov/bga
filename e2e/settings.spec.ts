// Scenario 8 — settings: TC-E2E-25, TC-E2E-26, TC-E2E-27 (+ TC-CAT-12 language part) — AC-3, AC-1.
// SWR-003: the language check reads the catalog (`game-card-status`) instead of the removed main menu; the
// "no Cyrillic in English" walk covers catalog, game page, new-session screen, session table and settings.
import { expect, test, type Page } from '@playwright/test';
import { createSession, REBELLION } from './support/api';
import { dbg, gamePath, newSessionPath, openSession, waitViewportStable } from './support/board';
import { CYRILLIC, T } from './support/testids';

async function setLanguage(page: Page, lang: 'ru' | 'en') {
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage(lang)).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** Status chip of the Rebellion card on the catalog — a translated, language-dependent label. */
const statusLabel = (page: Page) =>
  page.getByTestId(T.gameCard(REBELLION)).getByTestId(T.gameCardStatus);

test('TC-E2E-25: switching ru → en → ru changes the UI language and persists over reload', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  // textContent, not innerText: MUI chips/buttons may be CSS-uppercased (innerText reflects text-transform).
  const ruLabel = ((await statusLabel(page).textContent()) ?? '').trim();
  expect(ruLabel).toMatch(CYRILLIC);

  await setLanguage(page, 'en');
  await page.goto('/');
  const enLabel = ((await statusLabel(page).textContent()) ?? '').trim();
  expect(enLabel).not.toMatch(CYRILLIC);
  expect(enLabel).not.toBe(ruLabel);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(statusLabel(page)).toHaveText(enLabel);

  const { sessionId } = await createSession(request);
  await openSession(page, sessionId);
  await expect(page.getByTestId(T.contextPanel)).not.toContainText(CYRILLIC);

  await setLanguage(page, 'ru');
  await page.goto('/');
  await expect(statusLabel(page)).toHaveText(ruLabel);
});

test('TC-E2E-26: in English no Cyrillic text remains on the main screens (incl. system names)', async ({
  page,
  request,
}) => {
  await setLanguage(page, 'en');
  const { sessionId } = await createSession(request);
  // Each screen is read only after its main element is visible (lazy game chunks, sessions list).
  const goto = (url: string, ready: string) => async () => {
    await page.goto(url);
    await expect(page.getByTestId(ready)).toBeVisible();
  };
  const screens: [string, () => Promise<void>][] = [
    ['/', goto('/', T.gameCatalog)],
    [gamePath(REBELLION), goto(gamePath(REBELLION), T.gamePage)],
    [newSessionPath(REBELLION), goto(newSessionPath(REBELLION), T.setupStart)],
    [`/sessions/${sessionId}`, () => openSession(page, sessionId)],
    ['/settings', goto('/settings', T.settingsReduceMotion)],
  ];
  for (const [name, open] of screens) {
    await open();
    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    const hits = text.match(new RegExp(`.{0,20}${CYRILLIC.source}+.{0,20}`, 'g')) ?? [];
    expect(hits, `Cyrillic on ${name}`).toEqual([]);
  }
  // Hidden tabs of the table (objects list) also carry translated system names.
  await openSession(page, sessionId);
  const listText = await page.getByTestId(T.boardList).evaluate((el) => el.textContent ?? '');
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

  const { sessionId } = await createSession(request);
  await openSession(page, sessionId);
  const s0 = (await dbg.viewport(page)).scale;
  await page.getByTestId(T.zoomIn).click();
  // Without tween the target scale is applied immediately (no intermediate values).
  const right = (await dbg.viewport(page)).scale;
  await waitViewportStable(page);
  expect(right).toBeGreaterThan(s0);
  expect((await dbg.viewport(page)).scale).toBeCloseTo(right, 6);
});
