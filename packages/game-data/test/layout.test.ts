import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS, mapLayout } from '../src/layout';
import { mockScenario } from '../src';

describe('mapLayout (TC-ARCH-04)', () => {
  it('has exactly one entry per scenario system', () => {
    expect(new Set(Object.keys(mapLayout))).toEqual(new Set(mockScenario.systems.map((s) => s.id)));
  });

  it('keeps every system inside MAP_BOUNDS', () => {
    for (const { x, y } of Object.values(mapLayout)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(MAP_BOUNDS.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(MAP_BOUNDS.height);
    }
  });

  it('keeps system centres at least 180 world units apart', () => {
    const points = Object.values(mapLayout);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]!;
        const b = points[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(180);
      }
    }
  });
});
