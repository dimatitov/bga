// SWR-004 PO scenarios TC-001..TC-006 (test-cases.md §5) + TC-E2E-RT-01 — AC-01..AC-10, AC-13.
// Every case checks the UI, the network (request/response bodies) and the server state through the public API.
// Texts are not asserted (Q-18): testids and attributes only. Failure injection: `page.route` only (TR-3).
// SWR-005: new sessions are core-v1 — table checks use the core header (`turn-indicator`, `time-track`), the details
// carry `rulesEngine/winner/reputation`, TC-004's "move" is an activation (AI answers nothing during it).
import { expect, test } from '@playwright/test';
import {
  actionOf,
  asCore,
  createSession,
  DETAILS_KEYS,
  EMPIRE_VS_AI_HARD,
  getSession,
  IDEMPOTENT_REPLAY_HEADER,
  listSessions,
  newIdempotencyKey,
  planActivation,
  postSession,
  REBELLION,
  SETTINGS_KEYS,
  UUID_RE,
  type ErrorBody,
  type SessionResponse,
} from './support/api';
import {
  gamePath,
  newSessionPath,
  openSidebarTab,
  SESSION_URL,
  sessionPath,
  urlOf,
  version,
  waitForTable,
} from './support/board';
import { storedRebelBase } from './support/seed';
import { armLeader, clickSystem, commandViaUi } from './support/core';
import {
  expectCaption,
  expectErrorState,
  expectFaction,
  expectFormDefaults,
  expectHumanErrorText,
  expectOpponent,
  fulfilError,
  idempotencyKeyOf,
  isCreatePost,
  recordCreates,
  routeCreate,
  sessionIds,
  newSessionIdsSince,
  waitCreate,
} from './support/setup';
import { T } from './support/testids';

test.describe('SWR-004 PO TC-001..TC-006: game setup', () => {
  test('TC-001: standard AI game — catalog → Rebellion → New game → defaults → Start → prototype table', async ({
    page,
    request,
  }) => {
    const before = await sessionIds(request);
    await page.goto('/');
    await page.getByTestId(T.gameCard(REBELLION)).click();
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    await page.getByTestId(T.gameNewSession).click();
    await expect(page).toHaveURL(urlOf(newSessionPath(REBELLION))); // AC-01

    await expectFormDefaults(page); // AC-02

    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    const req = res.request();
    expect(res.status()).toBe(201);
    expect(req.postDataJSON()).toEqual({
      gameId: REBELLION,
      setup: {
        playerFaction: 'rebels',
        opponentType: 'ai',
        aiDifficulty: 'normal',
        ruleset: 'base',
        gameMode: 'digital',
      },
    });
    expect(idempotencyKeyOf(req), 'Idempotency-Key is a UUID').toMatch(UUID_RE);

    const body = (await res.json()) as SessionResponse;
    expect(Object.keys(body).sort()).toEqual(['gameId', 'sessionId', 'settings', 'status', 'view']);
    expect(body.status).toBe('prototype'); // AC-13
    expect(Object.keys(body.settings).sort()).toEqual([...SETTINGS_KEYS]);
    expect(body.settings).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      ruleset: 'base',
      gameMode: 'digital',
    });
    const view = asCore(body.view);
    expect(view.viewer).toBe('rebels');
    expect(view.activeSide).toBe('rebels');

    // AC-07: the table of the new session, labelled as a prototype.
    await expect(page).toHaveURL(urlOf(sessionPath(body.sessionId)));
    await waitForTable(page, body.sessionId);
    await expect(page.getByTestId(T.prototypeBadge)).toBeVisible();
    await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-status', 'prototype');
    await expect(page.getByTestId(T.turnIndicator)).toHaveAttribute('data-side', 'rebels');
    await expect(page.getByTestId(T.endTurn), 'no "pass the turn" against AI').toHaveCount(0);

    // AC-06: exactly one new session, stored with its settings and status.
    expect(await newSessionIdsSince(request, before)).toEqual([body.sessionId]);
    const summary = (await listSessions(request, REBELLION)).find(
      (s) => s.sessionId === body.sessionId,
    );
    expect(summary?.status).toBe('prototype');
    expect(Object.keys(summary?.details ?? {}).sort()).toEqual(DETAILS_KEYS);
    expect(summary?.details).toEqual({
      ...body.settings,
      round: 1,
      phase: 'command',
      rulesEngine: 'core-v1',
      winner: null,
      reputation: 14,
    });
    const stored = await getSession(request, body.sessionId);
    expect(stored.settings).toEqual(body.settings);
    expect(stored.status).toBe('prototype');
  });

  test('TC-002: play as the Empire — caption flips, AI hard, view for the Empire, Rebel base hidden', async ({
    page,
  }) => {
    await page.goto(newSessionPath(REBELLION));
    await expectCaption(page, 'empire');
    await page.getByTestId(T.setupFaction('empire')).click();
    await expectFaction(page, 'empire');
    await expectCaption(page, 'rebels'); // AC-03: "AI plays the Rebels"
    await page.getByTestId(T.setupFaction('rebels')).click();
    await expectCaption(page, 'empire'); // and back
    await page.getByTestId(T.setupFaction('empire')).click();
    await expectCaption(page, 'rebels');
    await page.getByTestId(T.setupDifficultyOption('hard')).click();
    await expect(page.getByTestId(T.setupDifficultyOption('hard'))).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({
      setup: { playerFaction: 'empire', opponentType: 'ai', aiDifficulty: 'hard' },
    });
    const body = (await res.json()) as SessionResponse;
    expect(body.settings.opponentFaction).toBe('rebels');
    const view = asCore(body.view);
    expect(view.viewer).toBe('empire');
    // Hidden information is checked on the server response, not the DOM (browser-qa §4).
    expect(view.rebelBase.systemId).toBeNull();
    const activate = actionOf(view, 'ACTIVATE_SYSTEM');
    expect(activate?.leaderIds.length).toBeGreaterThan(0);
    for (const id of activate!.leaderIds) {
      expect(view.leaders.find((l) => l.id === id)?.owner).toBe('empire');
    }

    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    await expect(page.getByTestId(T.turnIndicator)).toHaveAttribute('data-side', 'empire');
  });

  test('TC-003: against a second player — difficulty hidden, no aiDifficulty sent, null stored, pass-turn shown', async ({
    page,
    request,
  }) => {
    await page.goto(newSessionPath(REBELLION));
    await page.getByTestId(T.setupOpponent('human')).click();
    await expectOpponent(page, 'human'); // AC-04: difficulty block is gone
    await expectCaption(page, 'empire'); // "Second player plays the Empire"

    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const sent = res.request().postDataJSON() as { setup: Record<string, unknown> };
    expect(sent.setup).toEqual({
      playerFaction: 'rebels',
      opponentType: 'human',
      ruleset: 'base',
      gameMode: 'digital',
    });
    const body = (await res.json()) as SessionResponse;
    expect(body.settings).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect((await getSession(request, body.sessionId)).settings.aiDifficulty).toBeNull();

    // SWR-005: in core-v1 the turn passes automatically (no "pass the turn" button, spec Hot-seat).
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    await expect(page.getByTestId(T.endTurn)).toHaveCount(0);
    await expect(page.getByTestId(T.passTurn)).toBeEnabled();
    await expect(page.getByTestId(T.turnIndicator)).toContainText(/\S/);
    expect(asCore(body.view).legalActions.map((a) => a.type)).toContain('PASS');
  });

  test('TC-004: restore — reload and a fresh browser context show the same session, settings and move', async ({
    page,
    browser,
    request,
  }) => {
    // AC-08 (c) "backend restart" is not possible in e2e (e2e-serve.mjs recreates the DB): Q-14 → TC-I-24.
    test.info().annotations.push({
      type: 'note',
      description: 'backend restart part of TC-004 is covered by integration TC-I-24 (Q-14)',
    });
    const { sessionId, view, settings } = await createSession(request, EMPIRE_VS_AI_HARD);
    const plan = planActivation(view, [await storedRebelBase(sessionId)]);

    // (a) one move (an activation) through the UI, then reload.
    await page.goto(sessionPath(sessionId));
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await armLeader(page, plan.leaderId);
    await commandViaUi(page, () => clickSystem(page, plan.systemId));
    await expect.poll(() => version(page)).toBe(view.version + 1);

    await page.reload();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    expect(await version(page)).toBe(view.version + 1);
    await expect(page.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
      'data-activated',
      'true',
    );
    await openSidebarTab(page, 'game');
    await expect(page.getByTestId(T.gameInfoStatus)).toHaveAttribute('data-status', 'prototype');

    // (b) fresh context: game page → this session's row → its table.
    const context = await browser.newContext();
    try {
      const p2 = await context.newPage();
      await p2.goto(gamePath(REBELLION));
      const row = p2.getByTestId(T.recentSession(sessionId));
      await expect(row).toBeVisible();
      await expect(row.getByTestId(T.recentSessionStatus)).toHaveAttribute(
        'data-status',
        'prototype',
      );
      await expect(row.getByTestId(T.recentSessionFaction)).not.toBeEmpty();
      await expect(row.getByTestId(T.recentSessionOpponent)).not.toBeEmpty();
      await expect(row.getByTestId(T.recentSessionDate)).toHaveAttribute(
        'datetime',
        /\d{4}-\d{2}-\d{2}T/,
      );
      // the session was just updated by the move → it is the newest → "Continue" opens it
      await p2.getByTestId(T.gameContinue).click();
      await expect(p2).toHaveURL(urlOf(sessionPath(sessionId)));
      await waitForTable(p2, sessionId);
      expect(await version(p2)).toBe(view.version + 1);
      await p2.goBack();
      await p2.getByTestId(T.recentSession(sessionId)).click();
      await waitForTable(p2, sessionId);
      await expect(p2.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
        'data-activated',
        'true',
      );
    } finally {
      await context.close();
    }
    const after = await getSession(request, sessionId);
    expect(after.settings).toEqual(settings);
    expect(after.status).toBe('prototype');
    expect(asCore(after.view).version).toBe(view.version + 1);
  });

  test('TC-005: server errors (500, 422, network) keep the form, show an alert and a retry works', async ({
    page,
    request,
  }) => {
    const before = await sessionIds(request);
    await page.goto(newSessionPath(REBELLION));
    await page.getByTestId(T.setupFaction('empire')).click();
    await page.getByTestId(T.setupOpponent('human')).click();

    let mode: '500' | '422' | 'abort' = '500';
    const intercepted: (string | undefined)[] = [];
    const matcher = await routeCreate(page, async (route) => {
      intercepted.push(idempotencyKeyOf(route.request()));
      if (mode === '500') return fulfilError(route, 500, 'INTERNAL', 'errors.internal');
      if (mode === '422')
        return fulfilError(route, 422, 'SETUP_UNSUPPORTED', 'errors.rulesetUnavailable', {
          unsupported: ['ruleset'],
        });
      return route.abort('failed');
    });

    const texts: string[] = [];
    for (const m of ['500', '422', 'abort'] as const) {
      mode = m;
      const settled =
        m === 'abort'
          ? page.waitForEvent('requestfailed', (r) => isCreatePost(r))
          : page.waitForResponse((r) => isCreatePost(r.request()));
      await page.getByTestId(T.setupStart).click();
      await settled;
      expect(intercepted).toHaveLength(texts.length + 1);
      if (m === '422') {
        // the previous alert is replaced, not left over (D-SW4-12: the error hides on submit)
        await expect(page.getByTestId(T.setupError)).not.toHaveText(texts[0] ?? '');
      }
      const text = await expectErrorState(page);
      expectHumanErrorText(text); // TC-VA-13
      texts.push(text);
      await expect(page).toHaveURL(urlOf(newSessionPath(REBELLION)));
      await expectFaction(page, 'empire'); // values kept
      await expectOpponent(page, 'human');
    }
    // Nothing reached the server.
    expect(await newSessionIdsSince(request, before)).toEqual([]);

    // Retry after unroute succeeds: exactly one new session with the kept values.
    await page.unroute(matcher);
    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    expect(body.settings).toMatchObject({ playerFaction: 'empire', opponentType: 'human' });
    await expect(page).toHaveURL(urlOf(sessionPath(body.sessionId)));
    await waitForTable(page, body.sessionId);
    expect(await newSessionIdsSince(request, before)).toEqual([body.sessionId]);

    // Q-5 (refined after TECH_PLANNING): a definitive server answer (500, 422) → the next attempt has a NEW key;
    // a network failure with no answer → the retry reuses the SAME key.
    const [k500, k422, kAbort] = intercepted;
    const kRetry = idempotencyKeyOf(res.request());
    for (const k of [k500, k422, kAbort, kRetry]) expect(k).toMatch(UUID_RE);
    expect(k422, 'new key after 500').not.toBe(k500);
    expect(kAbort, 'new key after 422').not.toBe(k422);
    expect(kRetry, 'same key after a network failure').toBe(kAbort);
  });

  test('TC-006: double click and rapid clicks/Enter with a delayed response → one POST, one session', async ({
    page,
    request,
  }) => {
    for (const variant of ['dblclick', 'rapid'] as const) {
      await test.step(variant, async () => {
        const before = await sessionIds(request);
        await page.goto(newSessionPath(REBELLION));
        await expect(page.getByTestId(T.setupStart)).toBeEnabled();
        const creates = recordCreates(page);
        let release!: () => void;
        const released = new Promise<void>((r) => (release = r));
        const matcher = await routeCreate(page, async (route) => {
          await released; // hold the response (~1 s, TR-7: the UI has no shorter timeout)
          await route.continue();
        });

        const start = page.getByTestId(T.setupStart);
        const response = page.waitForResponse((r) => isCreatePost(r.request()));
        if (variant === 'dblclick') {
          await start.dblclick();
        } else {
          const box = await start.boundingBox();
          if (!box) throw new Error('setup-start has no box');
          for (let i = 0; i < 5; i++) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          }
          await page.keyboard.press('Enter');
        }
        // While the request is in flight: disabled + busy.
        await expect(start).toBeDisabled();
        await expect(start).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByTestId(T.setupForm)).toHaveAttribute('aria-busy', 'true');
        await page.waitForTimeout(1_000);
        release();
        const res = await response;
        expect(res.status()).toBe(201);
        const body = (await res.json()) as SessionResponse;
        await expect(page).toHaveURL(SESSION_URL);
        await waitForTable(page, body.sessionId);
        await page.unroute(matcher);

        expect(creates.requests, 'exactly one POST /api/sessions').toHaveLength(1);
        expect(await newSessionIdsSince(request, before)).toEqual([body.sessionId]);

        // API part: the same key and body again → 200 replay of the same session (no new row).
        const key = idempotencyKeyOf(res.request());
        expect(key).toMatch(UUID_RE);
        const sent = res.request().postDataJSON() as { gameId: string; setup: unknown };
        const replay = await postSession(request, sent.setup, {
          gameId: sent.gameId,
          idempotencyKey: key,
        });
        expect(replay.status()).toBe(200);
        expect(replay.headers()[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
        expect(((await replay.json()) as SessionResponse).sessionId).toBe(body.sessionId);
        expect(await newSessionIdsSince(request, before)).toEqual([body.sessionId]);
      });
    }
  });

  test('TC-006 (API): same Idempotency-Key → same session (201 then 200); same key, other body → 409', async ({
    request,
  }) => {
    const before = await sessionIds(request);
    const key = newIdempotencyKey();
    const setup = { ...EMPIRE_VS_AI_HARD };
    const first = await postSession(request, setup, { idempotencyKey: key });
    expect(first.status(), await first.text()).toBe(201);
    const second = await postSession(request, setup, { idempotencyKey: key });
    expect(second.status(), await second.text()).toBe(200);
    expect(second.headers()[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    const a = (await first.json()) as SessionResponse;
    const b = (await second.json()) as SessionResponse;
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.settings).toEqual(a.settings);

    const other = await postSession(
      request,
      { ...setup, playerFaction: 'rebels' },
      { idempotencyKey: key },
    );
    expect(other.status()).toBe(409);
    expect((await other.json()) as ErrorBody).toMatchObject({
      ok: false,
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(await newSessionIdsSince(request, before)).toEqual([a.sessionId]);
    expect((await getSession(request, a.sessionId)).settings.playerFaction).toBe('empire');
  });

  test('TC-E2E-RT-01: direct /new and refresh show defaults; back/forward re-open with defaults (Q-19)', async ({
    page,
  }) => {
    await page.goto(gamePath(REBELLION));
    await page.getByTestId(T.gameNewSession).click();
    await expect(page).toHaveURL(urlOf(newSessionPath(REBELLION)));
    await page.getByTestId(T.setupFaction('empire')).click();
    await page.getByTestId(T.setupOpponent('human')).click();

    await page.reload();
    await expectFormDefaults(page);

    await page.getByTestId(T.setupFaction('empire')).click();
    await page.goBack();
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    await page.goForward();
    await expect(page).toHaveURL(urlOf(newSessionPath(REBELLION)));
    await expectFormDefaults(page);

    // Q-19: human → AI restores the last difficulty chosen on this screen.
    await page.getByTestId(T.setupDifficultyOption('hard')).click();
    await page.getByTestId(T.setupOpponent('human')).click();
    await page.getByTestId(T.setupOpponent('ai')).click();
    await expect(page.getByTestId(T.setupDifficultyOption('hard'))).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
