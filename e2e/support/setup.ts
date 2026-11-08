// SWR-004 helpers for the Rebellion new-session form (`/games/star-wars-rebellion/new`, plan-frontend §2, §4):
// defaults (AC-02), request interception for TC-005/TC-006 (TR-3: `page.route` only), session-count bookkeeping.
import {
  expect,
  type APIRequestContext,
  type Page,
  type Request,
  type Route,
} from '@playwright/test';
import { API, listSessions, type Faction, type OpponentType } from './api';
import { T } from './testids';

/** True for `POST /api/sessions` (create), not for `/commands`. */
export function isCreatePost(r: Request): boolean {
  return r.method() === 'POST' && API.sessions.test(new URL(r.url()).pathname);
}

export function waitCreate(page: Page) {
  return page.waitForResponse((r) => isCreatePost(r.request()));
}

/** `Idempotency-Key` header of a request (Playwright lower-cases header names). */
export const idempotencyKeyOf = (r: Request): string | undefined => r.headers()['idempotency-key'];

/** URL matcher of `/api/sessions` exactly (any query) — for `page.route`/`page.unroute`. */
export const SESSIONS_URL = (url: URL): boolean => API.sessions.test(url.pathname);

/**
 * Intercepts only `POST /api/sessions`; every other request on the same URL (`GET` list) falls through.
 * Returns the matcher to pass to `page.unroute`.
 */
export async function routeCreate(
  page: Page,
  onCreate: (route: Route) => Promise<void>,
): Promise<(url: URL) => boolean> {
  await page.route(SESSIONS_URL, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return onCreate(route);
  });
  return SESSIONS_URL;
}

/** Records every `POST /api/sessions` sent by the page (count + idempotency keys). */
export function recordCreates(page: Page): {
  requests: Request[];
  keys: () => (string | undefined)[];
} {
  const requests: Request[] = [];
  page.on('request', (r) => {
    if (isCreatePost(r)) requests.push(r);
  });
  return { requests, keys: () => requests.map(idempotencyKeyOf) };
}

/** Session ids currently returned by `GET /api/sessions` (newest 20). */
export async function sessionIds(request: APIRequestContext): Promise<string[]> {
  return (await listSessions(request)).map((s) => s.sessionId);
}

/**
 * Ids that appear in the list now but not in `before`. New sessions are the newest, so they are always inside the
 * 20-item window even when older ones drop out of it.
 */
export async function newSessionIdsSince(
  request: APIRequestContext,
  before: string[],
): Promise<string[]> {
  const known = new Set(before);
  return (await sessionIds(request)).filter((id) => !known.has(id));
}

export async function expectChecked(page: Page, testId: string, checked = true): Promise<void> {
  await expect(page.getByTestId(testId)).toHaveAttribute('aria-checked', String(checked));
}

/** Selected faction card: `aria-checked` + `data-selected` (not colour only, plan-frontend §2.2). */
export async function expectFaction(page: Page, faction: Faction): Promise<void> {
  const other: Faction = faction === 'rebels' ? 'empire' : 'rebels';
  const card = page.getByTestId(T.setupFaction(faction));
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect(card).toHaveAttribute('role', 'radio');
  await expect(page.getByTestId(T.setupFaction(other))).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId(T.setupFaction(other))).not.toHaveAttribute(
    'data-selected',
    'true',
  );
}

/** Opponent caption names the opponent faction (`data-opponent-faction`, computed client-side by `opponentOf`). */
export async function expectCaption(page: Page, opponentFaction: Faction): Promise<void> {
  const caption = page.getByTestId(T.setupOpponentCaption);
  await expect(caption).toBeVisible();
  await expect(caption).toHaveAttribute('data-opponent-faction', opponentFaction);
  await expect(caption).not.toBeEmpty();
}

export async function expectOpponent(page: Page, type: OpponentType): Promise<void> {
  await expectChecked(page, T.setupOpponent(type), true);
  await expectChecked(page, T.setupOpponent(type === 'ai' ? 'human' : 'ai'), false);
  if (type === 'ai') await expect(page.getByTestId(T.setupDifficulty)).toBeVisible();
  // human: the difficulty block is unmounted (Collapse unmountOnExit) — not visible, not in the a11y tree.
  else await expect(page.getByTestId(T.setupDifficulty)).toBeHidden();
}

/** Unavailable options are shown, marked `aria-disabled`, and never selected (AC-05 client). */
export async function expectUnavailableOptions(page: Page): Promise<void> {
  for (const id of [
    T.setupRulesetOption('rise-of-the-empire'),
    T.setupModeOption('physical_companion'),
  ]) {
    const opt = page.getByTestId(id);
    await expect(opt).toBeVisible();
    await expect(opt).toHaveAttribute('aria-disabled', 'true');
    await expect(opt).toHaveAttribute('aria-checked', 'false');
  }
}

/** AC-02: Rebels, AI (plays the Empire), Normal, Base, Digital; start enabled; prototype note shown. */
export async function expectFormDefaults(page: Page): Promise<void> {
  await expect(page.getByTestId(T.setupFactionGroup)).toHaveAttribute('role', 'radiogroup');
  await expectFaction(page, 'rebels');
  await expectOpponent(page, 'ai');
  await expectCaption(page, 'empire');
  await expectChecked(page, T.setupDifficultyOption('normal'));
  await expectChecked(page, T.setupDifficultyOption('easy'), false);
  await expectChecked(page, T.setupDifficultyOption('hard'), false);
  await expectChecked(page, T.setupRulesetOption('base'));
  await expectChecked(page, T.setupModeOption('digital'));
  await expectUnavailableOptions(page);
  await expect(page.getByTestId(T.setupPrototypeNote)).toBeVisible();
  await expect(page.getByTestId(T.setupStart)).toBeEnabled();
  await expect(page.getByTestId(T.setupError)).toHaveCount(0);
}

/** Error state after a failed create (AC-07): alert shown, form values kept, start enabled and not busy. */
export async function expectErrorState(page: Page): Promise<string> {
  const alert = page.getByTestId(T.setupError);
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAttribute('role', 'alert');
  const start = page.getByTestId(T.setupStart);
  await expect(start).toBeEnabled();
  await expect(start).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId(T.setupForm)).not.toHaveAttribute('aria-busy', 'true');
  // plan-frontend §2.5: focus returns to "Start game" (the disabled button would otherwise drop it to <body>).
  await expect(start).toBeFocused();
  return ((await alert.textContent()) ?? '').trim();
}

/**
 * TC-VA-13: the error text is human — no code, HTTP status, messageKey, "undefined", stack. In Russian (default UI
 * language) it is Cyrillic.
 */
export function expectHumanErrorText(text: string): void {
  expect(text.length, 'error text is not empty').toBeGreaterThan(5);
  expect(text).not.toMatch(
    /undefined|null|errors\.|rebellion\.|INTERNAL|SETUP_UNSUPPORTED|IDEMPOTENCY|VALIDATION|\b(400|409|422|500)\b|stack|at \w+ \(/,
  );
}

/** Fulfils a create request with a unified-format error body. */
export function fulfilError(
  route: Route,
  status: number,
  code: string,
  messageKey: string,
  details?: unknown,
): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: false,
      error: { code, messageKey, ...(details ? { details } : {}) },
    }),
  });
}
