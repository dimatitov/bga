// Scenario 3 — zoom & pan: TC-E2E-07..12, TC-E2E-29 (AC-5, AC-10).
// SWR-003: sessions are created via `POST /api/sessions` and opened at `/sessions/:id`; expectations unchanged.
// SWR-005 (Q-1): rewritten on core-v1 (the shared viewport store/controls are the same for both engines); fit of all 32
// systems with labels at three sizes is TC-E-12 (core-fit.spec).
// Canvas state is read via window.__boardDebug (plan-frontend §6.3) and the DOM mirrors board-canvas[data-scale].
import { expect, test, type Page } from '@playwright/test';
import {
  asCore,
  commandOk,
  createSession,
  planActivation,
  REBELS_VS_AI,
  type CorePlayerView,
} from './support/api';
import {
  canvasBox,
  dbg,
  emptyCoreCanvasPoint,
  expectNoCommandSent,
  mouseDrag,
  openCore,
  waitViewportStable,
} from './support/board';
import { midpoint, zoomToDetailAround } from './support/core';
import { T } from './support/testids';

let view: CorePlayerView;
let sessionId: string;

test.beforeEach(async ({ page, request }) => {
  const created = await createSession(request, REBELS_VS_AI);
  view = created.view;
  sessionId = created.sessionId;
  await openCore(page, sessionId);
});

const someSystem = (v: CorePlayerView) => v.map.systems[0]!.id;

async function scale(page: Page) {
  await waitViewportStable(page);
  return (await dbg.viewport(page)).scale;
}

test('TC-E2E-07: zoom buttons + / − change the scale and the DOM mirror', async ({ page }) => {
  const s0 = await scale(page);
  await page.getByTestId(T.zoomIn).click();
  const s1 = await scale(page);
  expect(s1).toBeGreaterThan(s0);
  const mirrored = Number(await page.getByTestId(T.boardCanvas).getAttribute('data-scale'));
  expect(mirrored).toBeCloseTo(s1, 2);
  await expect(page.getByTestId(T.zoomLevel)).toBeVisible();

  await page.getByTestId(T.zoomOut).click();
  await page.getByTestId(T.zoomOut).click();
  expect(await scale(page)).toBeLessThan(s0);
});

test('TC-E2E-08: mouse wheel zooms around the cursor', async ({ page }) => {
  const box = await canvasBox(page);
  const cursor = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.45 };
  const worldUnderCursor = (v: { scale: number; x: number; y: number }) => ({
    x: (cursor.x - box.x - v.x) / v.scale,
    y: (cursor.y - box.y - v.y) / v.scale,
  });

  await page.mouse.move(cursor.x, cursor.y);
  const v0 = await dbg.viewport(page);
  await page.mouse.wheel(0, -300);
  await waitViewportStable(page);
  const v1 = await dbg.viewport(page);
  expect(v1.scale).toBeGreaterThan(v0.scale);
  const w0 = worldUnderCursor(v0);
  const w1 = worldUnderCursor(v1);
  expect(Math.abs(w1.x - w0.x)).toBeLessThan(2);
  expect(Math.abs(w1.y - w0.y)).toBeLessThan(2);

  await page.mouse.wheel(0, 300);
  await waitViewportStable(page);
  expect((await dbg.viewport(page)).scale).toBeLessThan(v1.scale);
});

test.describe('limits', () => {
  test.use({ reducedMotion: 'reduce' });

  test('TC-E2E-09: zoom is clamped to min/max and buttons disable at the limits', async ({
    page,
  }) => {
    const limits = await dbg.zoomLimits(page);
    expect(limits.min).toBeLessThan(limits.max);

    const zoomIn = page.getByTestId(T.zoomIn);
    for (let i = 0; i < 40 && (await zoomIn.isEnabled()); i++) await zoomIn.click();
    await expect(zoomIn).toBeDisabled();
    expect(await scale(page)).toBeCloseTo(limits.max, 3);
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    expect(await scale(page)).toBeLessThanOrEqual(limits.max + 1e-9);

    const zoomOut = page.getByTestId(T.zoomOut);
    for (let i = 0; i < 60 && (await zoomOut.isEnabled()); i++) await zoomOut.click();
    await expect(zoomOut).toBeDisabled();
    await expect(zoomIn).toBeEnabled();
    expect(await scale(page)).toBeCloseTo(limits.min, 3);
    await page.mouse.wheel(0, 600);
    expect(await scale(page)).toBeGreaterThanOrEqual(limits.min - 1e-9);
  });
});

test('TC-E2E-10: fit shows every system inside the canvas', async ({ page }) => {
  await page.getByTestId(T.zoomIn).click();
  await page.getByTestId(T.zoomIn).click();
  const from = await emptyCoreCanvasPoint(page, view, 30);
  await mouseDrag(page, from, { x: from.x + 250, y: from.y + 150 });
  await waitViewportStable(page);

  await page.getByTestId(T.zoomFit).click();
  await waitViewportStable(page);
  const box = await canvasBox(page);
  for (const s of view.map.systems) {
    const p = await dbg.systemPos(page, s.id);
    expect(p.x, `${s.id}.x inside canvas`).toBeGreaterThan(box.x);
    expect(p.x).toBeLessThan(box.x + box.width);
    expect(p.y, `${s.id}.y inside canvas`).toBeGreaterThan(box.y);
    expect(p.y).toBeLessThan(box.y + box.height);
  }
});

test('TC-E2E-11: dragging the background pans and keeps the selection', async ({ page }) => {
  const fromSystemId = someSystem(view);
  const sys = await dbg.systemPos(page, fromSystemId);
  await page.mouse.click(sys.x, sys.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'system', id: fromSystemId });

  const start = await emptyCoreCanvasPoint(page, view);
  const v0 = await dbg.viewport(page);
  await expectNoCommandSent(page, () =>
    mouseDrag(page, start, { x: start.x + 200, y: start.y + 100 }),
  );
  await waitViewportStable(page);
  const v1 = await dbg.viewport(page);
  expect(v1.scale).toBeCloseTo(v0.scale, 6);
  expect(Math.abs(v1.x - v0.x - 200)).toBeLessThan(8);
  expect(Math.abs(v1.y - v0.y - 100)).toBeLessThan(8);
  expect(await dbg.selection(page)).toEqual({ kind: 'system', id: fromSystemId });
  await expect(page.getByTestId(T.coreSystemPanel)).toHaveAttribute('data-system-id', fromSystemId);
});

test('TC-E2E-12: drag started on a movable unit does not pan; drop on empty space cancels', async ({
  page,
  request,
}) => {
  // A unit is draggable only during the viewer's activation (it is listed in MOVE_PIECES) and in the detail LOD.
  const plan = planActivation(view, [view.rebelBase.systemId!]);
  const act = asCore(
    (
      await commandOk(request, sessionId, view, {
        type: 'ACTIVATE_SYSTEM',
        leaderId: plan.leaderId,
        systemId: plan.systemId,
      })
    ).view,
  );
  await openCore(page, sessionId);
  await zoomToDetailAround(page, await midpoint(page, plan.fromSystemId, plan.systemId));
  const origin = await dbg.piecePos(page, plan.pieceId);
  const empty = await emptyCoreCanvasPoint(page, act, 40);
  const v0 = await dbg.viewport(page);

  await expectNoCommandSent(page, () => mouseDrag(page, origin, empty));
  await expect.poll(() => dbg.isDragging(page)).toBe(false);
  await waitViewportStable(page);

  expect(await dbg.viewport(page)).toEqual(v0);
  const back = await dbg.piecePos(page, plan.pieceId);
  expect(Math.abs(back.x - origin.x)).toBeLessThan(3);
  expect(Math.abs(back.y - origin.y)).toBeLessThan(3);
  await expect(page.getByTestId(T.liveRegion)).not.toBeEmpty();
});

test('TC-E2E-29: zoom controls and canvas are labelled and keyboard operable', async ({ page }) => {
  for (const id of [T.zoomIn, T.zoomOut, T.zoomFit, T.boardCanvas]) {
    await expect(page.getByTestId(id)).toHaveAttribute('aria-label', /.+/);
  }
  const canvas = page.getByTestId(T.boardCanvas);
  // Focus the canvas container (tabIndex=0) the way a keyboard user would land on it.
  await canvas.focus();
  const s0 = await scale(page);
  await page.keyboard.press('+');
  expect(await scale(page)).toBeGreaterThan(s0);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  expect(await scale(page)).toBeLessThan(s0);
  const v = await dbg.viewport(page);
  await page.keyboard.press('ArrowLeft');
  await waitViewportStable(page);
  const v2 = await dbg.viewport(page);
  expect(v2.x !== v.x || v2.y !== v.y).toBe(true);

  // zoom buttons are reachable with Tab (not hover-only)
  await page.getByTestId(T.zoomIn).focus();
  await page.keyboard.press('Enter');
  expect(await scale(page)).toBeGreaterThan(v2.scale);
});
