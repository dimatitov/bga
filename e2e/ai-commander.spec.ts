// SWR-006 AI Commander v0 (test-cases.md §13, §5, §14): TC-E-01..TC-E-07, TC-H-11, TC-VA-01, TC-VA-02, TC-BC-01,
// TC-BC-02 (UI part). TC-E-08 lives in env-isolation.spec.ts, TC-BC-03 (`/dev/ai`) in dev-ai.spec.ts.
// The e2e API plays the deterministic bot (apps/api/scripts/e2e-env.mjs forces AI_COMMANDER_PROVIDER=bot,
// OPENAI_ENABLED=false) — no test reaches OpenAI; every test runs under a browser network guard (same origin only).
// Clarification Q-BE-8: the specs assert PROPERTIES of the AI turn (AI-side events, steps, whose turn, hidden info),
// never the exact AI moves. States the bot cannot produce on demand (slow answer, OpenAI fallback, pending run, run
// error) are produced with `page.route` on the real responses (plan-frontend §8).
// Final testids: plan-frontend.md §8 (`e2e/support/testids.ts`). Screenshots (TC-VA-01) go to
// docs/tasks/SWR-006/artifacts/screenshots/ (CURRENT_SCREENSHOT_TASK = 'SWR-006').
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import {
  API,
  asCore,
  commandOk,
  createSession,
  EMPIRE_VS_AI,
  getCoreView,
  getSession,
  NO_AUTOMATION_SUMMARY,
  planActivation,
  REBELLION,
  REBELS_VS_AI,
  REBELS_VS_HUMAN,
  scanForBase,
  START_REPUTATION,
  type AutomationRunSummary,
  type CoreCommandResponse,
  type CorePlayerView,
  type Difficulty,
  type SessionResponse,
} from './support/api';
import {
  expectNoHorizontalScroll,
  expectNotClipped,
  expectTextContrastDeep,
  expectVisibleFocus,
} from './support/a11y';
import {
  dbg,
  keyboardFocus,
  newSessionPath,
  openCore,
  openLegacy,
  openSidebarTab,
  recordApi,
  saveScreenshot,
  sessionPath,
  urlOf,
  waitForTable,
} from './support/board';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  eventsBy,
  eventsOf,
  expectAiTurn,
  expectTrack,
  expectTurn,
  finishViaUi,
  nextCommand,
  passViaUi,
  systemName,
} from './support/core';
import { seedLegacyV2, storedRebelBase } from './support/seed';
import { waitCreate } from './support/setup';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** Summary of a request of an AI game in which the AI made no step (strategy is the configured one, Q-11). */
const BOT_NO_STEPS = { ...NO_AUTOMATION_SUMMARY, strategy: 'bot' } as const;

type Lang = 'ru' | 'en';
const WEB_SRC = new URL('../apps/web/src/', import.meta.url);
const readJson = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, WEB_SRC), 'utf8')) as Record<string, unknown>;
const get = (obj: Record<string, unknown>, dotted: string): string => {
  const v = dotted.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  if (typeof v !== 'string') throw new Error(`no locale string ${dotted}`);
  return v;
};
/** Locale texts of the UI (read from the locale files, never hard-coded). */
function texts(lang: Lang) {
  const match = readJson(`games/rebellion/locales/${lang}/match.json`);
  const common = readJson(`games/rebellion/locales/${lang}/common.json`);
  const host = readJson(`locales/${lang}/sessionHost.json`);
  return {
    label: (provider: 'bot' | 'openai', difficulty: Difficulty) =>
      get(match, 'ai.label')
        .replace('{{provider}}', get(match, `ai.provider.${provider}`))
        .replace('{{difficulty}}', get(common, `difficulty.${difficulty}`)),
    thinking: get(match, 'ai.thinking'),
    infoBot: get(match, 'ai.infoCommanderBot'),
    retry: get(host, 'automation.retry'),
    reason: (code: string) => get(host, `automation.reason.${code}`),
  };
}

/** Fails the test on any browser request that leaves the app origin (OpenAI in particular). */
function guardNetwork(page: Page): { foreign: string[] } {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    const { hostname } = new URL(url);
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') foreign.push(url);
  });
  return { foreign };
}

const isRunPost = (r: Request) =>
  r.method() === 'POST' && API.automationRun.test(new URL(r.url()).pathname);

/** Counts `POST …/automation/run` requests of the page. */
function countRuns(page: Page): { readonly n: number } {
  const c = { n: 0 };
  page.on('request', (r) => {
    if (isRunPost(r)) c.n++;
  });
  return c;
}

/** Next `POST /commands` answered with the real server response, optionally delayed and/or patched. */
async function interceptNextCommand(
  page: Page,
  options: { delayMs?: number; patch?: (a: AutomationRunSummary) => AutomationRunSummary },
): Promise<void> {
  await page.route(
    (url) => API.commands.test(url.pathname),
    async (route: Route) => {
      const res = await route.fetch();
      const body = (await res.json()) as CoreCommandResponse;
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
      if (options.patch && res.status() === 200) body.automation = options.patch(body.automation);
      await route.fulfill({ response: res, json: body });
    },
    { times: 1 },
  );
}

/**
 * Every `GET /api/sessions/:id` of the page reports `automation.pending: true` (the rest is the real body) until the
 * first `POST …/automation/run` is sent — as a server whose AI turn is unfinished would. (The client may fetch the
 * session twice on a load, e.g. a cancelled StrictMode fetch, so patching only the first GET is not enough.)
 */
async function pendingUntilRun(page: Page): Promise<void> {
  let runSent = false;
  page.on('request', (r) => {
    if (isRunPost(r)) runSent = true;
  });
  await page.route(
    (url) => API.session.test(url.pathname),
    async (route) => {
      if (runSent || route.request().method() !== 'GET') return route.fallback();
      const res = await route.fetch();
      const body = (await res.json()) as SessionResponse;
      body.automation = { ...body.automation, pending: true };
      await route.fulfill({ response: res, json: body });
    },
  );
}

async function setLanguage(page: Page, lang: Lang): Promise<void> {
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage(lang)).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/**
 * Activation (no move) of the viewer through the API. The server runs no AI Commander steps
 * in this response (`automation` equals BOT_NO_STEPS).
 */
async function activateViaApi(request: Parameters<typeof commandOk>[0], sessionId: string) {
  const view = await getCoreView(request, sessionId);
  const plan = planActivation(view, [view.rebelBase.systemId ?? '']);
  const r = await commandOk(request, sessionId, view, {
    type: 'ACTIVATE_SYSTEM',
    leaderId: plan.leaderId,
    systemId: plan.systemId,
  });
  expect(r.automation).toEqual(BOT_NO_STEPS);
  return asCore(r.view);
}

/** AI Commander status of the top bar for a bot game. */
async function expectAiStatus(
  page: Page,
  lang: Lang,
  difficulty: Difficulty,
  state: 'idle' | 'thinking' | 'stalled' | 'over' = 'idle',
): Promise<void> {
  const status = page.getByTestId(T.aiCommanderStatus);
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute('data-strategy', 'bot');
  await expect(status).toHaveAttribute('data-difficulty', difficulty);
  await expect(status).toHaveAttribute('data-state', state);
  await expect(status).toContainText(texts(lang).label('bot', difficulty));
}

/** DOM / debug hook / log of the Empire's page do not point at the hidden base (TC-H-11). */
async function expectBaseHidden(page: Page, baseId: string): Promise<void> {
  await expect(page.locator('[data-rebel-base]')).toHaveCount(0);
  await expect(page.locator(`[data-system-id="${baseId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-location*="${baseId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-to="${baseId}"]`)).toHaveCount(0);
  expect(await dbg.rebelBase(page)).toBeNull();
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLog)).not.toContainText(await systemName(page, baseId));
  for (const id of [T.aiTurnSummary, T.aiCommanderStatus, T.liveRegion]) {
    const loc = page.getByTestId(id);
    if ((await loc.count()) > 0) expect(await loc.textContent()).not.toContain(baseId);
  }
}

/** AI-side entries of the log carry `data-ai=true` and the «AI» chip; the human's do not. */
async function expectAiLog(page: Page, view: CorePlayerView, ai: 'rebels' | 'empire') {
  await openSidebarTab(page, 'log');
  const aiEvents = view.log.filter((e) => e.actor === ai);
  for (const e of aiEvents) {
    await expect(page.getByTestId(T.logEntry(e.seq))).toHaveAttribute('data-ai', 'true');
    await expect(page.getByTestId(T.logEntryAi(e.seq))).toBeVisible();
  }
  for (const e of view.log.filter((x) => x.actor === view.viewer)) {
    await expect(page.getByTestId(T.logEntry(e.seq))).toHaveAttribute('data-ai', 'false');
    await expect(page.getByTestId(T.logEntryAi(e.seq))).toHaveCount(0);
  }
  return aiEvents;
}

test.describe('SWR-006 AI Commander v0 (core-v1, bot)', () => {
  test('TC-E-01 (PO scenario, D-PO-5): Rebels vs AI Normal from the form → activation + move + finish → AI Empire turn → pass → round 1 complete', async ({
    page,
    request,
  }) => {
    const net = guardNetwork(page);
    const runs = countRuns(page);
    await page.goto(newSessionPath(REBELLION));
    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click(); // PO defaults: Rebels, AI, Normal
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    expect(body.settings).toMatchObject({ playerFaction: 'rebels', aiDifficulty: 'normal' });
    expect(body.automation).toEqual({ pending: false, strategy: 'bot' });
    const view = asCore(body.view);
    expect(view.activeSide).toBe('rebels'); // the Rebels move first; nothing of the AI yet
    await expect(page).toHaveURL(urlOf(sessionPath(body.sessionId)));
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });

    const lang = ((await page.locator('html').getAttribute('lang')) ?? 'ru').startsWith('en')
      ? 'en'
      : 'ru';
    await expectAiStatus(page, lang, 'normal');
    await expect(page.getByTestId(T.aiThinking)).toHaveCount(0);
    await expect(page.getByTestId(T.aiTurnSummary)).toHaveCount(0); // Q-FE-5: no summary after creation
    const host = page.getByTestId(T.sessionHost);
    await expect(host).toHaveAttribute('data-automation-strategy', 'bot');
    await expect(host).toHaveAttribute('data-automation-pending', 'false');
    await expect(host).toHaveAttribute('data-automation-state', 'idle');
    await openSidebarTab(page, 'game');
    await expect(page.getByTestId(T.gameInfoOpponent)).not.toBeEmpty();
    const info = page.getByTestId(T.gameInfoAiCommander);
    await expect(info).toHaveAttribute('data-strategy', 'bot');
    await expect(info).toContainText(texts(lang).infoBot);

    // Activation (map click) + move (panel) + finish — the AI Empire answers in the same response.
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    await armLeader(page, plan.leaderId);
    const act = await commandViaUi(page, () => clickSystem(page, plan.systemId));
    expect(act.body.automation).toEqual(BOT_NO_STEPS); // ACTIVATE does not hand the turn over
    await page.getByTestId(T.movePiece(plan.pieceId)).check();
    const moved = await commandViaUi(page, () =>
      page.getByTestId(T.moveSubmit(plan.fromSystemId)).click(),
    );
    expect(eventsOf(moved.body, 'PIECES_MOVED')).toHaveLength(1);
    expect(moved.body.automation.steps).toBe(0);
    const fin = await finishViaUi(page);
    const ai = expectAiTurn(fin.body, 'empire');
    expect(ai.stopReason).toBe('humanTurn');
    await expectTurn(page, 'rebels');
    await expectAiStatus(page, lang, 'normal');
    await expect(page.getByTestId(T.aiThinking)).toHaveCount(0);
    const summary = page.getByTestId(T.aiTurnSummary);
    await expect(summary).toHaveAttribute('data-steps', String(ai.steps));
    await expect(summary).toHaveAttribute('data-source', 'command');
    await expect(summary).not.toBeEmpty();
    await expect(page.getByTestId(T.aiFallbackNotice)).toHaveCount(0);
    expect((await expectAiLog(page, fin.view, 'empire')).length).toBeGreaterThan(0);

    // Pass (leaders left → dialog): the AI plays on until it passes, the round ends, Rebels to move in round 2.
    const passed = await passViaUi(page, true);
    expect(passed.body.events[0]).toMatchObject({ type: 'PASSED', actor: 'rebels' });
    if (passed.body.automation.steps > 0) expectAiTurn(passed.body, 'empire');
    expect(passed.view.markers.time).toBe(2);
    await expectTrack(page, 2);
    await expectTurn(page, 'rebels');
    await expect(page.getByTestId(T.passTurn)).toBeEnabled();

    // Round 1 as the server stored it: the AI Empire activated at least once and passed.
    const server = await getCoreView(request, body.sessionId);
    const timeAt = server.log.find((e) => e.type === 'TIME_ADVANCED')!.seq;
    const round1 = server.log.filter((e) => e.seq < timeAt && e.actor === 'empire');
    expect(round1.filter((e) => e.type === 'SYSTEM_ACTIVATED').length).toBeGreaterThanOrEqual(1);
    expect(round1.filter((e) => e.type === 'PASSED')).toHaveLength(1);
    await expectAiLog(page, server, 'empire');
    expect(runs.n, 'no automation/run needed: the AI moved inside the commands').toBe(0);
    expect(net.foreign).toEqual([]);
  });

  test('TC-E-02 + TC-H-11 (D-PO-5): Empire vs AI Easy from the form — AI Rebels moved before the first show, full round, base id never in responses / DOM / log', async ({
    page,
    request,
  }) => {
    const net = guardNetwork(page);
    const recorder = recordApi(page);
    await page.goto(newSessionPath(REBELLION));
    await page.getByTestId(T.setupFaction('empire')).click();
    await page.getByTestId(T.setupDifficultyOption('easy')).click();
    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    expect(body.automation).toEqual({ pending: false, strategy: 'bot' });
    const view = asCore(body.view);
    const baseId = await storedRebelBase(body.sessionId);
    expect(view.viewer).toBe('empire');
    expect(view.activeSide).toBe('empire');
    expect(view.rebelBase).toEqual({ systemId: null, revealed: false });
    const first = view.log.filter((e) => e.actor === 'rebels');
    expect(first.length, 'AI Rebels moved before the first show').toBeGreaterThan(0);
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    const lang = ((await page.locator('html').getAttribute('lang')) ?? 'ru').startsWith('en')
      ? 'en'
      : 'ru';
    await expectAiStatus(page, lang, 'easy');
    await expectTurn(page, 'empire');
    await expectAiLog(page, view, 'rebels');
    await openSidebarTab(page, 'objects');
    await expect(page.getByTestId(T.hiddenBaseZone)).toBeVisible();
    await expectBaseHidden(page, baseId);

    // Full round of the Empire: activation + move + finish (the AI Rebels answer), then pass.
    const plan = planActivation(view, [baseId]);
    await armLeader(page, plan.leaderId);
    await commandViaUi(page, () => clickSystem(page, plan.systemId));
    await page.getByTestId(T.movePiece(plan.pieceId)).check();
    await commandViaUi(page, () => page.getByTestId(T.moveSubmit(plan.fromSystemId)).click());
    const fin = await finishViaUi(page);
    expect(eventsOf(fin.body, 'BASE_REVEALED')).toEqual([]);
    if (fin.body.automation.steps > 0) expectAiTurn(fin.body, 'rebels');
    await expectTurn(page, 'empire');
    await expectBaseHidden(page, baseId);
    const passed = await passViaUi(page, true);
    expect(passed.body.events[0]).toMatchObject({ type: 'PASSED', actor: 'empire' });
    expect(eventsOf(passed.body, 'BASE_REVEALED')).toEqual([]);
    expect(passed.view.markers.time).toBe(2);
    expect(passed.view.activeSide).toBe('empire');
    // Round 2 starts with the AI Rebels, so the pass response already holds their next moves.
    expect(eventsBy(passed.body, 'rebels').length).toBeGreaterThan(0);
    await expectTrack(page, 2);
    await expectTurn(page, 'empire');
    await expectAiLog(page, passed.view, 'rebels');
    await expectBaseHidden(page, baseId);

    // No Empire-facing response carries the base id outside the static catalogue (TR-3 oracle).
    await recorder.settle();
    const calls = recorder.calls.filter((c) => c.status < 500);
    expect(calls.filter((c) => c.url.includes(body.sessionId)).length).toBeGreaterThan(3);
    for (const c of calls) expect(scanForBase(c.body, baseId), `${c.method} ${c.url}`).toEqual([]);
    const server = await getSession(request, body.sessionId);
    expect(scanForBase(server, baseId)).toEqual([]);
    expect(net.foreign).toEqual([]);
  });

  test('TC-E-03 + TC-VA-02: slow AI turn → «ИИ думает…» (role=status), actions locked, then the summary', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    await activateViaApi(request, sessionId);
    await openCore(page, sessionId);
    const lang = ((await page.locator('html').getAttribute('lang')) ?? 'ru').startsWith('en')
      ? 'en'
      : 'ru';
    await interceptNextCommand(page, { delayMs: 1500 });
    const done = page.waitForResponse((r) => API.commands.test(new URL(r.url()).pathname));
    await page.getByTestId(T.finishActivation).click();
    const thinking = page.getByTestId(T.aiThinking);
    await expect(thinking).toBeVisible();
    await expect(thinking).toHaveRole('status');
    await expect(thinking).toContainText(texts(lang).thinking);
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute('data-state', 'thinking');
    await expect(page.getByTestId(T.passTurn)).toBeDisabled();
    await expect(page.getByTestId(T.finishActivation)).toBeDisabled();
    await expect(page.getByTestId(T.turnStatus)).toContainText(texts(lang).thinking);
    const res = await done;
    const body = (await res.json()) as CoreCommandResponse;
    await expect(thinking).toHaveCount(0);
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId(T.aiTurnSummary)).toHaveAttribute(
      'data-steps',
      String(body.automation.steps),
    );
    await expect(page.getByTestId(T.passTurn)).toBeEnabled();
    await expectTextContrastDeep(page.getByTestId(T.aiCommanderStatus), 'AI Commander status');
    await expectTextContrastDeep(page.getByTestId(T.aiTurnSummary), 'AI turn summary');
  });

  test('TC-E-04 (D-PO-3): OpenAI fallback reported by the server → «Часть ходов AI … сделал бот» with the reason, ru and en', async ({
    page,
    request,
  }) => {
    const net = guardNetwork(page);
    for (const lang of ['ru', 'en'] as const) {
      const { sessionId } = await createSession(request, REBELS_VS_AI);
      await activateViaApi(request, sessionId);
      if (lang === 'en') await setLanguage(page, 'en');
      await openCore(page, sessionId);
      await interceptNextCommand(page, {
        patch: (a) => ({
          ...a,
          strategy: 'openai',
          fallbacks: 1,
          fallbackReasons: ['AI_TIMEOUT'],
        }),
      });
      const fin = await finishViaUi(page);
      expect(fin.body.automation.steps).toBeGreaterThanOrEqual(1);
      const notice = page.getByTestId(T.aiFallbackNotice);
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute('data-fallbacks', '1');
      await expect(notice).toHaveAttribute('data-reasons', 'AI_TIMEOUT');
      await expect(notice).toContainText(texts(lang).reason('AI_TIMEOUT'));
      await expect(notice).not.toContainText('AI_TIMEOUT');
      await expectTextContrastDeep(notice, `fallback notice ${lang}`);
      // The provider shown follows the server's strategy.
      await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute(
        'data-strategy',
        'openai',
      );
    }
    expect(net.foreign, 'OpenAI is never called from the browser').toEqual([]);
  });

  test('TC-E-05: GET reports pending → exactly one automatic automation/run, then idle and no repeats', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const runs = countRuns(page);
    const runResponses: AutomationRunSummary[] = [];
    page.on('response', (r) => {
      if (isRunPost(r.request()))
        void r
          .json()
          .then((b: CoreCommandResponse) => runResponses.push(b.automation))
          .catch(() => undefined);
    });
    await pendingUntilRun(page);
    await openCore(page, sessionId);
    await expect.poll(() => runs.n).toBe(1);
    const host = page.getByTestId(T.sessionHost);
    await expect(host).toHaveAttribute('data-automation-pending', 'false');
    await expect(host).toHaveAttribute('data-automation-state', 'idle');
    await page.waitForTimeout(1500);
    expect(runs.n, 'no repeated run').toBe(1);
    // Nothing was actually pending on the server: steps 0, stopReason none.
    await expect.poll(() => runResponses.length).toBe(1);
    expect(runResponses[0]).toMatchObject({ steps: 0, stopReason: 'none', pending: false });
    await expect(page.getByTestId(T.sessionAutomationNotice)).toHaveCount(0);
    await expectTurn(page, 'rebels');
  });

  test('TC-E-05b + TC-VA-02: automation/run fails → «Продолжить ход AI» (role=alert, keyboard) → retry succeeds', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const runs = countRuns(page);
    await pendingUntilRun(page);
    await page.route(
      (url) => API.automationRun.test(url.pathname),
      (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { code: 'INTERNAL', messageKey: 'errors.internal' },
          }),
        }),
      { times: 1 },
    );
    await openCore(page, sessionId);
    const notice = page.getByTestId(T.sessionAutomationNotice);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-reason', 'error');
    await expect(notice).toHaveRole('alert');
    await expect(page.getByTestId(T.sessionHost)).toHaveAttribute('data-automation-state', 'error');
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute('data-state', 'stalled');
    await expect(page.getByTestId(T.aiThinking)).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(runs.n, 'an error is not retried automatically').toBe(1);
    const text = ((await notice.textContent()) ?? '').trim();
    expect(text).not.toMatch(/errors\.|sessionHost:|undefined|INTERNAL/);
    await expectTextContrastDeep(notice, 'automation notice');

    const retry = page.getByTestId(T.sessionAutomationRetry);
    await keyboardFocus(page, retry);
    await expectVisibleFocus(retry, 'continue AI turn');
    const ok = page.waitForResponse((r) => isRunPost(r.request()));
    await page.keyboard.press('Enter');
    expect((await ok).status()).toBe(200);
    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId(T.sessionHost)).toHaveAttribute('data-automation-state', 'idle');
    expect(runs.n).toBe(2);
  });

  test('TC-E-05c: run answers pending:true → «stalled» notice, no automatic loop', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const runs = countRuns(page);
    await pendingUntilRun(page);
    await page.route(
      (url) => API.automationRun.test(url.pathname),
      async (route) => {
        const res = await route.fetch();
        const body = (await res.json()) as CoreCommandResponse;
        body.automation = { ...body.automation, pending: true, stopReason: 'stepLimit' };
        await route.fulfill({ response: res, json: body });
      },
      { times: 1 },
    );
    await openCore(page, sessionId);
    const notice = page.getByTestId(T.sessionAutomationNotice);
    await expect(notice).toHaveAttribute('data-reason', 'stalled');
    await page.waitForTimeout(1500);
    expect(runs.n, 'pending after a run is not retried automatically').toBe(1);
    await page.getByTestId(T.sessionAutomationRetry).click();
    await expect(notice).toHaveCount(0);
    expect(runs.n).toBe(2);
  });

  test('TC-E-06 (PO 8.6): double click on «Finish activation» / «Pass» → one command on the server, the AI moves once', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const before = await activateViaApi(request, sessionId);
    await openCore(page, sessionId);
    const posts: Request[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && API.commands.test(new URL(r.url()).pathname)) posts.push(r);
    });
    const first = page.waitForResponse((r) => API.commands.test(new URL(r.url()).pathname));
    await page.getByTestId(T.finishActivation).dblclick();
    const res = await first;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as CoreCommandResponse;
    await expectTurn(page, 'rebels');
    await page.waitForTimeout(800);
    const after = await getCoreView(request, sessionId);
    const newEvents = after.log.filter((e) => e.seq > before.log.at(-1)!.seq);
    expect(
      newEvents.filter((e) => e.type === 'ACTIVATION_FINISHED' && e.actor === 'rebels'),
    ).toHaveLength(1);
    expect(eventsBy({ events: newEvents }, 'empire')).toHaveLength(body.automation.steps);
    expect(after.version).toBe(before.version + 1 + body.automation.steps);
    for (const p of posts.slice(1)) expect((await p.response())?.status()).toBe(409);
    await expect(page.getByTestId(T.sessionNotFound)).toHaveCount(0);
    await expect(page.getByTestId(T.gameTable)).toBeVisible();

    // Pass → dialog → double click on «Pass» of the dialog.
    await page.getByTestId(T.passTurn).click();
    await expect(page.getByTestId(T.passConfirm)).toBeVisible();
    const passCount = posts.length;
    const passed = page.waitForResponse((r) => API.commands.test(new URL(r.url()).pathname));
    await page.getByTestId(T.passConfirmOk).dblclick();
    expect((await passed).status()).toBe(200);
    await page.waitForTimeout(800);
    const end = await getCoreView(request, sessionId);
    const passEvents = end.log.filter((e) => e.seq > after.log.at(-1)!.seq);
    expect(passEvents.filter((e) => e.type === 'PASSED' && e.actor === 'rebels')).toHaveLength(1);
    expect(passEvents.filter((e) => e.type === 'TIME_ADVANCED')).toHaveLength(1);
    for (const p of posts.slice(passCount + 1)) expect((await p.response())?.status()).toBe(409);
    await expectTrack(page, 2);
  });

  test('TC-E-07 (AC-08): Empire vs AI Normal, 12 passes via API, the 13th in the UI → Rebels win, AI status «over»', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, EMPIRE_VS_AI);
    let v: CorePlayerView = view;
    for (let i = 0; i < START_REPUTATION - 2; i++) {
      const r = await commandOk(request, sessionId, v, { type: 'PASS' });
      if (r.automation.steps > 0) expectAiTurn(r, 'rebels');
      v = asCore(r.view);
      expect(v.outcome).toBeNull();
      expect(v.activeSide).toBe('empire');
    }
    expect(v.markers.time).toBe(START_REPUTATION - 1);
    await openCore(page, sessionId);
    const last = await nextCommand(page, async () => {
      await page.getByTestId(T.passTurn).click();
      if (await page.getByTestId(T.passConfirm).isVisible())
        await page.getByTestId(T.passConfirmOk).click();
    });
    expect(last.res.status()).toBe(200);
    const end = asCore(last.body.view);
    expect(end.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    if (last.body.automation.steps > 0) expect(last.body.automation.stopReason).toBe('gameOver');
    expect(last.body.automation.pending).toBe(false);
    await expect(page.getByTestId(T.gameOverBanner)).toHaveAttribute('data-winner', 'rebels');
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute('data-state', 'over');
    await expect(page.getByTestId(T.aiThinking)).toHaveCount(0);
    expect((await getSession(request, sessionId)).automation).toEqual({
      pending: false,
      strategy: 'bot',
    });
  });

  test('TC-BC-01 (AC-11): hot-seat — no AI Commander, automation strategy none, no run requests', async ({
    page,
    request,
  }) => {
    const runs = countRuns(page);
    const { sessionId, view, automation } = await createSession(request, REBELS_VS_HUMAN);
    expect(automation).toEqual({ pending: false, strategy: null });
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    const act = await commandOk(request, sessionId, view, {
      type: 'ACTIVATE_SYSTEM',
      leaderId: plan.leaderId,
      systemId: plan.systemId,
    });
    expect(act.automation).toEqual(NO_AUTOMATION_SUMMARY);
    const fin = await commandOk(request, sessionId, asCore(act.view), {
      type: 'FINISH_ACTIVATION',
    });
    expect(fin.automation).toEqual(NO_AUTOMATION_SUMMARY);
    expect(fin.view.kind).toBe('handoff');
    await page.goto(sessionPath(sessionId));
    await expect(page.getByTestId(T.handoffScreen)).toBeVisible();
    const host = page.getByTestId(T.sessionHost);
    await expect(host).toHaveAttribute('data-automation-strategy', 'none');
    await expect(host).toHaveAttribute('data-automation-pending', 'false');
    await page.getByTestId(T.handoffAccept).click();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveCount(0);
    await expect(page.getByTestId(T.aiTurnSummary)).toHaveCount(0);
    await openSidebarTab(page, 'game');
    await expect(page.getByTestId(T.gameInfoAiCommander)).toHaveCount(0);
    await expect(page.getByTestId(T.gameInfoOpponent)).not.toBeEmpty();
    await page.waitForTimeout(500);
    expect(runs.n).toBe(0);
  });

  test('TC-BC-02 (AC-11): seeded mock-v1 AI session — automation strategy none, mock table unchanged, no run requests', async ({
    page,
    request,
  }) => {
    const runs = countRuns(page);
    const seeded = await seedLegacyV2('rebelsAi');
    expect((await getSession(request, seeded.sessionId)).automation).toEqual({
      pending: false,
      strategy: null,
    });
    await openLegacy(page, seeded.sessionId);
    await expect(page.getByTestId(T.sessionHost)).toHaveAttribute(
      'data-automation-strategy',
      'none',
    );
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveCount(0);
    await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-variant', 'legacy');
    await page.waitForTimeout(500);
    expect(runs.n).toBe(0);
  });
});

// TC-VA-01: evidence screenshots ru/en × 1440/375 into docs/tasks/SWR-006/artifacts/screenshots/; at 375 no
// horizontal scroll and the AI status / summary / notices are not clipped.
const SIZES = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
] as const;

for (const lang of ['ru', 'en'] as const) {
  for (const size of SIZES) {
    test(`TC-VA-01: AI Commander screenshots ${lang} ${size.width}px (thinking, after turn, fallback, Empire hidden base, continue)`, async ({
      page,
      request,
    }) => {
      const suffix = `${lang}-${size.width}`;
      const narrow = size.width < 600;
      await page.setViewportSize(size);
      if (lang === 'en') await setLanguage(page, 'en');
      const check = async (testId: string, label: string) => {
        const loc = page.getByTestId(testId);
        await loc.scrollIntoViewIfNeeded();
        await expectNotClipped(loc, `${label} ${suffix}`);
        if (narrow) await expectNoHorizontalScroll(page, `${label} ${suffix}`);
      };

      // 1) «ИИ думает…» while the finish request is held; 2) the summary after the AI turn.
      const a = await createSession(request, REBELS_VS_AI);
      await activateViaApi(request, a.sessionId);
      await openCore(page, a.sessionId);
      await interceptNextCommand(page, { delayMs: 2500 });
      const done = page.waitForResponse((r) => API.commands.test(new URL(r.url()).pathname));
      await page.getByTestId(T.finishActivation).click();
      await expect(page.getByTestId(T.aiThinking)).toBeVisible();
      await check(T.aiCommanderStatus, 'AI status (thinking)');
      await page.evaluate(() => window.scrollTo(0, 0));
      await saveScreenshot(page, `swr006-rebels-vs-ai-thinking-${suffix}`);
      await done;
      await expect(page.getByTestId(T.aiThinking)).toHaveCount(0);
      await expect(page.getByTestId(T.aiTurnSummary)).toBeVisible();
      await check(T.aiTurnSummary, 'AI turn summary');
      await check(T.aiCommanderStatus, 'AI status');
      if (!narrow) await openSidebarTab(page, 'log');
      await saveScreenshot(page, `swr006-rebels-vs-ai-after-turn-${suffix}`, undefined, {
        fullPage: narrow,
      });

      // 3) OpenAI fallback notice (server summary patched, D-PO-3).
      const b = await createSession(request, REBELS_VS_AI);
      await activateViaApi(request, b.sessionId);
      await openCore(page, b.sessionId);
      await interceptNextCommand(page, {
        patch: (s) => ({ ...s, strategy: 'openai', fallbacks: 1, fallbackReasons: ['AI_TIMEOUT'] }),
      });
      await finishViaUi(page);
      await check(T.aiFallbackNotice, 'fallback notice');
      await page.getByTestId(T.aiFallbackNotice).scrollIntoViewIfNeeded();
      await saveScreenshot(page, `swr006-ai-fallback-notice-${suffix}`);

      // 4) Empire vs AI: the hidden base zone after the AI Rebels' first turn.
      const c = await createSession(request, EMPIRE_VS_AI);
      await openCore(page, c.sessionId);
      await openSidebarTab(page, 'objects');
      await page.getByTestId(T.hiddenBaseZone).click();
      await expect(page.getByTestId(T.hiddenZonePanel)).toBeVisible();
      await check(T.aiCommanderStatus, 'AI status (Empire)');
      await page.evaluate(() => window.scrollTo(0, 0));
      await saveScreenshot(page, `swr006-empire-vs-ai-hidden-base-${suffix}`, undefined, {
        fullPage: narrow,
      });

      // 5) «Continue AI turn» after a failed run.
      const d = await createSession(request, REBELS_VS_AI);
      await pendingUntilRun(page);
      await page.route(
        (url) => API.automationRun.test(url.pathname),
        (route) => route.fulfill({ status: 503, body: '' }),
        { times: 1 },
      );
      await openCore(page, d.sessionId);
      await expect(page.getByTestId(T.sessionAutomationNotice)).toBeVisible();
      await expect(page.getByTestId(T.sessionAutomationRetry)).toHaveText(texts(lang).retry);
      await check(T.sessionAutomationNotice, 'automation notice');
      await saveScreenshot(page, `swr006-ai-continue-${suffix}`);
    });
  }
}
