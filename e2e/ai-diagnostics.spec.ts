// SWR-008 dev AI decision diagnostics (plan-frontend §4.3, test-cases.md §13): E-1 = TC-DIAG-07 (the panel is absent
// from the normal player UI, incl. a faked OpenAI session) + AC-10 UI text of `AI_PROMPT_TOO_LARGE` (ru and en).
// The e2e web server is Vite dev (`import.meta.env.DEV === true`), so «normal UI» = dev build WITHOUT the `/dev/ai`
// opt-in switch (QD-15, Q-FE-4): the lazy panel chunk is loaded, but the gate keeps it closed — no DOM, no request.
// Absence in a production build is proven by D-2 (component, DEV=false) and TC-DIAG-03 (`check:bundle`).
// E-2 = TC-DIAG-07b (P2, QD-23): with the switch on, a bot session shows the panel with the empty state answered by the
// REAL W7 endpoint (bot moves are not recorded) — one GET per load / AI turn, a strict wire body, no hidden data.
// The e2e API plays the deterministic bot (no OpenAI); the OpenAI fallback is produced with `page.route` (as TC-E-04).
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import {
  API,
  commandOk,
  createSession,
  getCoreView,
  planActivation,
  REBELS_VS_AI,
  type AutomationRunSummary,
  type CoreCommandResponse,
} from './support/api';
import { openCore } from './support/board';
import { finishViaUi } from './support/core';
import {
  DEV_AI_TABLE_DIAGNOSTICS_KEY,
  enableTableDiagnostics,
  isDevAiSessionsRequest,
  isSessionDecisionsGet,
} from './support/dev-ai';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

type Lang = 'ru' | 'en';
const WEB_SRC = new URL('../apps/web/src/', import.meta.url);
/** Text of a fallback code from the web locale (never hard-coded here). */
function reasonText(lang: Lang, code: string): string {
  const host = JSON.parse(
    readFileSync(new URL(`locales/${lang}/sessionHost.json`, WEB_SRC), 'utf8'),
  ) as { automation?: { reason?: Record<string, unknown> } };
  const text = host.automation?.reason?.[code];
  if (typeof text !== 'string') throw new Error(`no locale string automation.reason.${code}`);
  return text;
}

/** Every dev-ai-* node of the page (the whole dev diagnostics family, plan-frontend §2.5). */
const devAiNodes = (page: Page) => page.locator('[data-testid^="dev-ai-"]');

/** Records requests to the session diagnostics endpoint and browser requests leaving localhost. */
function watch(page: Page): { diagnostics: string[]; foreign: string[] } {
  const out = { diagnostics: [] as string[], foreign: [] as string[] };
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (isDevAiSessionsRequest(r)) out.diagnostics.push(url);
    const { hostname } = new URL(url);
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') out.foreign.push(url);
  });
  return out;
}

/** The lazy panel module of the session host (Vite dev serves it from the source path). */
const isPanelChunk = (url: string) =>
  new URL(url).pathname.endsWith('/src/dev/ai/session/entry.tsx');

/** Activation (no move) of the viewer through the API: the next «Finish activation» hands the turn to the AI. */
async function activateViaApi(request: Parameters<typeof commandOk>[0], sessionId: string) {
  const view = await getCoreView(request, sessionId);
  const plan = planActivation(view, [view.rebelBase.systemId ?? '']);
  await commandOk(request, sessionId, view, {
    type: 'ACTIVATE_SYSTEM',
    leaderId: plan.leaderId,
    systemId: plan.systemId,
  });
}

/** The next `POST /commands` gets the real server response with a patched automation summary. */
async function patchNextCommand(
  page: Page,
  patch: (a: AutomationRunSummary) => AutomationRunSummary,
): Promise<void> {
  await page.route(
    (url) => API.commands.test(url.pathname),
    async (route: Route) => {
      const res = await route.fetch();
      const body = (await res.json()) as CoreCommandResponse;
      if (res.status() === 200) body.automation = patch(body.automation);
      await route.fulfill({ response: res, json: body });
    },
    { times: 1 },
  );
}

async function setLanguage(page: Page, lang: Lang): Promise<void> {
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage(lang)).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** No panel and no diagnostics request — after the panel chunk had every chance to render (gate, not timing). */
async function expectNoDiagnostics(page: Page, seen: { diagnostics: string[] }): Promise<void> {
  await expect(page.getByTestId(T.sessionHost)).toBeVisible();
  await expect(devAiNodes(page)).toHaveCount(0);
  await expect(page.getByTestId(T.devAiSessionDiagnostics)).toHaveCount(0);
  expect(seen.diagnostics, 'no request to /api/dev/ai/sessions/*').toEqual([]);
}

test.describe('SWR-008 dev AI decision diagnostics: absent from the normal UI (E-1)', () => {
  test('E-1 / TC-DIAG-07: Rebels vs AI (bot) — AI turn played, no dev-ai-* node, no diagnostics request, switch off', async ({
    page,
    request,
  }) => {
    const seen = watch(page);
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    await activateViaApi(request, sessionId);
    const chunk = page.waitForResponse((r) => isPanelChunk(r.url()), { timeout: 30_000 });
    await openCore(page, sessionId);
    // The dev chunk is loaded by the dev server (literal DEV guard open) — only the opt-in gate hides the panel.
    expect((await chunk).ok()).toBe(true);
    await expect(page.getByTestId(T.sessionHost)).toHaveAttribute(
      'data-automation-strategy',
      'bot',
    );
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), DEV_AI_TABLE_DIAGNOSTICS_KEY),
      'the /dev/ai switch is off by default (never written)',
    ).toBeNull();
    await expectNoDiagnostics(page, seen);

    const fin = await finishViaUi(page);
    expect(fin.body.automation.steps, 'the AI moved').toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId(T.aiTurnSummary)).toHaveAttribute(
      'data-steps',
      String(fin.body.automation.steps),
    );
    await expectNoDiagnostics(page, seen);
    expect(seen.foreign, 'no browser request leaves localhost').toEqual([]);
  });

  test('E-1 / AC-10: faked OpenAI session with AI_PROMPT_TOO_LARGE — localized reason in the fallback notice (ru, en), no raw code, no panel', async ({
    page,
    request,
  }) => {
    const seen = watch(page);
    for (const lang of ['ru', 'en'] as const) {
      const { sessionId } = await createSession(request, REBELS_VS_AI);
      await activateViaApi(request, sessionId);
      if (lang === 'en') await setLanguage(page, 'en');
      await openCore(page, sessionId);
      await patchNextCommand(page, (a) => ({
        ...a,
        strategy: 'openai',
        fallbacks: 1,
        fallbackReasons: ['AI_PROMPT_TOO_LARGE'],
      }));
      const fin = await finishViaUi(page);
      expect(fin.body.automation.steps).toBeGreaterThanOrEqual(1);
      const notice = page.getByTestId(T.aiFallbackNotice);
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute('data-fallbacks', '1');
      await expect(notice).toHaveAttribute('data-reasons', 'AI_PROMPT_TOO_LARGE');
      const text = reasonText(lang, 'AI_PROMPT_TOO_LARGE');
      expect(text, 'a dedicated locale string, not the generic one').not.toBe(
        reasonText(lang, 'unknown'),
      );
      await expect(notice).toContainText(text);
      await expect(notice).not.toContainText('AI_PROMPT_TOO_LARGE');
      await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute(
        'data-strategy',
        'openai',
      );
      await expectNoDiagnostics(page, seen);
    }
    expect(seen.foreign, 'OpenAI is never called from the browser').toEqual([]);
  });
});

/** Keys of the wire (plan-backend §6, `AiSessionDecisionsResponseSchema` / `AiCostGroupSchema`). */
const RESPONSE_KEYS = ['decisions', 'totals'];
const TOTALS_KEYS = ['total', 'withRules', 'withoutRules'];
const GROUP_KEYS = ['costMicroUsd', 'decisions', 'inputTokens', 'meanCostMicroUsd', 'outputTokens'];
const EMPTY_GROUP = {
  decisions: 0,
  costMicroUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  meanCostMicroUsd: null,
};

test.describe('SWR-008 dev AI decision diagnostics: opt-in panel against the real endpoint (E-2)', () => {
  test('E-2 / TC-DIAG-07b: switch on, Rebels vs AI (bot) → panel ready with the empty state, one GET per load / AI turn, strict body, no hidden data', async ({
    page,
    request,
  }) => {
    const seen = watch(page);
    const bodies: { status: number; text: string }[] = [];
    // The dev web runs under React StrictMode: its simulated unmount/remount on the first render cancels the panel's
    // first in-flight GET (TanStack Query aborts it via the signal) and re-sends it. Cancelled requests are counted apart.
    const aborted: string[] = [];
    page.on('requestfailed', (r) => {
      if (isSessionDecisionsGet(r)) aborted.push(r.failure()?.errorText ?? 'failed');
    });
    page.on('response', async (r) => {
      if (isSessionDecisionsGet(r.request()))
        bodies.push({ status: r.status(), text: await r.text() });
    });
    await enableTableDiagnostics(page);
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    await activateViaApi(request, sessionId);
    const firstGet = page.waitForResponse((r) => isSessionDecisionsGet(r.request()));
    await openCore(page, sessionId);
    const res = await firstGet;
    expect(res.status()).toBe(200);
    expect(new URL(res.url()).pathname).toBe(
      `/api/dev/ai/sessions/${encodeURIComponent(sessionId)}/decisions`,
    );

    const panel = page.getByTestId(T.devAiSessionDiagnostics);
    await expect(panel).toHaveAttribute('data-state', 'ready');
    await expect(panel).toHaveAttribute('data-decisions', '0');
    await expect(panel).toHaveAttribute('data-expanded', 'false');
    // inside the session host, the game table intact
    await expect(
      page.getByTestId(T.sessionHost).getByTestId(T.devAiSessionDiagnostics),
    ).toHaveCount(1);
    await expect(page.getByTestId(T.gameTable)).toBeVisible();

    // The real body passes the strict wire: exactly the schema keys, an empty list, zero totals.
    await expect.poll(() => bodies.length).toBe(1);
    const body = JSON.parse(bodies[0]!.text) as {
      decisions: unknown[];
      totals: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
    expect(body.decisions).toEqual([]);
    expect(Object.keys(body.totals).sort()).toEqual(TOTALS_KEYS);
    for (const group of TOTALS_KEYS) {
      expect(Object.keys(body.totals[group]!).sort(), group).toEqual(GROUP_KEYS);
      expect(body.totals[group], group).toEqual(EMPTY_GROUP);
    }
    for (const forbidden of [sessionId, 'budgetKey', 'reason', 'prompt', 'situation']) {
      expect(bodies[0]!.text, `no ${forbidden} in the wire`).not.toContain(forbidden);
    }

    // Expanded: the empty state; no session id anywhere in the panel.
    const toggle = page.getByTestId(T.devAiSessionToggle);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByTestId(T.devAiSessionEmpty)).toBeVisible();
    await expect(page.getByTestId(T.devAiSessionTotals)).toHaveAttribute('data-total-cost', '0');
    await expect(page.getByTestId(T.devAiSessionError)).toHaveCount(0);
    expect(await panel.innerHTML()).not.toContain(sessionId);
    await page.waitForTimeout(300);
    expect(bodies, 'exactly one answered GET on load').toHaveLength(1);
    expect(
      aborted.every((e) => e.includes('ABORTED')),
      aborted.join(),
    ).toBe(true);
    expect(aborted.length, 'at most the one StrictMode-cancelled GET').toBeLessThanOrEqual(1);
    expect(seen.diagnostics).toHaveLength(1 + aborted.length);
    const abortedOnLoad = aborted.length;

    // The AI turn (bot): exactly one more GET; bot moves are not recorded → still empty; «Last AI turn» from the summary.
    const secondGet = page.waitForResponse((r) => isSessionDecisionsGet(r.request()));
    const fin = await finishViaUi(page);
    expect(fin.body.automation.steps, 'the AI moved').toBeGreaterThanOrEqual(1);
    expect((await secondGet).status()).toBe(200);
    await expect(page.getByTestId(T.devAiSessionLastRun)).toHaveAttribute(
      'data-steps',
      String(fin.body.automation.steps),
    );
    await expect(page.getByTestId(T.devAiSessionLastRun)).toHaveAttribute('data-reasons', '');
    await expect(panel).toHaveAttribute('data-state', 'ready');
    await expect(panel).toHaveAttribute('data-decisions', '0');
    await expect(page.getByTestId(T.devAiSessionEmpty)).toBeVisible();
    await page.waitForTimeout(300);
    expect(aborted, 'no cancelled GET after the load').toHaveLength(abortedOnLoad);
    expect(seen.diagnostics, 'one GET per load / AI turn, no loop').toHaveLength(2 + abortedOnLoad);
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies.every((b) => b.status === 200)).toBe(true);
    expect(await panel.innerHTML()).not.toContain(sessionId);

    // Esc collapses and returns focus to the chip.
    await page.getByTestId('dev-ai-session-refresh').focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    expect(seen.foreign, 'no browser request leaves localhost').toEqual([]);
  });
});
