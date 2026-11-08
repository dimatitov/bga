// SWR-005 AC-12 «fit shows all 32 systems with labels» — TC-E-12 (closes SWR-004 known issue O-2), plan-frontend §6
// criterion: after «вписать карту» at 1440×900, 1024×768 and 768×1024 every system centre and every label rect is inside
// the `board-canvas` rect, labels pairwise do not overlap (2 px tolerance), any LOD; a resize before any interaction
// re-fits. Geometry comes from `__boardDebug` (Worker M: getSystemScreenPos, getSystemLabelRect, getLod,
// getContentBounds).
import { expect, test, type Page } from '@playwright/test';
import { CORE_SYSTEM_COUNT, createSession, REBELS_VS_AI, type CorePlayerView } from './support/api';
import { canvasBox, dbg, openCore, waitViewportStable, type Rect } from './support/board';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
] as const;
const TOL = 2;

const inside = (r: Rect, box: Rect) =>
  r.x >= box.x - TOL &&
  r.y >= box.y - TOL &&
  r.x + r.width <= box.x + box.width + TOL &&
  r.y + r.height <= box.y + box.height + TOL;

const overlap = (a: Rect, b: Rect) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOL &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > TOL;

/** All 32 centres + labels inside the canvas, labels pairwise apart. Returns the LOD. */
async function expectAllSystemsFit(
  page: Page,
  view: CorePlayerView,
  label: string,
): Promise<string> {
  const box = await canvasBox(page);
  const labels: [string, Rect][] = [];
  const outside: string[] = [];
  for (const s of view.map.systems) {
    const p = await dbg.systemPos(page, s.id);
    if (!(p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height))
      outside.push(`${s.id} centre`);
    const r = await dbg.labelRect(page, s.id);
    expect(r.width, `${s.id} label has a size`).toBeGreaterThan(0);
    if (!inside(r, box)) outside.push(`${s.id} label`);
    labels.push([s.id, r]);
  }
  expect(outside, `${label}: outside board-canvas ${JSON.stringify(box)}`).toEqual([]);
  const overlaps: string[] = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (overlap(labels[i]![1], labels[j]![1]))
        overlaps.push(`${labels[i]![0]} × ${labels[j]![0]}`);
  expect(overlaps, `${label}: overlapping labels`).toEqual([]);
  expect(await dbg.contentBounds(page)).not.toBeNull();
  return dbg.lod(page);
}

test.describe('SWR-005 AC-12: fit shows all 32 systems with labels', () => {
  for (const size of SIZES) {
    test(`TC-E-12: «fit» at ${size.width}×${size.height} — 32 centres and labels inside the canvas, labels apart`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize(size);
      const { sessionId, view } = await createSession(request, REBELS_VS_AI);
      expect(view.map.systems).toHaveLength(CORE_SYSTEM_COUNT);
      await openCore(page, sessionId);
      // Initial view is already fitted (no interaction yet).
      const lod0 = await expectAllSystemsFit(page, view, `${size.width} initial`);
      // Zoom away, then «fit» again.
      await page.getByTestId(T.zoomIn).click();
      await page.getByTestId(T.zoomIn).click();
      await waitViewportStable(page);
      await page.getByTestId(T.zoomFit).click();
      await waitViewportStable(page);
      const lod = await expectAllSystemsFit(page, view, `${size.width} after fit`);
      expect(['detail', 'compact']).toContain(lod);
      expect(lod).toBe(lod0);
      test
        .info()
        .annotations.push({ type: 'lod', description: `${size.width}×${size.height}: ${lod}` });
    });
  }

  test('TC-E-12 (resize): a resize before any interaction re-fits the map (userAdjusted = false)', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(SIZES[0]);
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    const s0 = (await dbg.viewport(page)).scale;
    await page.setViewportSize(SIZES[2]);
    await expect.poll(async () => (await dbg.viewport(page)).scale).not.toBeCloseTo(s0, 3);
    await waitViewportStable(page);
    await expectAllSystemsFit(page, view, '1440 → 768 resize');
  });
});
