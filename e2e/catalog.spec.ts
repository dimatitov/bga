// SWR-003 catalog `/` and non-playable game routes: TC-CAT-10, TC-CAT-11, TC-CAT-12, TC-GP-16, TC-GP-17
// (+ e2e parts of TC-GP-10, TC-FS-05) — AC-1, AC-2, AC-6.
// Independent of DB contents (catalog is static from the web registry, Q-1). Screenshots: screenshots.spec.ts.
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { EMPIRE_VS_AI, FORBIDDEN_STARS, REBELLION, type ErrorBody } from './support/api';
import { gamePath, isFocused, newSessionPath, urlOf } from './support/board';
import { CYRILLIC, T } from './support/testids';

/** Registry order (Q-2: available games first). Names are proper names, never translated (Q-11). */
const GAMES = [
  { id: REBELLION, name: 'Star Wars: Rebellion', status: 'available' },
  { id: FORBIDDEN_STARS, name: 'Forbidden Stars', status: 'coming_soon' },
] as const;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
  return errors;
}

async function setLanguage(page: Page, lang: 'ru' | 'en') {
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage(lang)).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

const cover = (card: Locator) => card.getByTestId(T.gameCardCover);

test('TC-CAT-10: catalog shows registry cards with name, loaded cover, description, status; card opens the game page', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const catalog = page.getByTestId(T.gameCatalog);
  await expect(catalog).toBeVisible();

  // Cards are links (TR-1); `game-card-status` also has data-status, so select by tag, not by attribute.
  const cards = catalog.locator('a[data-testid^="game-card-"]');
  await expect(cards).toHaveCount(GAMES.length);
  const order = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(order, 'registry order, available first (Q-2)').toEqual(
    GAMES.map((g) => T.gameCard(g.id)),
  );

  for (const g of GAMES) {
    const card = page.getByTestId(T.gameCard(g.id));
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-status', g.status);
    await expect(card).toHaveAttribute('href', gamePath(g.id));
    await expect(card.getByTestId(T.gameCardName)).toHaveText(g.name);
    await expect(card.getByTestId(T.gameCardDescription)).not.toBeEmpty();
    await expect(card.getByTestId(T.gameCardStatus)).toHaveAttribute('data-status', g.status);
    await expect(card.getByTestId(T.gameCardStatus)).not.toBeEmpty();
    await expect(card.getByTestId(T.gameCardPlayers)).toContainText(g.id === REBELLION ? '2' : '4');
    await expect(card.getByTestId(T.gameCardAi)).toBeVisible();

    const img = cover(card);
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('alt', /\S/);
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        message: `cover of ${g.id} is decoded`,
      })
      .toBeGreaterThan(0);
    const alt = (await img.getAttribute('alt')) ?? '';
    expect(alt, 'alt is a translated text, not a file name').not.toMatch(/\.(svg|png|jpe?g)$/i);
  }

  await page.getByTestId(T.gameCard(REBELLION)).click();
  await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
  await expect(page.getByTestId(T.gamePage)).toHaveAttribute('data-game-id', REBELLION);
  expect(errors, 'no console errors and no 4xx/5xx responses').toEqual([]);
});

/** Presses Tab until `target` is focused; every step must show a visible focus. Returns the testids seen. */
async function tabTo(page: Page, target: Locator, maxSteps = 60): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    if (await isFocused(target)) return seen;
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        testId: el?.getAttribute('data-testid') ?? el?.tagName ?? '',
        focusVisible: !el || el === document.body ? true : el.matches(':focus-visible'),
      };
    });
    expect(state.focusVisible, `focus on ${state.testId} must be :focus-visible`).toBe(true);
    seen.push(state.testId);
  }
  throw new Error(`could not reach target by Tab in ${maxSteps} steps`);
}

test('TC-CAT-11: cards are reachable by Tab in registry order with visible focus; Enter opens each game page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  const r = page.getByTestId(T.gameCard(REBELLION));
  const fs = page.getByTestId(T.gameCard(FORBIDDEN_STARS));

  const beforeR = await tabTo(page, r);
  expect(beforeR, 'Forbidden Stars card is focused after Rebellion').not.toContain(
    T.gameCard(FORBIDDEN_STARS),
  );
  await expect(r).toBeFocused();
  expect(await r.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));

  await page.goBack();
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  await tabTo(page, fs);
  await expect(fs).toBeFocused();
  await page.keyboard.press('Enter');
  // coming_soon games also have a page (AC-2).
  await expect(page).toHaveURL(urlOf(gamePath(FORBIDDEN_STARS)));
  await expect(page.getByTestId(T.gamePage)).toHaveAttribute('data-status', 'coming_soon');
});

test('TC-CAT-12: catalog in English has no Cyrillic (incl. alt), in Russian it is translated; <html lang> follows', async ({
  page,
}) => {
  await setLanguage(page, 'en');
  await page.goto('/');
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const text = await page.locator('body').innerText();
  const hits = text.match(new RegExp(`.{0,20}${CYRILLIC.source}+.{0,20}`, 'g')) ?? [];
  expect(hits, 'Cyrillic on the English catalog').toEqual([]);
  const alts = await page
    .getByTestId(T.gameCatalog)
    .locator('img')
    .evaluateAll((els) => els.map((el) => el.getAttribute('alt') ?? ''));
  expect(alts.length).toBeGreaterThanOrEqual(GAMES.length);
  for (const alt of alts) {
    expect(alt).toMatch(/\S/);
    expect(alt).not.toMatch(CYRILLIC);
  }
  for (const g of GAMES) {
    await expect(page.getByTestId(T.gameCard(g.id)).getByTestId(T.gameCardName)).toHaveText(g.name);
  }

  await setLanguage(page, 'ru');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  for (const g of GAMES) {
    const card = page.getByTestId(T.gameCard(g.id));
    await expect(card.getByTestId(T.gameCardName)).toHaveText(g.name);
    await expect(card.getByTestId(T.gameCardStatus)).toContainText(CYRILLIC);
    await expect(card.getByTestId(T.gameCardDescription)).toContainText(CYRILLIC);
  }
});

const isSessionsCall = (r: Request) => new URL(r.url()).pathname.startsWith('/api/sessions');

test('TC-GP-16: coming_soon game page and its /new show "coming soon", actions disabled, no session requests', async ({
  page,
}) => {
  const sessionCalls: string[] = [];
  page.on('request', (r) => {
    if (isSessionsCall(r)) sessionCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });

  await page.goto('/');
  await page.getByTestId(T.gameCard(FORBIDDEN_STARS)).click();
  await expect(page).toHaveURL(urlOf(gamePath(FORBIDDEN_STARS)));
  const gamePage = page.getByTestId(T.gamePage);
  await expect(gamePage).toHaveAttribute('data-game-id', FORBIDDEN_STARS);
  await expect(gamePage).toHaveAttribute('data-status', 'coming_soon');
  await expect(page.getByTestId(T.gameComingSoon)).toBeVisible();
  await expect(page.getByTestId(T.gamePageName)).toHaveText('Forbidden Stars');
  for (const id of [T.gameNewSession, T.gameContinue]) {
    const action = page.getByTestId(id);
    await expect(action).toBeVisible();
    await expect(action).toBeDisabled();
    await action.click({ force: true }).catch(() => undefined);
    await expect(page).toHaveURL(urlOf(gamePath(FORBIDDEN_STARS)));
  }

  // Q-17: `/new` renders "coming soon" in place — no redirect, no setup form.
  await page.goto(newSessionPath(FORBIDDEN_STARS));
  await expect(page.getByTestId(T.gameComingSoon)).toBeVisible();
  await expect(page).toHaveURL(urlOf(newSessionPath(FORBIDDEN_STARS)));
  await expect(page.getByTestId(T.setupStart)).toHaveCount(0);
  await expect(page.locator('[data-testid^="setup-faction"]')).toHaveCount(0);

  await page.waitForTimeout(300);
  // Q-16: sessions of a coming_soon game are not requested at all (so neither GET nor POST).
  expect(sessionCalls).toEqual([]);
});

test('TC-FS-05 (e2e part): sessions API refuses a coming_soon game (422) and an unknown game (404)', async ({
  request,
}) => {
  const soon = await request.post('/api/sessions', {
    data: { gameId: FORBIDDEN_STARS, setup: EMPIRE_VS_AI },
  });
  expect(soon.status()).toBe(422);
  expect((await soon.json()) as ErrorBody).toMatchObject({
    ok: false,
    error: { code: 'GAME_UNAVAILABLE', messageKey: 'errors.gameUnavailable' },
  });

  const unknown = await request.post('/api/sessions', {
    data: { gameId: 'does-not-exist', setup: EMPIRE_VS_AI },
  });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()) as ErrorBody).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND', messageKey: 'errors.gameNotFound' },
  });

  const list = await request.get(`/api/sessions?gameId=${FORBIDDEN_STARS}`);
  expect(list.status()).toBe(200);
  expect(await list.json()).toEqual([]);
});

test('TC-GP-17: unknown game id (page and /new) shows "game not found"; its link leads to the catalog', async ({
  page,
}) => {
  const sessionCalls: string[] = [];
  page.on('request', (r) => {
    if (isSessionsCall(r)) sessionCalls.push(`${r.method()} ${r.url()}`);
  });

  // TC-GP-10 (e2e): unknown game on the new-session route.
  await page.goto(newSessionPath('does-not-exist'));
  await expect(page.getByTestId(T.gameNotFound)).toBeVisible();
  await expect(page.getByTestId(T.setupStart)).toHaveCount(0);

  await page.goto(gamePath('does-not-exist'));
  const nf = page.getByTestId(T.gameNotFound);
  await expect(nf).toBeVisible();
  await expect(page.getByTestId(T.gamePage)).toHaveCount(0);
  await expect(page.getByTestId(T.gameTable)).toHaveCount(0);
  expect(sessionCalls, 'no sessions requests for an unknown game').toEqual([]);

  const back = nf.getByRole('link').first();
  await expect(back).toHaveAttribute('href', '/');
  await back.click();
  await expect(page).toHaveURL(urlOf('/'));
  await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
});
