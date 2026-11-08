// Scenario 4 — selection: TC-E2E-13..16 (AC-6, AC-10).
// SWR-003: sessions are created via `POST /api/sessions` and opened at `/sessions/:id`; expectations unchanged.
import { expect, test } from '@playwright/test';
import {
  createSession,
  enemyPieces,
  moveActions,
  pickMove,
  piece,
  type PlayerView,
} from './support/api';
import { dbg, emptyCanvasPoint, openSession } from './support/board';
import { CONTEXT_STATE, T } from './support/testids';

let view: PlayerView;

test.beforeEach(async ({ page, request }) => {
  const created = await createSession(request);
  view = created.view;
  await openSession(page, created.sessionId);
});

test('TC-E2E-13: clicking a system selects it and opens the system panel', async ({ page }) => {
  const { fromSystemId } = pickMove(view);
  const pos = await dbg.systemPos(page, fromSystemId);
  await page.mouse.click(pos.x, pos.y);

  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'system', id: fromSystemId });
  await expect(page.getByTestId(T.systemItem(fromSystemId))).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId(T.contextPanel)).toHaveAttribute(
    'data-state',
    CONTEXT_STATE.system,
  );
  const panel = page.getByTestId(T.systemPanel);
  await expect(panel).toBeVisible();
  // Content (name/region/pieces/neighbours) is language-dependent text: here only non-empty;
  // exact content — component tests (FE) and TC-MAN-03.
  await expect(panel).not.toBeEmpty();
  for (const other of view.systems.filter((s) => s.id !== fromSystemId)) {
    await expect(page.getByTestId(T.systemItem(other.id))).not.toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
});

test('TC-E2E-14: clicking an own piece shows exactly its legal moves and highlights targets', async ({
  page,
}) => {
  const { pieceId, legalTargets } = pickMove(view);
  const pos = await dbg.piecePos(page, pieceId);
  await page.mouse.click(pos.x, pos.y);

  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: pieceId });
  await expect(page.getByTestId(T.pieceItem(pieceId))).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(T.contextPanel)).toHaveAttribute('data-state', CONTEXT_STATE.piece);
  await expect(page.getByTestId(T.piecePanel)).toBeVisible();

  const panel = page.getByTestId(T.actionPanel);
  await expect(panel).toBeVisible();
  for (const to of legalTargets)
    await expect(page.getByTestId(T.actionMove(pieceId, to))).toBeVisible();
  const offered = panel.locator(
    '[data-testid^="action-move-"]:not([data-testid^="action-move-all-"])',
  );
  await expect(offered).toHaveCount(legalTargets.length);

  expect(await dbg.highlighted(page)).toEqual([...legalTargets].sort());
  for (const to of legalTargets) {
    await expect(page.getByTestId(T.systemItem(to))).toHaveAttribute('data-highlighted', 'true');
  }
});

test('TC-E2E-15: enemy pieces (visible and hidden) offer no move commands', async ({ page }) => {
  const enemies = enemyPieces(view);
  const visible = enemies.find((p) => !p.hidden && p.typeKey !== 'unknown');
  const hidden = enemies.find((p) => p.typeKey === 'unknown');
  expect(visible, 'scenario has a visible enemy piece').toBeDefined();
  expect(hidden, 'scenario has a hidden enemy piece (R-3)').toBeDefined();
  expect(moveActions(view).some((a) => enemies.some((e) => e.id === a.pieceId))).toBe(false);

  for (const p of [visible!, hidden!]) {
    const pos = await dbg.piecePos(page, p.id);
    await page.mouse.click(pos.x, pos.y);
    await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: p.id });
    await expect(page.getByTestId(T.piecePanel)).toBeVisible();
    await expect(page.locator(`[data-testid^="action-move-${p.id}-"]`)).toHaveCount(0);
    expect(await dbg.highlighted(page)).toEqual([]);
  }
  expect(piece(view, hidden!.id).typeKey).toBe('unknown');
});

test('TC-E2E-16: background click (< 4 px) and Esc clear the selection', async ({ page }) => {
  const { pieceId } = pickMove(view);
  const select = async () => {
    const pos = await dbg.piecePos(page, pieceId);
    await page.mouse.click(pos.x, pos.y);
    await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: pieceId });
  };

  await select();
  const empty = await emptyCanvasPoint(page, view);
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: null, id: null });
  await expect(page.getByTestId(T.contextPanel)).toHaveAttribute('data-state', CONTEXT_STATE.empty);

  await select();
  await page.keyboard.press('Escape');
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: null, id: null });
  await expect(page.getByTestId(T.contextPanel)).toHaveAttribute('data-state', CONTEXT_STATE.empty);
});
