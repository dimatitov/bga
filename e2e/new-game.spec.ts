// Scenario 1 — new game: TC-E2E-03, TC-E2E-04, TC-E2E-05 → SWR-003 TC-NEW-05, TC-NEW-06, TC-NEW-07 (AC-3).
// SWR-003: catalog → game page → `/games/star-wars-rebellion/new` → `POST /api/sessions { gameId, setup }` → `/sessions/:id`.
// SWR-004 (test-cases.md §8 "Замена"): rewritten on the new wire — setup `{ playerFaction, opponentType, aiDifficulty?,
// ruleset, gameMode }`, response `{ sessionId, gameId, status, settings, view }`, view `kind: 'player'` with `viewer`.
// Kept as separate cases next to PO TC-001..TC-003 (game-setup.spec.ts).
import { expect, test } from '@playwright/test';
import {
  actionOf,
  asCore,
  DETAILS_KEYS,
  listSessions,
  REBELLION,
  type SessionResponse,
} from './support/api';
import {
  gamePath,
  newSessionPath,
  sessionPath,
  urlOf,
  version,
  waitForTable,
} from './support/board';
import { idempotencyKeyOf, waitCreate } from './support/setup';
import { T } from './support/testids';

test('TC-NEW-05 (was TC-E2E-03): catalog → game page → new session (Empire, AI, hard) → its table', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByTestId(T.gameCard(REBELLION)).click();
  await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
  await page.getByTestId(T.gameNewSession).click();
  await expect(page).toHaveURL(urlOf(newSessionPath(REBELLION)));

  await page.getByTestId(T.setupFaction('empire')).click();
  await page.getByTestId(T.setupOpponent('ai')).click();
  await page.getByTestId(T.setupDifficultyOption('hard')).click();

  const created = waitCreate(page);
  await page.getByTestId(T.setupStart).click();
  const res = await created;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toEqual({
    gameId: REBELLION,
    setup: {
      playerFaction: 'empire',
      opponentType: 'ai',
      aiDifficulty: 'hard',
      ruleset: 'base',
      gameMode: 'digital',
    },
  });
  expect(idempotencyKeyOf(res.request()), 'Idempotency-Key header').toBeTruthy();
  const body = (await res.json()) as SessionResponse;
  expect(Object.keys(body).sort()).toEqual(['gameId', 'sessionId', 'settings', 'status', 'view']);
  expect(body.gameId).toBe(REBELLION);
  expect(body.status).toBe('prototype');
  expect(body.settings).toEqual({
    playerFaction: 'empire',
    opponentFaction: 'rebels',
    opponentType: 'ai',
    aiDifficulty: 'hard',
    ruleset: 'base',
    gameMode: 'digital',
  });
  const view = asCore(body.view); // SWR-005: every new session is core-v1
  expect(view.viewer).toBe('empire');
  expect(view.settings).toEqual(body.settings);
  expect(view).not.toHaveProperty('setup');

  await expect(page).toHaveURL(urlOf(sessionPath(body.sessionId)));
  await waitForTable(page, body.sessionId);
  // SWR-005: the AI Rebels' first auto-pass is applied at creation (AC-08) — the table shows the response version.
  expect(await version(page)).toBe(view.version);

  const summary = (await listSessions(request, REBELLION)).find(
    (s) => s.sessionId === body.sessionId,
  );
  expect(summary, 'created session is listed for its game').toBeDefined();
  expect(summary?.gameId).toBe(REBELLION);
  expect(summary?.status).toBe('prototype');
  expect(Object.keys(summary?.details ?? {}).sort()).toEqual(DETAILS_KEYS);
  expect(summary?.details).toMatchObject({
    playerFaction: 'empire',
    opponentFaction: 'rebels',
    opponentType: 'ai',
    aiDifficulty: 'hard',
    ruleset: 'base',
    gameMode: 'digital',
  });
});

test('TC-NEW-06 (was TC-E2E-04): human opponent — difficulty unavailable, setup has no difficulty', async ({
  page,
}) => {
  await page.goto(newSessionPath(REBELLION));
  await page.getByTestId(T.setupFaction('empire')).click();
  await page.getByTestId(T.setupOpponent('human')).click();

  // SWR-004 plan-frontend §2.1: the difficulty block is unmounted for a human opponent.
  await expect(page.getByTestId(T.setupDifficulty)).toBeHidden();

  const created = waitCreate(page);
  await page.getByTestId(T.setupStart).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const sent = res.request().postDataJSON() as { gameId: string; setup: Record<string, unknown> };
  expect(sent).toEqual({
    gameId: REBELLION,
    setup: { playerFaction: 'empire', opponentType: 'human', ruleset: 'base', gameMode: 'digital' },
  });
  expect(sent.setup).not.toHaveProperty('aiDifficulty');
  const body = (await res.json()) as SessionResponse;
  expect(body.settings.opponentType).toBe('human');
  expect(body.settings.aiDifficulty).toBeNull();
  expect(body.settings.opponentFaction).toBe('rebels');
  await waitForTable(page, body.sessionId);
});

test('TC-NEW-07 (was TC-E2E-05): new session as the Rebels — view is for the Rebels', async ({
  page,
}) => {
  await page.goto(newSessionPath(REBELLION));
  await page.getByTestId(T.setupFaction('rebels')).click();
  await page.getByTestId(T.setupOpponent('ai')).click();

  const created = waitCreate(page);
  await page.getByTestId(T.setupStart).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const body = (await res.json()) as SessionResponse;
  const view = asCore(body.view);

  expect(view.viewer).toBe('rebels');
  expect(body.settings.playerFaction).toBe('rebels');
  expect(view.rebelBase.systemId).not.toBeNull();
  const leaders = actionOf(view, 'ACTIVATE_SYSTEM')?.leaderIds ?? [];
  expect(leaders.length).toBeGreaterThan(0);
  for (const id of leaders) expect(view.leaders.find((l) => l.id === id)?.owner).toBe('rebels');
  await waitForTable(page, body.sessionId);
});

test('TC-NEW-05 (old URL): SWR-002 `/games/new` is now an unknown game id → not found', async ({
  page,
}) => {
  await page.goto('/games/new');
  await expect(page.getByTestId(T.gameNotFound)).toBeVisible();
  await expect(page.getByTestId(T.setupStart)).toHaveCount(0);
});
