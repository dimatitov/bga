/**
 * SWR-008 W0 — golden of the commander requests sent to "OpenAI" by the SWR-006 code (rules-off baseline; TR-3,
 * TC-INT-07, plan-backend §4.1 / §10 W0).
 *
 * Recorded on the code BEFORE any SWR-008 change of `apps/api/src/ai/prompt.ts`: with the rules context off (or absent)
 * the prompt must stay byte-identical to SWR-006, and this file proves it. The game is fully fixed: session id, frozen
 * clock, AI Empire vs human Rebels who only PASS, one round, `commanderFake` whose "model" always answers the FIRST
 * candidate id (real OpenAI SDK, fake fetch — never the network). The first candidate, not the default last one
 * (`PASS`), so the Empire activates systems and moves before it passes: the golden covers several decision points
 * (no activation / mid-activation / after moves), not a single request.
 *
 * What is compared, byte for byte, per request (in order): method, URL, the RAW serialized body string exactly as the
 * SDK handed it to `fetch` (instructions + input + JSON schema + every other field), and the header set. Header
 * values that depend on the machine / Node / SDK build or are random per request (see `VOLATILE_HEADERS`) are recorded
 * as `<volatile>` (name kept, value masked); `authorization` is never recorded.
 *
 * Without the flag the golden file must exist and match. `UPDATE_SWR006_GOLDEN=1` rewrites it — only legitimate on
 * the SWR-006 prompt code (it is the baseline); afterwards run `npx prettier --write` on the fixture (the comparison
 * reads string values, so the file's formatting does not matter).
 *
 * Hand-over: after W0 this file belongs to W6b, who added `aiCommander.rulesContext: 'off'` to `GOLDEN_COMMANDER`
 * (SWR-008 wires the rules block into the commander; with the switch off the requests stay SWR-006 bytes).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiCommanderConfig } from '../src/config/env';
import {
  AutomatedGame,
  commanderFake,
  frozenClock,
  rebelsVsAi,
  startRebellionApp,
} from './support/automation-helpers';
import {
  SENTINEL_KEY,
  decisionText,
  enabledOpenAI,
  okResponse,
  type FakeFetch,
} from './support/openai-fake-fetch';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

const GOLDEN_PATH = fileURLToPath(
  new URL('./fixtures/swr006-commander-requests.json', import.meta.url),
);
const UPDATE = process.env['UPDATE_SWR006_GOLDEN'] === '1';

const SESSION_ID = 'swr008-w0-rules-off-golden';
const GOLDEN_NOW = '2026-11-20T12:00:00.000Z';
/** Commander config of the golden game: the OpenAI commander with the SWR-008 rules context switched off. */
const GOLDEN_COMMANDER: Partial<AiCommanderConfig> = { provider: 'openai', rulesContext: 'off' };

/** Header values that depend on the machine / Node / SDK build, or are random per request. */
const VOLATILE_HEADERS = new Set([
  'user-agent',
  'idempotency-key',
  'x-stainless-arch',
  'x-stainless-lang',
  'x-stainless-os',
  'x-stainless-package-version',
  'x-stainless-runtime',
  'x-stainless-runtime-version',
  'x-stainless-retry-count',
]);

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Raw body string as passed to `fetch` (`null`: no body, e.g. `GET /models/{id}`). */
  body: string | null;
}

interface Golden {
  description: string;
  sessionId: string;
  now: string;
  rounds: number;
  humanCommands: string[];
  requests: RecordedRequest[];
}

/** Wraps a fake fetch: records the exact request bytes before delegating. */
function recording(fake: FakeFetch): { fetch: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const wrapped = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const raw = init?.body;
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
      throw new Error(`golden: unexpected non-string request body (${typeof raw})`);
    }
    const headers: Record<string, string> = {};
    for (const [name, value] of [...new Headers(init?.headers).entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (name === 'authorization') continue;
      headers[name] = VOLATILE_HEADERS.has(name) ? '<volatile>' : value;
    }
    requests.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      url,
      headers,
      body: typeof raw === 'string' ? raw : null,
    });
    return fake.fetch(input, init);
  };
  return { fetch: wrapped as typeof fetch, requests };
}

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

/** Plays the golden game: AI Empire (OpenAI commander on the fake), human Rebels PASS until round 2 begins. */
async function playGoldenGame(): Promise<Golden> {
  const db = createTestDb();
  dbs.push(db);
  const fake = commanderFake((call) => okResponse({ text: decisionText(call.ids[0] ?? 'c1') }));
  const rec = recording(fake);
  const { app } = await startRebellionApp(db, {
    ids: [SESSION_ID],
    clock: frozenClock(GOLDEN_NOW),
    fake: { ...fake, fetch: rec.fetch },
    openai: enabledOpenAI({ maxRetries: 0 }),
    aiCommander: GOLDEN_COMMANDER,
  });
  apps.push(app);

  const { game } = await AutomatedGame.create(app, rebelsVsAi('normal'));
  expect(game.id).toBe(SESSION_ID);
  const humanCommands: string[] = [];
  for (let guard = 0; ; guard += 1) {
    expect(guard, 'the first round did not end').toBeLessThan(50);
    const state = await game.state();
    if (state.outcome !== null || state.round > 1) break;
    if (state.activeSide === game.human) {
      humanCommands.push('PASS');
      await game.send({ type: 'PASS' });
    } else {
      humanCommands.push('<run>');
      await game.run();
    }
  }
  const final = await game.state();
  expect(final.outcome, 'the golden game must not end in round 1').toBeNull();
  expect(final.round).toBe(2);
  // Every recorded call went through the commander fake (none bypassed it).
  expect(rec.requests).toHaveLength(fake.calls.length);

  return {
    description:
      'SWR-008 W0 (TR-3, TC-INT-07): commander requests of the SWR-006 code (rules off). ' +
      'Regenerate only on SWR-006 prompt code: UPDATE_SWR006_GOLDEN=1 (see rules-off-golden.int.test.ts).',
    sessionId: SESSION_ID,
    now: GOLDEN_NOW,
    rounds: 1,
    humanCommands,
    requests: rec.requests,
  };
}

describe('SWR-008 W0: rules-off golden of the SWR-006 commander requests (TR-3, TC-INT-07)', () => {
  it('the commander requests of the fixed one-round game are byte-identical to the SWR-006 golden', async () => {
    const actual = await playGoldenGame();

    // Sanity of the recording itself (a golden of nothing proves nothing).
    const responses = actual.requests.filter(
      (r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/responses'),
    );
    expect(responses.length).toBeGreaterThan(0);
    for (const r of responses) {
      expect(r.body).not.toBeNull();
      const body = JSON.parse(r.body ?? '{}') as { input?: unknown };
      expect(typeof body.input === 'string' && body.input.startsWith('Game (data):\n')).toBe(true);
      expect(r.body).not.toContain(SESSION_ID);
      expect(r.body).not.toContain(SENTINEL_KEY);
      expect(r.body).not.toContain('Rules (reference data');
    }
    for (const r of actual.requests) {
      expect(JSON.stringify(r.headers)).not.toContain(SENTINEL_KEY);
      expect(r.url).not.toContain(SESSION_ID);
    }

    if (UPDATE) {
      mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    expect(
      existsSync(GOLDEN_PATH),
      `golden ${GOLDEN_PATH} is missing — record it with UPDATE_SWR006_GOLDEN=1 on SWR-006 prompt code`,
    ).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;

    expect(actual.sessionId).toBe(golden.sessionId);
    expect(actual.now).toBe(golden.now);
    expect(actual.humanCommands).toEqual(golden.humanCommands);
    expect(actual.requests.length, 'number of requests').toBe(golden.requests.length);
    actual.requests.forEach((req, i) => {
      const want = golden.requests[i];
      expect(req.method, `request ${i}: method`).toBe(want?.method);
      expect(req.url, `request ${i}: url`).toBe(want?.url);
      expect(req.headers, `request ${i}: headers`).toEqual(want?.headers);
      // Byte-for-byte: the exact serialized body (string equality = equal UTF-8 bytes).
      expect(req.body, `request ${i}: body`).toBe(want?.body);
    });
  });
});
