/**
 * SWR-005 Worker M — `core-layout` (plan-frontend §12: AC-01, AC-14). The layout is own schematic geometry keyed by
 * the web-safe ids; region membership is read from the scenario data here only (test files may import it).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CORE_MAP_BOUNDS,
  HIDDEN_BASE_ZONE_RECT,
  coreMapLayout,
  coreRegionShapes,
  type MapPoint,
} from '../../src/board';
import {
  CORE_REGION_IDS,
  CORE_SYSTEM_IDS,
  type CoreRegionId,
  type CoreSystemId,
} from '../../src/schema';
import { coreDataBaseV1 } from '../../src/scenario';

/** Minimum distance between system centres: 2 × (orbit 62 + half glyph 10) + a gap. */
const MIN_SPACING = 160;

function insidePolygon(p: MapPoint, poly: readonly MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonArea(poly: readonly MapPoint[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  }
  return Math.abs(s / 2);
}

describe('core-layout (SWR-005, AC-01)', () => {
  it('has exactly one centre per system id and one shape per region id', () => {
    expect(Object.keys(coreMapLayout).sort()).toEqual([...CORE_SYSTEM_IDS].sort());
    expect(Object.keys(coreRegionShapes).sort()).toEqual([...CORE_REGION_IDS].sort());
    expect(Object.keys(coreMapLayout)).toHaveLength(32);
    expect(Object.keys(coreRegionShapes)).toHaveLength(8);
  });

  it('keys type-check against CoreSystemId / CoreRegionId', () => {
    const systems: Readonly<Record<CoreSystemId, MapPoint>> = coreMapLayout as Record<
      CoreSystemId,
      MapPoint
    >;
    const regions = coreRegionShapes as Record<CoreRegionId, unknown>;
    expectTypeOf(systems).toEqualTypeOf<Readonly<Record<CoreSystemId, MapPoint>>>();
    expect(Object.keys(regions)).toHaveLength(CORE_REGION_IDS.length);
  });

  it('keeps every centre inside CORE_MAP_BOUNDS', () => {
    for (const [id, { x, y }] of Object.entries(coreMapLayout)) {
      expect(x, id).toBeGreaterThan(0);
      expect(x, id).toBeLessThan(CORE_MAP_BOUNDS.width);
      expect(y, id).toBeGreaterThan(0);
      expect(y, id).toBeLessThan(CORE_MAP_BOUNDS.height);
    }
  });

  it(`keeps system centres at least ${MIN_SPACING} world units apart`, () => {
    const entries = Object.entries(coreMapLayout);
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [ia, a] = entries[i]!;
        const [ib, b] = entries[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${ia}–${ib}`).toBeGreaterThanOrEqual(MIN_SPACING);
      }
    }
  });

  it('puts every centre inside the polygon of its own region and of no other (data membership)', () => {
    for (const s of coreDataBaseV1.systems) {
      const p = coreMapLayout[s.id]!;
      for (const [regionId, shape] of Object.entries(coreRegionShapes)) {
        expect(insidePolygon(p, shape.polygon), `${s.id} in ${regionId}`).toBe(
          regionId === s.regionId,
        );
      }
    }
  });

  it('region polygons do not overlap and tile the galaxy rectangle', () => {
    const total = Object.values(coreRegionShapes).reduce((a, r) => a + polygonArea(r.polygon), 0);
    expect(total).toBeCloseTo(CORE_MAP_BOUNDS.width * CORE_MAP_BOUNDS.height, 3);
    // Sample the interior: every point belongs to at most one polygon.
    for (let x = 5; x < CORE_MAP_BOUNDS.width; x += 37) {
      for (let y = 5; y < CORE_MAP_BOUNDS.height; y += 37) {
        const hits = Object.values(coreRegionShapes).filter((r) =>
          insidePolygon({ x, y }, r.polygon),
        );
        expect(hits.length, `(${x}, ${y})`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('region label anchors lie inside their region', () => {
    for (const [id, shape] of Object.entries(coreRegionShapes)) {
      expect(insidePolygon(shape.label, shape.polygon), id).toBe(true);
    }
  });

  it('the hidden rebel-base zone lies outside the galaxy (it is not a system)', () => {
    const z = HIDDEN_BASE_ZONE_RECT;
    expect(z.y).toBeGreaterThan(CORE_MAP_BOUNDS.height);
    for (const p of Object.values(coreMapLayout)) {
      const inZone = p.x >= z.x && p.x <= z.x + z.width && p.y >= z.y && p.y <= z.y + z.height;
      expect(inZone).toBe(false);
    }
  });

  it('./board never imports another subpath (no scenario/schema in the web bundle, AC-14)', () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/board');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(path.join(dir, file), 'utf8');
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const spec of imports) expect(spec, `${file}: ${spec}`).toMatch(/^\.\/[a-z-]+$/);
    }
  });
});
