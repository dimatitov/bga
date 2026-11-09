// SWR-005B dev AI diagnostics page `/dev/ai` (test-cases.md §9): TC-E-01, TC-E-02, TC-E-03, TC-E-04 (browser part),
// TC-E-05, TC-S-09, TC-VA-01/02 + screenshots S-1..S-11 of plan-frontend §12 into docs/tasks/SWR-005B/artifacts/screenshots/
// (CURRENT_SCREENSHOT_TASK = 'SWR-005B'). S-12 (real OpenAI) is Analyst-only (A-4) and never taken here.
// Mock mode only: the e2e API runs with OPENAI_ENABLED=false, NODE_ENV=test (apps/api/scripts/e2e-serve.mjs).
// «real API» cases hit the real dev endpoints; «UI states» cases intercept them with `page.route` (Clarification Q-25)
// — error codes, 404/500 status and the paid-request warning cannot (and must not) be produced by the e2e server.
// Every test runs under the browser network guard: any request leaving localhost (OpenAI in particular) fails it.
import { expect, test, type Page, type Request } from '@playwright/test';
import { expectNoHorizontalScroll, expectNotClipped, expectVisibleFocus } from './support/a11y';
import { isFocused, keyboardFocus, saveScreenshot } from './support/board';
import {
  AI_ERROR_CASES,
  DA,
  DEV_AI_DECISION_URL,
  DEV_AI_PATH,
  DEV_BUDGET_KEY,
  PO_ACTION_IDS,
  PO_SCENARIO,
  devAiLocale,
  errorBody,
  errorsLocale,
  expectNoSecrets,
  guardExternalNetwork,
  isDecisionPost,
  isStatusGet,
  json,
  mockDecisionBody,
  mockStatusBody,
  msg,
  openDevAi,
  openaiStatusBody,
  routeStatus,
} from './support/dev-ai';
import { sessionIds } from './support/setup';
import { T } from './support/testids';

const D = { width: 1440, height: 900 };
const M = { width: 375, height: 812 };
const RU = devAiLocale('ru');
const EN = devAiLocale('en');
const ERR_RU = errorsLocale('ru');

test.use({ reducedMotion: 'reduce', viewport: D });

let guard: Awaited<ReturnType<typeof guardExternalNetwork>>;
test.beforeEach(async ({ page }) => {
  guard = await guardExternalNetwork(page);
});
test.afterEach(() => {
  guard.assertClean();
});

/** Holds the next test-decision request until `release()` (real backend: `continue`, otherwise `fulfil`). */
async function holdDecision(
  page: Page,
  answer: 'continue' | { status: number; body: unknown },
): Promise<{ release: () => void }> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(DEV_AI_DECISION_URL, async (route) => {
    await gate;
    if (answer === 'continue') await route.continue();
    else await json(route, answer.status, answer.body);
  });
  return { release };
}

function recordDecisionPosts(page: Page): Request[] {
  const posts: Request[] = [];
  page.on('request', (r) => {
    if (isDecisionPost(r)) posts.push(r);
  });
  return posts;
}

/** Common checks of a successful mock result card (real or fulfilled answer). */
async function expectMockResult(page: Page): Promise<string> {
  const result = page.getByTestId(DA.result);
  await expect(result).toHaveAttribute('data-state', 'success');
  await expect(result).not.toHaveAttribute('aria-busy', 'true');
  const action = page.getByTestId(DA.resultAction);
  const actionId = (await action.getAttribute('data-action-id')) ?? '';
  expect(PO_ACTION_IDS, 'selected action is one of the scenario ids').toContain(actionId);
  await expect(page.getByTestId(DA.resultReason)).not.toBeEmpty();
  await expect(page.getByTestId(DA.resultProvider)).toHaveAttribute('data-provider', 'mock');
  await expect(page.getByTestId(DA.resultModel)).toHaveText(/\S/);
  const ms = Number(await page.getByTestId(DA.resultDuration).getAttribute('data-ms'));
  expect(Number.isInteger(ms) && ms >= 0, `durationMs ${ms} is a non-negative integer`).toBe(true);
  for (const k of ['input', 'cached', 'output', 'total'] as const) {
    await expect(page.getByTestId(DA.tokens(k)), `tokens ${k}`).toHaveAttribute('data-value', '0');
  }
  await expect(page.getByTestId(DA.tokens('reasoning'))).toHaveAttribute('data-value', /^(0|)$/);
  await expect(page.getByTestId(DA.cost)).toHaveAttribute('data-usd', '0');
  await expect(page.getByTestId(DA.costNote)).toBeVisible();
  await expect(page.getByTestId(DA.budgetRemaining)).toBeVisible();
  // The chosen row of the scenario list is marked (data-selected + aria-current), the others are not.
  for (const id of PO_ACTION_IDS) {
    await expect(page.getByTestId(DA.action(id))).toHaveAttribute(
      'data-selected',
      String(id === actionId),
    );
  }
  await expect(page.getByTestId(DA.action(actionId))).toHaveAttribute('aria-current', 'true');
  const submit = page.getByTestId(DA.submit);
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveAttribute('data-pending', 'false');
  return actionId;
}

test.describe('SWR-005B /dev/ai — real API (mock mode, OPENAI_ENABLED=false)', () => {
  test('TC-E-01: status shows mock / OpenAI disabled; PO scenario is listed as test data', async ({
    page,
  }) => {
    const statusResponse = page.waitForResponse((r) => isStatusGet(r.request()));
    await openDevAi(page);
    const res = await statusResponse;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ReturnType<typeof mockStatusBody>;
    // Server-side guard: the e2e API itself reports that OpenAI is off — nothing can be sent to OpenAI.
    expect(body.openaiEnabled).toBe(false);
    expect(body.provider).toBe('mock');
    // e2e-serve drops every OPENAI_* and sets NODE_ENV=test, so no key may reach the e2e API (TR-3, AM-BE-3). Soft: the
    // rest of the case (and its screenshots) still runs if this regresses.
    expect.soft(body.keyConfigured, 'no OpenAI key in the e2e API process').toBe(false);
    expect(body.budget.budgetKey).toBe(DEV_BUDGET_KEY);
    expect(body.budget.spentMicroUsd).toBe(0);
    expectNoSecrets(JSON.stringify(body), 'status body');

    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg(RU, 'title'));
    await expect(page.getByTestId(DA.statusOpenai)).toHaveAttribute('data-enabled', 'false');
    await expect(page.getByTestId(DA.statusOpenai)).toContainText(msg(RU, 'status.openai.off'));
    await expect(page.getByTestId(DA.statusProvider)).toHaveAttribute('data-provider', 'mock');
    await expect.soft(page.getByTestId(DA.statusKey)).toHaveAttribute('data-configured', 'false');
    await expect(page.getByTestId(DA.modelStrategy)).toBeVisible();
    await expect(page.getByTestId(DA.modelTactical)).toBeVisible();
    await expect(page.getByTestId(DA.budget)).toBeVisible();

    const scenario = page.getByTestId(DA.scenario);
    await expect(page.getByTestId(DA.scenarioNote)).toHaveText(msg(RU, 'scenario.note'));
    for (const text of [PO_SCENARIO.faction, PO_SCENARIO.phase, PO_SCENARIO.objective]) {
      await expect(scenario).toContainText(text);
    }
    await expect(scenario.locator('ol > li')).toHaveCount(3);
    for (const a of PO_SCENARIO.availableActions) {
      const row = page.getByTestId(DA.action(a.id));
      await expect(row).toContainText(a.id);
      await expect(row).toContainText(a.type);
      await expect(row).toContainText('target' in a ? a.target : msg(RU, 'scenario.noTarget'));
      await expect(row).toHaveAttribute('data-selected', 'false');
    }
    // Defaults: tactical role (A-4), free mock provider (D-FE-3), button ready, empty result.
    await expect(page.getByTestId(DA.roleOption('tactical'))).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId(DA.providerOption('mock'))).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId(DA.submit)).toHaveText(msg(RU, 'run.submit'));
    await expect(page.getByTestId(DA.result)).toHaveAttribute('data-state', 'empty');
    await expect(page.getByTestId(DA.paidWarning)).toHaveCount(0);

    await saveScreenshot(page, 'dev-ai-1440-status-mock'); // S-1
    await page.setViewportSize(M);
    await expectNoHorizontalScroll(page, '375 status');
    await saveScreenshot(page, 'dev-ai-375-status-mock', undefined, { fullPage: true }); // S-2
  });

  test('TC-E-02: «Тестировать AI» with mock → result card; button disabled while pending; one request', async ({
    page,
  }) => {
    await openDevAi(page);
    const posts = recordDecisionPosts(page);
    const held = await holdDecision(page, 'continue');
    await page.getByTestId(DA.providerOption('mock')).click();
    const responseP = page.waitForResponse((r) => isDecisionPost(r.request()));

    const submit = page.getByTestId(DA.submit);
    // Double click: the in-flight guard must not send a second request (TC-W-03).
    await submit.dblclick();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('data-pending', 'true');
    await expect(submit).toHaveText(msg(RU, 'run.pending'));
    await expect(page.getByTestId(DA.result)).toHaveAttribute('data-state', 'pending');
    await expect(page.getByTestId(DA.result)).toHaveAttribute('aria-busy', 'true');
    for (const id of [DA.roleOption('tactical'), DA.providerOption('auto')]) {
      await expect(page.getByTestId(id), `${id} disabled while pending`).toBeDisabled();
    }
    await saveScreenshot(page, 'dev-ai-1440-pending'); // S-3 (real request, held by the route)
    held.release();

    const res = await responseP;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ReturnType<typeof mockDecisionBody>;
    expect(body.decision.provider).toBe('mock');
    expect(PO_ACTION_IDS).toContain(body.decision.selectedActionId);
    expect(body.decision.reason.trim().length).toBeGreaterThan(0);
    expect(body.decision.model.length).toBeGreaterThan(0);
    expect(body.decision.estimatedCostUsd).toBe(0);
    expect(body.decision.estimatedCostMicroUsd).toBe(0);
    expect(body.decision.attempts).toBe(1);
    expect(body.budget.budgetKey).toBe(DEV_BUDGET_KEY);
    expectNoSecrets(JSON.stringify(body), 'decision body');

    const actionId = await expectMockResult(page);
    expect(actionId).toBe(body.decision.selectedActionId);
    await expect(page.getByTestId(DA.resultModel)).toHaveText(body.decision.model);
    await expect(page.getByTestId(DA.resultReason)).toHaveText(body.decision.reason);

    // Request body: the PO scenario, explicit role/provider; budgetKey is a server decision (never sent).
    expect(posts).toHaveLength(1);
    const sent = posts[0]!.postDataJSON() as Record<string, unknown>;
    expect(sent).toEqual({ scenario: PO_SCENARIO, role: 'tactical', provider: 'mock' });

    await saveScreenshot(page, 'dev-ai-1440-result-mock'); // S-4
    await page.setViewportSize(M);
    await expectNoHorizontalScroll(page, '375 result');
    for (const id of [DA.resultAction, DA.resultModel, DA.cost, DA.tokens('total')]) {
      await expectNotClipped(page.getByTestId(id), `375 ${id}`);
    }
    await saveScreenshot(page, 'dev-ai-375-result-mock', undefined, { fullPage: true }); // S-5
  });

  test('TC-PS-04 (e2e): provider «auto» with OpenAI disabled → hint, and the server answers with mock', async ({
    page,
  }) => {
    await openDevAi(page);
    await page.getByTestId(DA.providerOption('auto')).click();
    await expect(page.getByTestId(DA.autoMockHint)).toHaveText(msg(RU, 'run.autoMockHint'));
    await expect(page.getByTestId(DA.paidWarning)).toHaveCount(0);
    const posts = recordDecisionPosts(page);
    await page.getByTestId(DA.submit).click();
    await expectMockResult(page);
    expect(posts).toHaveLength(1);
    expect((posts[0]!.postDataJSON() as { provider: string }).provider).toBe('auto');
  });

  test('keyboard: role, provider and «Тестировать AI» are reachable and operable without a mouse', async ({
    page,
  }) => {
    await openDevAi(page);
    const posts = recordDecisionPosts(page);
    const tactical = page.getByTestId(DA.roleOption('tactical'));
    await keyboardFocus(page, tactical);
    await expectVisibleFocus(tactical, 'role tactical');
    await page.keyboard.press('ArrowDown');
    const strategy = page.getByTestId(DA.roleOption('strategy'));
    await expect(strategy).toHaveAttribute('aria-checked', 'true');
    expect(await isFocused(strategy)).toBe(true);

    const mock = page.getByTestId(DA.providerOption('mock'));
    await keyboardFocus(page, mock);
    await expectVisibleFocus(mock, 'provider mock');
    await expect(mock).toHaveAttribute('aria-checked', 'true');

    const submit = page.getByTestId(DA.submit);
    await keyboardFocus(page, submit);
    await expectVisibleFocus(submit, 'submit');
    await page.keyboard.press('Enter');
    await expectMockResult(page);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.postDataJSON()).toMatchObject({ role: 'strategy', provider: 'mock' });
  });

  test('TC-S-09: no key / OPENAI_API_KEY in DOM, storage or dev-AI responses', async ({ page }) => {
    const bodies: string[] = [];
    page.on('response', async (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/dev/ai/')) bodies.push(await r.text());
    });
    await openDevAi(page);
    await page.getByTestId(DA.submit).click();
    await expectMockResult(page);
    // Status is refetched after the mutation (queries.ts) — wait for it so its body is checked too.
    await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(3);
    const dump = await page.evaluate(() => ({
      html: document.documentElement.outerHTML,
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    expectNoSecrets(dump.html, 'DOM');
    expectNoSecrets(dump.local, 'localStorage');
    expectNoSecrets(dump.session, 'sessionStorage');
    for (const b of bodies) expectNoSecrets(b, 'dev-ai response');
    // No key input anywhere on the page (TC-W-09).
    await expect(page.locator('input[type="password"], input[name*="key" i]')).toHaveCount(0);
  });

  test('TC-E-05 + S-10/S-11: Settings dev link → /dev/ai (en); back to the catalog; sessions untouched', async ({
    page,
    request,
  }) => {
    const before = await sessionIds(request);
    await page.setViewportSize(M);
    await page.goto('/settings');
    const link = page.getByTestId(DA.settingsLink);
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expectNoHorizontalScroll(page, '375 settings');
    await saveScreenshot(page, 'settings-375-dev-link', undefined, { fullPage: true }); // S-10

    await page.setViewportSize(D);
    await page.getByTestId(T.settingsLanguage('en')).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${DEV_AI_PATH}$`));
    await expect(page.getByTestId(DA.status)).toHaveAttribute('data-state', 'ready');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg(EN, 'title'));
    await expect(page.getByTestId(DA.submit)).toHaveText(msg(EN, 'run.submit'));
    await page.getByTestId(DA.submit).click();
    await expectMockResult(page);
    await expect(page.getByTestId(DA.costNote)).toHaveText(msg(EN, 'result.costNote'));
    await saveScreenshot(page, 'dev-ai-1440-en-result'); // S-11

    await page.getByTestId(DA.back).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByTestId(T.navCatalog).click();
    await expect(page.getByTestId(T.gameCatalog)).toBeVisible();
    // The diagnostics page never touches game sessions (AC-11, A-1).
    expect((await sessionIds(request)).sort()).toEqual([...before].sort());
  });
});

test.describe('SWR-005B /dev/ai — UI states (page.route, Q-25)', () => {
  test('TC-E-03 / TC-W-05: every AI_* code renders a localized role=alert; button usable again', async ({
    page,
  }) => {
    await routeStatus(page, 200, mockStatusBody());
    await openDevAi(page);
    const submit = page.getByTestId(DA.submit);
    const alert = page.getByTestId(DA.error);

    // A successful answer first: an error afterwards must not keep showing the old result.
    await page.route(DEV_AI_DECISION_URL, (route) =>
      json(route, 200, mockDecisionBody('action-2')),
    );
    await submit.click();
    await expect(page.getByTestId(DA.resultAction)).toHaveAttribute('data-action-id', 'action-2');

    for (const c of AI_ERROR_CASES) {
      await page.unroute(DEV_AI_DECISION_URL);
      await page.route(DEV_AI_DECISION_URL, (route) =>
        json(
          route,
          c.status,
          errorBody(c.code, c.messageKey, 'details' in c ? c.details : undefined),
        ),
      );
      await submit.click();
      await expect(alert, c.code).toHaveAttribute('data-code', c.code);
      await expect(alert).toHaveAttribute('role', 'alert');
      await expect(alert).toContainText(msg(RU, `error.${c.code}.title`));
      await expect(alert).toContainText(msg(ERR_RU, c.messageKey.replace(/^errors\./, '')));
      await expect(alert).toContainText(msg(RU, `error.${c.code}.hint`));
      const text = (await alert.innerText()).trim();
      expect(text, `${c.code}: no raw keys / codes in the text`).not.toMatch(
        /errors\.|devAi:|AI_[A-Z_]+|\b(403|429|502|503|504)\b|undefined/,
      );
      if (c.code === 'AI_RATE_LIMITED') await expect(alert).toContainText('30');
      if (c.code === 'AI_TIMEOUT') await expect(alert).toContainText('3');
      // The previous success is gone; the button is ready for a new attempt.
      await expect(page.getByTestId(DA.result)).toHaveAttribute('data-state', 'error');
      await expect(page.getByTestId(DA.resultAction)).toHaveCount(0);
      await expect(page.getByTestId(DA.action('action-2'))).toHaveAttribute(
        'data-selected',
        'false',
      );
      await expect(submit).toBeEnabled();
      if (c.code === 'AI_BUDGET_EXCEEDED') {
        await saveScreenshot(page, 'dev-ai-1440-error-budget'); // S-7
      }
      if (c.code === 'AI_INVALID_DECISION') {
        await page.setViewportSize(M);
        await expectNoHorizontalScroll(page, '375 invalid decision');
        await saveScreenshot(page, 'dev-ai-375-error-invalid', undefined, { fullPage: true }); // S-8
        await page.setViewportSize(D);
      }
    }

    // Generic errors: 400 VALIDATION and a network failure → generic title, platform texts.
    await page.unroute(DEV_AI_DECISION_URL);
    await page.route(DEV_AI_DECISION_URL, (route) =>
      json(route, 400, errorBody('VALIDATION', 'errors.validation')),
    );
    await submit.click();
    await expect(alert).toHaveAttribute('data-code', 'VALIDATION');
    await expect(alert).toContainText(msg(RU, 'error.generic.title'));
    await page.unroute(DEV_AI_DECISION_URL);
    await page.route(DEV_AI_DECISION_URL, (route) => route.abort('connectionrefused'));
    await submit.click();
    await expect(alert).not.toHaveAttribute('data-code', 'VALIDATION');
    await expect(alert).toContainText(msg(RU, 'error.generic.title'));
    await expect(alert).toContainText(msg(ERR_RU, 'code.NETWORK'));
    await expect(submit).toBeEnabled();

    // A new success clears the error alert.
    await page.unroute(DEV_AI_DECISION_URL);
    await page.route(DEV_AI_DECISION_URL, (route) => json(route, 200, mockDecisionBody()));
    await submit.click();
    await expectMockResult(page);
    await expect(alert).toHaveCount(0);
  });

  test('pending with an intercepted answer: controls disabled until the answer arrives', async ({
    page,
  }) => {
    await routeStatus(page, 200, mockStatusBody());
    await openDevAi(page);
    const posts = recordDecisionPosts(page);
    const held = await holdDecision(page, { status: 200, body: mockDecisionBody() });
    const submit = page.getByTestId(DA.submit);
    await submit.click();
    await expect(submit).toBeDisabled();
    // A forced click on the disabled button does not send a second request.
    await submit.click({ force: true }).catch(() => undefined);
    await expect(page.getByTestId(DA.result)).toHaveAttribute('aria-busy', 'true');
    held.release();
    await expectMockResult(page);
    expect(posts).toHaveLength(1);
  });

  test('status card: 404 → «unavailable» (S-9); 500 → error alert + retry recovers', async ({
    page,
  }) => {
    await routeStatus(page, 404, errorBody('NOT_FOUND', 'errors.notFound'));
    await openDevAi(page, 'unavailable');
    await expect(page.getByTestId(DA.status)).toContainText(msg(RU, 'status.unavailable'));
    // The button stays usable: status is informational (plan-frontend §5.2).
    await expect(page.getByTestId(DA.submit)).toBeEnabled();
    await saveScreenshot(page, 'dev-ai-1440-status-unavailable'); // S-9

    await routeStatus(page, 500, errorBody('INTERNAL', 'errors.internal'));
    await openDevAi(page, 'error');
    const statusError = page.getByTestId(DA.statusError);
    await expect(statusError).toHaveAttribute('role', 'alert');
    await expect(statusError).toContainText(msg(RU, 'status.errorTitle'));
    await routeStatus(page, 200, mockStatusBody());
    await page.getByTestId(DA.statusRetry).click();
    await expect(page.getByTestId(DA.status)).toHaveAttribute('data-state', 'ready');
  });

  test('S-6: provider «auto» with OpenAI enabled (status intercepted) shows the paid-request warning', async ({
    page,
  }) => {
    const posts = recordDecisionPosts(page);
    await routeStatus(page, 200, openaiStatusBody());
    await openDevAi(page);
    await expect(page.getByTestId(DA.statusOpenai)).toHaveAttribute('data-enabled', 'true');
    await expect(page.getByTestId(DA.paidWarning)).toHaveCount(0);
    await page.getByTestId(DA.providerOption('auto')).click();
    await expect(page.getByTestId(DA.paidWarning)).toHaveText(msg(RU, 'run.paidWarning'));
    await expect(page.getByTestId(DA.autoMockHint)).toHaveCount(0);
    await saveScreenshot(page, 'dev-ai-1440-paid-warning'); // S-6
    // Nothing is sent without a click (no request is ever made in this test).
    expect(posts).toHaveLength(0);
  });
});
