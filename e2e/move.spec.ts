// Scenario 5 — moving pieces: TC-E2E-17, 18, 18b, 19, 20, 21, 34 (AC-7, AC-8, AC-10).
// SWR-003: sessions API (`POST /api/sessions/:id/commands`) and `/sessions/:id` (test-cases.md §8.1); expectations unchanged.
import { expect, test, type Page } from '@playwright/test';
import {
  createSession,
  enemyPieces,
  getView,
  pickMove,
  piece,
  postCommand,
  type MoveFixture,
  type PlayerView,
} from './support/api';
import {
  dbg,
  expectNoCommandSent,
  mouseDrag,
  openSession,
  openSidebarTab,
  version,
  waitForCommand,
  waitViewportStable,
} from './support/board';
import { T } from './support/testids';

let sessionId: string;
let view: PlayerView;
let move: MoveFixture;

test.beforeEach(async ({ page, request }) => {
  const created = await createSession(request);
  sessionId = created.sessionId;
  view = created.view;
  move = pickMove(view);
  await openSession(page, sessionId);
});

async function selectPiece(page: Page, pieceId: string) {
  const pos = await dbg.piecePos(page, pieceId);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: pieceId });
}

/** Common post-conditions of an accepted move (AC-7/AC-8). */
async function expectMoved(page: Page, v0: number, logCount0: number) {
  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.toSystemId,
  );
  await expect.poll(() => version(page)).toBe(v0 + 1);
  await expect(page.getByTestId(T.feedback)).toBeVisible();
  await expect(page.getByTestId(T.liveRegion)).not.toBeEmpty();
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLogItem)).toHaveCount(logCount0 + 1);
  const server = await getView(page.request, sessionId);
  expect(piece(server, move.pieceId).systemId).toBe(move.toSystemId);
  expect(server.version).toBe(v0 + 1);
  expect(server.log.at(-1)?.type).toBe('PIECES_MOVED');
}

test('TC-E2E-17: move via the actions panel (selection + 1 click)', async ({ page }) => {
  const v0 = await version(page);
  await selectPiece(page, move.pieceId);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  const res = await cmd;
  expect(res.status()).toBe(200);
  expect(res.request().postDataJSON()).toEqual({
    actor: 'empire',
    expectedVersion: v0,
    command: {
      type: 'MOVE_PIECES',
      pieceIds: [move.pieceId],
      fromSystemId: move.fromSystemId,
      toSystemId: move.toSystemId,
    },
  });
  await expectMoved(page, v0, view.log.length);
});

test('TC-E2E-18: move by dragging the piece onto a highlighted system', async ({ page }) => {
  const v0 = await version(page);
  const from = await dbg.piecePos(page, move.pieceId);
  const to = await dbg.systemPos(page, move.toSystemId);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  expect(await dbg.isDragging(page)).toBe(true);
  expect(await dbg.highlighted(page)).toContain(move.toSystemId);
  const cmd = waitForCommand(page);
  await page.mouse.up();
  expect((await cmd).status()).toBe(200);
  await expectMoved(page, v0, view.log.length);
});

test('TC-E2E-18b: move by clicking a highlighted target on the map', async ({ page }) => {
  const v0 = await version(page);
  await selectPiece(page, move.pieceId);
  const to = await dbg.systemPos(page, move.toSystemId);
  const cmd = waitForCommand(page);
  await page.mouse.click(to.x, to.y);
  expect((await cmd).status()).toBe(200);
  await expectMoved(page, v0, view.log.length);
});

test('TC-E2E-19: drop on a non-adjacent system is refused without a request and rolled back', async ({
  page,
}) => {
  const v0 = await version(page);
  const origin = await dbg.piecePos(page, move.pieceId);
  const illegal = await dbg.systemPos(page, move.illegalSystemId);

  await expectNoCommandSent(page, () => mouseDrag(page, origin, illegal));
  await expect.poll(() => dbg.isDragging(page)).toBe(false);
  await expect(page.getByTestId(T.feedback)).toBeVisible();
  await expect(page.getByTestId(T.liveRegion)).not.toBeEmpty();
  const back = await dbg.piecePos(page, move.pieceId);
  expect(Math.abs(back.x - origin.x)).toBeLessThan(3);
  expect(Math.abs(back.y - origin.y)).toBeLessThan(3);

  await page.reload();
  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.fromSystemId,
  );
  expect(await version(page)).toBe(v0);
});

test('TC-E2E-20: server rejects an illegal move with 422 and the state is unchanged', async ({
  page,
}) => {
  const res = await postCommand(page.request, sessionId, view, {
    type: 'MOVE_PIECES',
    pieceIds: [move.pieceId],
    fromSystemId: move.fromSystemId,
    toSystemId: move.illegalSystemId,
  });
  expect(res.status()).toBe(422);
  expect(await res.json()).toMatchObject({
    ok: false,
    error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' },
  });

  await page.reload();
  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.fromSystemId,
  );
  expect(await version(page)).toBe(view.version);
});

test('TC-E2E-21: dragging an enemy piece sends nothing and the piece stays in its system', async ({
  page,
}) => {
  const enemy = enemyPieces(view)[0];
  expect(enemy, 'scenario has an enemy piece').toBeDefined();
  // UX D-I-2: a gesture starting on an enemy (non-draggable) piece pans the map, so absolute screen positions
  // change — compare the piece position relative to its system instead.
  const relative = async () => {
    const p = await dbg.piecePos(page, enemy!.id);
    const s = await dbg.systemPos(page, enemy!.systemId);
    return { x: p.x - s.x, y: p.y - s.y };
  };
  const origin = await dbg.piecePos(page, enemy!.id);
  const rel0 = await relative();
  const target = view.systems.find((s) => s.id !== enemy!.systemId)!;
  const to = await dbg.systemPos(page, target.id);

  await expectNoCommandSent(page, () => mouseDrag(page, origin, to));
  await expect.poll(() => dbg.isDragging(page)).toBe(false);
  await waitViewportStable(page);
  const rel1 = await relative();
  expect(Math.abs(rel1.x - rel0.x)).toBeLessThan(3);
  expect(Math.abs(rel1.y - rel0.y)).toBeLessThan(3);
  await expect(page.getByTestId(T.pieceItem(enemy!.id))).toHaveAttribute(
    'data-system-id',
    enemy!.systemId,
  );
});

test('TC-E2E-34: stale view → 409, message, refetch, selection kept (A-19)', async ({ page }) => {
  // Another client (API) changes the game; this page still holds version v.
  const other = pickMove(view, [move.pieceId]);
  const external = await postCommand(page.request, sessionId, view, {
    type: 'MOVE_PIECES',
    pieceIds: [other.pieceId],
    fromSystemId: other.fromSystemId,
    toSystemId: other.toSystemId,
  });
  expect(external.status()).toBe(200);

  await selectPiece(page, move.pieceId);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  const res = await cmd;
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });

  await expect(page.getByTestId(T.feedback)).toBeVisible();
  await expect.poll(() => version(page)).toBe(view.version + 1);
  await expect(page.getByTestId(T.pieceItem(other.pieceId))).toHaveAttribute(
    'data-system-id',
    other.toSystemId,
  );
  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.fromSystemId,
  );
  expect(await dbg.selection(page)).toEqual({ kind: 'piece', id: move.pieceId });
});
