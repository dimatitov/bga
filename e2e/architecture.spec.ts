// Network-level architecture checks: TC-E2E-30 (hidden info), TC-E2E-31 (only POST /api/sessions and
// POST /commands mutate) — SWR-002 AC-12; SWR-003: sessions API, leak check also covers `GET /api/sessions*`
// (`SessionSummary.details`, TC-SES-13), the game page and the catalog. SWR-005 (Q-1): rewritten on core-v1
// (activation / move / finish / pass as the Empire; base-id scanner TR-3 instead of mock hidden pieces).
// Hidden information is checked on server responses, not on DOM (skill browser-qa §4).
import { expect, test } from '@playwright/test';
import {
  API,
  asCore,
  findKeyPaths,
  findRebelBases,
  planActivation,
  REBELLION,
  scanForBase,
  type SessionResponse,
} from './support/api';
import { gamePath, newSessionPath, openCore, recordApi, type RecordedCall } from './support/board';
import { armLeader, clickSystem, commandViaUi, finishViaUi, passViaUi } from './support/core';
import { storedRebelBase } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

test('TC-E2E-30 + TC-E2E-31 (core-v1): Empire session leaks no secrets; only allowed requests mutate', async ({
  page,
}) => {
  const recorder = recordApi(page);
  const calls: RecordedCall[] = recorder.calls;
  const requests: { method: string; url: string }[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/'))
      requests.push({ method: r.method(), url: r.url() });
  });

  // SWR-005 scenarios 2/1 as the Empire through the UI: create, activate (not the base), move, finish, pass.
  await page.goto(newSessionPath(REBELLION));
  await page.getByTestId(T.setupFaction('empire')).click();
  await page.getByTestId(T.setupOpponent('ai')).click();
  const created = page.waitForResponse(
    (r) => API.sessions.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
  );
  await page.getByTestId(T.setupStart).click();
  const body = (await (await created).json()) as SessionResponse;
  const sessionId = body.sessionId;
  const baseId = await storedRebelBase(sessionId); // TR-3 oracle (DB), not an Empire-facing response
  await openCore(page, sessionId);
  const view = asCore(body.view);
  const plan = planActivation(view, [baseId]);

  await armLeader(page, plan.leaderId);
  await commandViaUi(page, () => clickSystem(page, plan.systemId));
  await page.getByTestId(T.movePiece(plan.pieceId)).check();
  await commandViaUi(page, () => page.getByTestId(T.moveSubmit(plan.fromSystemId)).click());
  await finishViaUi(page);
  await passViaUi(page, true);
  await page.reload();
  await openCore(page, sessionId);
  // The game page lists sessions (`GET /api/sessions?gameId=`) — `details` must not leak hidden info either.
  const listed = page.waitForResponse(
    (r) => API.sessions.test(new URL(r.url()).pathname) && r.request().method() === 'GET',
  );
  await page.goto(gamePath(REBELLION));
  expect((await listed).status()).toBe(200);
  await page.goto('/');
  await page.goto('/settings');

  // TC-E2E-30
  await recorder.settle();
  expect(calls.length).toBeGreaterThan(0);
  expect(
    calls.some((c) => c.method === 'GET' && API.sessions.test(new URL(c.url).pathname)),
    'GET /api/sessions recorded',
  ).toBe(true);
  for (const c of calls) {
    for (const base of findRebelBases(c.body)) {
      expect(base.systemId, `rebelBase.systemId leaked in ${c.method} ${c.url}`).toBeNull();
    }
    expect(findKeyPaths(c.body, 'state'), `"state" key in ${c.method} ${c.url}`).toEqual([]);
    // SWR-004 FORBIDDEN fields (test-cases.md Conventions): idempotency key and internal snapshot version.
    for (const k of ['idempotencyKey', 'idempotencyHash', 'schemaVersion', 'aiFaction']) {
      expect(findKeyPaths(c.body, k), `"${k}" key in ${c.method} ${c.url}`).toEqual([]);
    }
    // SWR-005 TR-3: the base system id only in the static catalogue / ACTIVATE_SYSTEM.systemIds. (The SWR-002
    // "hidden typeKey" sub-check does not apply to core-v1: units on the base are shown with their type in the
    // «location unknown» zone, spec UX.)
    expect(scanForBase(c.body, baseId), `base id in ${c.method} ${c.url}`).toEqual([]);
  }

  // TC-E2E-31
  const allowed = [API.sessions, API.commands];
  for (const r of requests) {
    const url = new URL(r.url);
    expect(url.search.includes('viewer='), `viewer param in ${r.url}`).toBe(false);
    if (r.method !== 'GET') {
      expect(r.method, `mutating request ${r.method} ${r.url}`).toBe('POST');
      expect(
        allowed.some((re) => re.test(url.pathname)),
        `unexpected POST ${url.pathname}`,
      ).toBe(true);
    }
  }
});
