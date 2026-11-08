/**
 * SWR-005 Worker M — fit criterion of AC-12 on the pure layout (plan-frontend §6, §12): after «вписать карту» at
 * 1440×900, 1024×768 and 768×1024 (board canvas sizes of the CoreTable grid at those windows) every system label is
 * inside the canvas and labels never overlap — in ru and en. Labels are one line (the name); target / activated
 * state is shown by rings and a flag, so a label never changes size during the turn.
 */
import { coreMapLayout, coreRegionShapes } from '@bga/game-rebellion/board';
import { CORE_REGION_IDS, CORE_SYSTEM_IDS } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { type Size, fitInsets, fitViewport } from '../../board/model/geometry';
import { CORE_CONTENT_INSETS } from './constants';
import { coreContentBounds } from './contentBounds';
import {
  type Rect,
  chipBox,
  chipRect,
  estimateTextWidth,
  overlappingPairs,
  rectInside,
  rectsOverlap,
  regionLabelBox,
  regionLabelRect,
  systemLabelBox,
  systemLabelRect,
} from './labelLayout';
import { lodFor } from './lod';

/** Board canvas sizes: 1440×900 (map | 384 sidebar), 1024×768 (map | 320, 2-row top bar), 768×1024 (one column). */
const STAGES: Array<[string, Size]> = [
  ['1440x900', { width: 1056, height: 780 }],
  ['1024x768', { width: 680, height: 560 }],
  ['768x1024', { width: 760, height: 640 }],
];
const LANGS = ['ru', 'en'] as const;
const TOLERANCE = 2;

function fitted(stage: Size, showZone = false) {
  const bounds = coreContentBounds({ systemIds: CORE_SYSTEM_IDS, showZone })!;
  return fitViewport(bounds, stage, fitInsets(stage, CORE_CONTENT_INSETS));
}

function labelRects(stage: Size, lng: 'ru' | 'en', showZone = false) {
  const vp = fitted(stage, showZone);
  const rects = new Map<string, Rect>();
  for (const id of CORE_SYSTEM_IDS) {
    const name = i18n.t(`rebellion.data:systems.${id}`, { lng });
    rects.set(id, systemLabelRect(coreMapLayout[id]!, systemLabelBox([name]), vp));
  }
  return { vp, rects };
}

describe('labelLayout primitives', () => {
  it('sizes a label box from its longest line, capped at 120 px, one line = 16 px', () => {
    expect(systemLabelBox(['Хот']).height).toBe(16);
    expect(systemLabelBox(['Набу', 'активирована']).height).toBe(32);
    expect(systemLabelBox(['x'.repeat(60)]).width).toBe(120);
    expect(systemLabelBox(['Хот']).width).toBe(estimateTextWidth('Хот') + 6);
  });

  it('label rect is centred under the system and screen-constant up to 100 %', () => {
    const box = systemLabelBox(['Татуин']);
    const a = systemLabelRect({ x: 100, y: 100 }, box, { scale: 0.5, x: 10, y: 20 });
    const b = systemLabelRect({ x: 100, y: 100 }, box, { scale: 0.25, x: 10, y: 20 });
    expect(a.width).toBe(box.width);
    expect(b.width).toBe(box.width);
    expect(a.x + a.width / 2).toBeCloseTo(60);
    // zoomed in: grows, but at most 1.6×
    expect(systemLabelRect({ x: 0, y: 0 }, box, { scale: 2.5, x: 0, y: 0 }).width).toBeCloseTo(
      box.width * 1.6,
    );
  });

  it('overlap helpers', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
    expect(rectsOverlap(a, { x: 9, y: 9, width: 5, height: 5 }, 2)).toBe(false);
    expect(rectInside(a, { x: -1, y: -1, width: 12, height: 12 })).toBe(true);
    expect(
      overlappingPairs(
        new Map([
          ['a', a],
          ['b', { ...a, x: 20 }],
        ]),
      ),
    ).toEqual([]);
  });
});

describe.each(STAGES)('fit at %s (AC-12)', (_name, stage) => {
  const canvas: Rect = { x: 0, y: 0, ...stage };

  it.each(LANGS)('%s: every system centre and label is inside the canvas', (lng) => {
    const { vp, rects } = labelRects(stage, lng);
    for (const id of CORE_SYSTEM_IDS) {
      const c = coreMapLayout[id]!;
      const sx = c.x * vp.scale + vp.x;
      const sy = c.y * vp.scale + vp.y;
      expect(sx > 0 && sx < stage.width && sy > 0 && sy < stage.height, id).toBe(true);
      expect(rectInside(rects.get(id)!, canvas), `${id} label`).toBe(true);
    }
  });

  it.each(LANGS)('%s: system labels are pairwise disjoint (±2 px)', (lng) => {
    expect(overlappingPairs(labelRects(stage, lng).rects, TOLERANCE)).toEqual([]);
  });

  it.each(LANGS)('%s: region captions stay inside the canvas and clear of system labels', (lng) => {
    const { vp, rects } = labelRects(stage, lng);
    for (const id of CORE_REGION_IDS) {
      const text = i18n.t(`rebellion.data:regions.${id}`, { lng });
      const r = regionLabelRect(coreRegionShapes[id]!.label, regionLabelBox(text), vp);
      expect(rectInside(r, canvas), `${id} caption`).toBe(true);
      for (const [sid, sr] of rects)
        expect(rectsOverlap(r, sr, TOLERANCE), `${id}×${sid}`).toBe(false);
    }
  });

  it('the Empire view with the hidden zone still fits every label', () => {
    const { rects } = labelRects(stage, 'ru', true);
    for (const [id, r] of rects) expect(rectInside(r, canvas), id).toBe(true);
    expect(overlappingPairs(rects, TOLERANCE)).toEqual([]);
  });

  it('compact chips (if the LOD is compact) do not cover system labels', () => {
    const { vp, rects } = labelRects(stage, 'ru');
    if (lodFor(vp.scale) !== 'compact') return;
    for (const id of CORE_SYSTEM_IDS) {
      for (const owner of ['empire', 'rebels'] as const) {
        const chip = chipRect(coreMapLayout[id]!, owner, chipBox(9, 2), vp);
        expect(rectInside(chip, canvas), `${id} ${owner} chip`).toBe(true);
        for (const [sid, sr] of rects) {
          expect(rectsOverlap(chip, sr, TOLERANCE), `${id}/${owner} chip × ${sid} label`).toBe(
            false,
          );
        }
      }
    }
  });
});
