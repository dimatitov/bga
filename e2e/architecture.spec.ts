// Network-level architecture checks: TC-E2E-30 (hidden info), TC-E2E-31 (only POST /commands mutates) — AC-12.
// Hidden information is checked on server responses, not on DOM (skill browser-qa §4).
import { expect, test } from '@playwright/test';
import {
  createGame,
  findKeyPaths,
  findRebelBases,
  getView,
  pickMove,
  REBELLION_VS_AI,
} from './support/api';
import { dbg, openGame, recordApi, waitForCommand, type RecordedCall } from './support/board';
import { T } from './support/testids';

test('TC-E2E-30 + TC-E2E-31: Empire session leaks no secrets; only allowed requests mutate', async ({
  page,
  request,
}) => {
  // Real type keys of hidden Rebel pieces, learned from a Rebellion game of the same scenario.
  const rebelView = (await createGame(request, REBELLION_VS_AI)).view;
  const hiddenOnlyTypeKeys = [
    ...new Set(
      rebelView.pieces.filter((p) => p.owner === 'rebellion' && p.hidden).map((p) => p.typeKey),
    ),
  ].filter((k) => !rebelView.pieces.some((p) => !p.hidden && p.typeKey === k));

  const recorder = recordApi(page);
  const calls: RecordedCall[] = recorder.calls;
  const requests: { method: string; url: string }[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/'))
      requests.push({ method: r.method(), url: r.url() });
  });

  // Scenarios 1, 3–7 as the Empire through the UI.
  await page.goto('/games/new');
  await page.getByTestId(T.setupFaction('empire')).click();
  await page.getByTestId(T.setupOpponent('ai')).click();
  const created = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/games' && r.request().method() === 'POST',
  );
  await page.getByTestId(T.setupStart).click();
  const { gameId } = (await (await created).json()) as { gameId: string };
  await openGame(page, gameId);
  const view = await getView(request, gameId);
  const move = pickMove(view);

  const pos = await dbg.piecePos(page, move.pieceId);
  await page.mouse.click(pos.x, pos.y);
  let cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  expect((await cmd).status()).toBe(200);
  cmd = waitForCommand(page);
  await page.getByTestId(T.advancePhase).click();
  expect((await cmd).status()).toBe(200);
  await page.reload();
  await openGame(page, gameId);
  await page.goto('/');
  await page.goto('/settings');

  // TC-E2E-30
  await recorder.settle();
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) {
    for (const base of findRebelBases(c.body)) {
      expect(base.systemId, `rebelBase.systemId leaked in ${c.method} ${c.url}`).toBeNull();
    }
    expect(findKeyPaths(c.body, 'state'), `"state" key in ${c.method} ${c.url}`).toEqual([]);
    const raw = JSON.stringify(c.body);
    for (const k of hiddenOnlyTypeKeys) {
      expect(raw.includes(`"${k}"`), `hidden typeKey "${k}" leaked in ${c.method} ${c.url}`).toBe(
        false,
      );
    }
  }
  if (hiddenOnlyTypeKeys.length === 0) {
    test.info().annotations.push({
      type: 'note',
      description:
        'no typeKey is exclusive to hidden pieces — raw typeKey leak sub-check is vacuous',
    });
  }

  // TC-E2E-31
  const allowed = [/^\/api\/games$/, /^\/api\/games\/[^/]+\/commands$/];
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
