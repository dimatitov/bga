// SWR-005B dev AI diagnostics page `/dev/ai` (plan-frontend §5–§9, specification «Contract → API / Frontend»):
// testids, wire fixtures (local minimal mirror of `@bga/platform` ai-dev — the root workspace does not depend on it),
// `page.route` helpers for the UI-only error cases (Clarification Q-25) and the external-network guard (TC-E-04).
// e2e never talks to OpenAI: the API runs with OPENAI_ENABLED=false, NODE_ENV=test (e2e-serve.mjs) and the browser
// guard below aborts and records any request to a non-local host.
import { readFileSync } from 'node:fs';
import { expect, type Page, type Request, type Route } from '@playwright/test';

/** Page path (registered only when `import.meta.env.DEV`; the e2e web server is the Vite dev server). */
export const DEV_AI_PATH = '/dev/ai';
/** API paths through the Vite proxy. */
export const DEV_AI_STATUS_URL = '**/api/dev/ai/status';
export const DEV_AI_DECISION_URL = '**/api/dev/ai/test-decision';
export const isDecisionPost = (r: Request) =>
  r.method() === 'POST' && new URL(r.url()).pathname === '/api/dev/ai/test-decision';
export const isStatusGet = (r: Request) =>
  r.method() === 'GET' && new URL(r.url()).pathname === '/api/dev/ai/status';

/** The only budget key of the dev endpoint (AM-BE-6). */
export const DEV_BUDGET_KEY = 'dev-diagnostics';

/** PO test scenario (specification «PO test scenario»; test data, not Rebellion rules). */
export const PO_SCENARIO = {
  faction: 'empire',
  phase: 'command',
  objective: 'Strengthen imperial control',
  availableActions: [
    { id: 'action-1', type: 'MOVE_FLEET', target: 'corellia' },
    { id: 'action-2', type: 'RECRUIT', target: 'coruscant' },
    { id: 'action-3', type: 'PASS' },
  ],
} as const;
export const PO_ACTION_IDS: readonly string[] = PO_SCENARIO.availableActions.map((a) => a.id);

/** testids of the page (plan-frontend §9 — final, FE-AI accepted). */
export const DA = {
  page: 'dev-ai-page',
  back: 'dev-ai-back',
  badge: 'dev-ai-badge',
  status: 'dev-ai-status',
  statusOpenai: 'dev-ai-status-openai',
  statusProvider: 'dev-ai-status-provider',
  statusKey: 'dev-ai-status-key',
  statusError: 'dev-ai-status-error',
  statusRetry: 'dev-ai-status-retry',
  statusRefresh: 'dev-ai-status-refresh',
  modelStrategy: 'dev-ai-model-strategy',
  modelTactical: 'dev-ai-model-tactical',
  budget: 'dev-ai-budget',
  run: 'dev-ai-run',
  role: 'dev-ai-role',
  roleOption: (r: 'tactical' | 'strategy') => `dev-ai-role-${r}`,
  provider: 'dev-ai-provider',
  providerOption: (p: 'mock' | 'auto') => `dev-ai-provider-${p}`,
  paidWarning: 'dev-ai-paid-warning',
  autoMockHint: 'dev-ai-auto-mock-hint',
  submit: 'dev-ai-submit',
  scenario: 'dev-ai-scenario',
  scenarioNote: 'dev-ai-scenario-note',
  action: (id: string) => `dev-ai-action-${id}`,
  result: 'dev-ai-result',
  resultAction: 'dev-ai-result-action',
  resultReason: 'dev-ai-result-reason',
  resultProvider: 'dev-ai-result-provider',
  resultModel: 'dev-ai-result-model',
  resultDuration: 'dev-ai-result-duration',
  resultAttempts: 'dev-ai-result-attempts',
  tokens: (k: 'input' | 'cached' | 'output' | 'reasoning' | 'total') => `dev-ai-tokens-${k}`,
  cost: 'dev-ai-cost',
  costNote: 'dev-ai-cost-note',
  pricing: 'dev-ai-pricing',
  budgetRemaining: 'dev-ai-budget-remaining',
  error: 'dev-ai-error',
  settingsLink: 'settings-dev-ai-link',
} as const;

/** UI strings of the page and platform error texts, read from the web locales (no copy of translations here). */
type Json = Record<string, unknown>;
const readJson = (rel: string): Json =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as Json;
export const devAiLocale = (lng: 'ru' | 'en') =>
  readJson(`../../apps/web/src/dev/ai/locales/${lng}.json`);
export const errorsLocale = (lng: 'ru' | 'en') =>
  readJson(`../../apps/web/src/locales/${lng}/errors.json`);
/** `get(obj, 'a.b.c')` for locale JSON. */
export function msg(obj: Json, key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj);
  if (typeof v !== 'string') throw new Error(`locale key not found: ${key}`);
  return v;
}

// ---------- wire fixtures (route-intercepted UI cases only) ----------

export interface Budget {
  budgetKey: string;
  spentUsd: number;
  spentMicroUsd: number;
  limitUsd: number | null;
  limitMicroUsd: number | null;
  remainingUsd: number | null;
  remainingMicroUsd: number | null;
}

/** Status as the e2e API reports it (OPENAI_ENABLED=false, AM-BE-9: no limit). */
export function mockStatusBody() {
  return {
    openaiEnabled: false,
    provider: 'mock',
    keyConfigured: false,
    models: { strategy: { id: null, available: null }, tactical: { id: null, available: null } },
    budget: {
      budgetKey: DEV_BUDGET_KEY,
      spentUsd: 0,
      spentMicroUsd: 0,
      limitUsd: null,
      limitMicroUsd: null,
      remainingUsd: null,
      remainingMicroUsd: null,
    } satisfies Budget,
  };
}

/** Status with OpenAI enabled (only to render the paid-request warning, S-6; no request is sent). */
export function openaiStatusBody() {
  return {
    openaiEnabled: true,
    provider: 'openai',
    keyConfigured: true,
    models: {
      strategy: { id: 'gpt-6.1-sol', available: true },
      tactical: { id: 'gpt-6-luna', available: null },
    },
    budget: {
      budgetKey: DEV_BUDGET_KEY,
      spentUsd: 0.0012,
      spentMicroUsd: 1200,
      limitUsd: 0.25,
      limitMicroUsd: 250000,
      remainingUsd: 0.2488,
      remainingMicroUsd: 248800,
    } satisfies Budget,
  };
}

/** Successful mock decision (same shape as the real mock provider answer). */
export function mockDecisionBody(selectedActionId = 'action-1') {
  return {
    decision: {
      selectedActionId,
      reason: 'Mock provider: deterministic choice of the first available action.',
      provider: 'mock',
      model: 'mock-deterministic-v1',
      durationMs: 3,
      attempts: 1,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        totalTokens: 0,
      },
      estimatedCostUsd: 0,
      estimatedCostMicroUsd: 0,
      pricingVersion: 'openai-2026-11-08',
    },
    budget: mockStatusBody().budget,
  };
}

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
export const errorBody = (code: string, messageKey: string, details?: Record<string, unknown>) => ({
  ok: false,
  error: { code, messageKey, ...(details ? { details } : {}) },
});

/** Error cases of the dev endpoint as the UI must render them (spec Contract «API», plan-backend §6.2). */
export const AI_ERROR_CASES = [
  { code: 'AI_NOT_CONFIGURED', status: 503, messageKey: 'errors.aiModelUnavailable' },
  {
    code: 'AI_BUDGET_EXCEEDED',
    status: 429,
    messageKey: 'errors.aiBudgetExceeded',
    details: { remainingUsd: 0, limitUsd: 0.25 },
  },
  {
    code: 'AI_RATE_LIMITED',
    status: 429,
    messageKey: 'errors.aiDevRateLimited',
    details: { retryAfterSeconds: 30 },
  },
  { code: 'AI_TIMEOUT', status: 504, messageKey: 'errors.aiTimeout', details: { attempts: 3 } },
  {
    code: 'AI_PROVIDER_ERROR',
    status: 502,
    messageKey: 'errors.aiQuota',
    details: { attempts: 1 },
  },
  {
    code: 'AI_INVALID_DECISION',
    status: 502,
    messageKey: 'errors.aiInvalidDecision',
    details: { attempts: 1 },
  },
  { code: 'AI_DEV_FORBIDDEN', status: 403, messageKey: 'errors.aiDevForbidden' },
] as const;

/** Serves the status from a fixture (route-intercepted cases). */
export async function routeStatus(page: Page, status: number, body: unknown): Promise<void> {
  await page.unroute(DEV_AI_STATUS_URL);
  await page.route(DEV_AI_STATUS_URL, (route) => json(route, status, body));
}

/** Opens `/dev/ai` and waits for the page root and a settled status card. */
export async function openDevAi(
  page: Page,
  expectedStatusState: 'ready' | 'unavailable' | 'error' = 'ready',
): Promise<void> {
  await page.goto(DEV_AI_PATH);
  await expect(page.getByTestId(DA.page)).toBeVisible();
  await expect(page.getByTestId(DA.status)).toHaveAttribute('data-state', expectedStatusState, {
    timeout: 15_000,
  });
}

// ---------- external network guard (TC-E-04, AC-13) ----------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Browser-side guard: every request to a non-local http(s) host (OpenAI in particular) is aborted and recorded;
 * `assertClean()` fails the test if anything was recorded. Server-side protection is the API config
 * (`openaiEnabled:false` asserted from `/api/dev/ai/status`) and the API's own network guard (W1/TR-1).
 */
export async function guardExternalNetwork(page: Page): Promise<{
  external: string[];
  assertClean: () => void;
}> {
  const external: string[] = [];
  await page.route(/^https?:\/\/([^/]*\.)?openai\.com(\/|:|$)/i, async (route) => {
    external.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.protocol.startsWith('http')) return;
    if (!LOCAL_HOSTS.has(url.hostname)) external.push(r.url());
  });
  return {
    external,
    assertClean: () =>
      expect(external, 'no browser request may leave localhost (OpenAI in particular)').toEqual([]),
  };
}

/** Fails if `text` carries anything that looks like an OpenAI key or the key's env name (TC-S-09). */
export function expectNoSecrets(text: string, label: string): void {
  expect(text, `${label}: no "sk-" key literal`).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
  expect(text, `${label}: no OPENAI_API_KEY`).not.toContain('OPENAI_API_KEY');
  expect(text, `${label}: no Authorization/Bearer`).not.toMatch(/Authorization|Bearer /);
}
