/**
 * SWR-005 Worker M — content bounds of the core map (plan-frontend §6 item 3, §12; AC-12). SWR-009: move handles on the
 * inner upper arc, leader diamonds, the hidden-zone leader row and marker anchor stay inside the fitted bounds.
 */
import { CORE_MAP_BOUNDS, HIDDEN_BASE_ZONE_RECT, coreMapLayout } from '@bga/game-rebellion/board';
import { CORE_SYSTEM_IDS } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { PIECE_HIT, PIECE_SIZE } from '../../board/model/constants';
import { LEADER_RADIUS } from './constants';
import { SYSTEM_REACH, coreContentBounds } from './contentBounds';
import { handleSlots, leaderSlots, zoneLeaderSlots, zoneMarkerAnchor } from './sceneModel';

const inside = (
  b: { minX: number; minY: number; maxX: number; maxY: number },
  p: { x: number; y: number },
  r = 0,
) => p.x - r >= b.minX && p.x + r <= b.maxX && p.y - r >= b.minY && p.y + r <= b.maxY;

describe('coreContentBounds', () => {
  it('covers the whole galaxy rectangle (all region polygons)', () => {
    const b = coreContentBounds({ systemIds: CORE_SYSTEM_IDS, showZone: false })!;
    expect(b.minX).toBeLessThanOrEqual(0);
    expect(b.minY).toBeLessThanOrEqual(0);
    expect(b.maxX).toBeGreaterThanOrEqual(CORE_MAP_BOUNDS.width);
    expect(b.maxY).toBeGreaterThanOrEqual(CORE_MAP_BOUNDS.height);
  });

  it('contains every move handle (7 per source) and every leader badge of every system', () => {
    const b = coreContentBounds({ systemIds: CORE_SYSTEM_IDS, showZone: false })!;
    for (const id of CORE_SYSTEM_IDS) {
      const c = coreMapLayout[id]!;
      const handles = handleSlots(
        c,
        Array.from({ length: 7 }, (_, i) => `u${i}`),
      );
      for (const p of handles.values()) {
        expect(inside(b, p, PIECE_HIT / 2), `${id} handle slot`).toBe(true);
      }
      const leaders = [
        ...['a', 'b', 'c', 'd'].map((x) => ({ id: `e${x}`, owner: 'empire' as const })),
        ...['a', 'b', 'c', 'd'].map((x) => ({ id: `r${x}`, owner: 'rebels' as const })),
      ];
      for (const p of leaderSlots(c, leaders).values()) {
        expect(inside(b, p, LEADER_RADIUS), `${id} leader slot`).toBe(true);
      }
      expect(inside(b, { x: c.x, y: c.y }, SYSTEM_REACH)).toBe(true);
    }
  });

  it('includes the hidden rebel-base zone only when it is drawn', () => {
    const without = coreContentBounds({ systemIds: CORE_SYSTEM_IDS, showZone: false })!;
    const withZone = coreContentBounds({ systemIds: CORE_SYSTEM_IDS, showZone: true })!;
    const z = HIDDEN_BASE_ZONE_RECT;
    expect(without.maxY).toBeLessThan(z.y);
    expect(withZone.maxY).toBe(z.y + z.height);
    for (const p of zoneLeaderSlots(8)) expect(inside(withZone, p, LEADER_RADIUS)).toBe(true);
    expect(inside(withZone, zoneMarkerAnchor(), PIECE_SIZE / 2)).toBe(true);
  });

  it('ignores ids without a layout entry and returns null for nothing', () => {
    expect(
      coreContentBounds({ systemIds: ['nowhere'], showZone: false, regionIds: [] }),
    ).toBeNull();
  });
});
