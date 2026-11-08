// Scenario 1 — new game: TC-E2E-03, TC-E2E-04, TC-E2E-05 (AC-2, AC-3, AC-10).
import { expect, test, type Page } from '@playwright/test';
import { listGames, moveActions, piece, type PlayerView } from './support/api';
import { version, waitForTable } from './support/board';
import { T } from './support/testids';

function waitCreate(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/games',
  );
}

test('TC-E2E-03: menu → new game (Empire, AI, hard) → table of the created game', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByTestId(T.menuNewGame).click();
  await expect(page).toHaveURL(/\/games\/new$/);

  await page.getByTestId(T.setupFaction('empire')).click();
  await page.getByTestId(T.setupOpponent('ai')).click();
  await page.getByTestId(T.setupDifficultyOption('hard')).click();

  const created = waitCreate(page);
  await page.getByTestId(T.setupStart).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { gameId: string; view: PlayerView };
  expect(res.request().postDataJSON()).toEqual({
    humanFaction: 'empire',
    opponent: { kind: 'ai', difficulty: 'hard' },
  });

  await expect(page).toHaveURL(new RegExp(`/games/${body.gameId}$`));
  await waitForTable(page, body.gameId);
  expect(await version(page)).toBe(1);

  const summary = (await listGames(request)).find((g) => g.gameId === body.gameId);
  expect(summary?.setup).toEqual({
    humanFaction: 'empire',
    opponent: { kind: 'ai', difficulty: 'hard' },
  });
});

test('TC-E2E-04: human opponent — difficulty unavailable, setup has no difficulty', async ({
  page,
}) => {
  await page.goto('/games/new');
  await page.getByTestId(T.setupFaction('empire')).click();
  await page.getByTestId(T.setupOpponent('human')).click();

  const difficulty = page.getByTestId(T.setupDifficulty);
  if (await difficulty.isVisible()) {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      await expect(page.getByTestId(T.setupDifficultyOption(d))).toBeDisabled();
    }
  } else {
    await expect(difficulty).toBeHidden();
  }

  const created = waitCreate(page);
  await page.getByTestId(T.setupStart).click();
  const res = await created;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toEqual({
    humanFaction: 'empire',
    opponent: { kind: 'human' },
  });
  const body = (await res.json()) as { gameId: string; view: PlayerView };
  expect(body.view.setup.opponent).toEqual({ kind: 'human' });
  await waitForTable(page, body.gameId);
});

test('TC-E2E-05: new game as Rebellion — view is for the Rebellion', async ({ page }) => {
  await page.goto('/games/new');
  await page.getByTestId(T.setupFaction('rebellion')).click();
  await page.getByTestId(T.setupOpponent('ai')).click();

  const created = waitCreate(page);
  await page.getByTestId(T.setupStart).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const { gameId, view } = (await res.json()) as { gameId: string; view: PlayerView };

  expect(view.setup.humanFaction).toBe('rebellion');
  expect(view.rebelBase.systemId).not.toBeNull();
  const moves = moveActions(view);
  expect(moves.length).toBeGreaterThan(0);
  for (const a of moves) expect(piece(view, a.pieceId).owner).toBe('rebellion');
  await waitForTable(page, gameId);
});
