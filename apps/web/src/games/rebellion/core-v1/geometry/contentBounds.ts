/**
 * World bounds of everything the `core-v1` map draws (SWR-005 plan-frontend §6 item 3): region polygons, systems
 * with their unit orbits and the leader arc, and the hidden rebel-base zone when it is shown. Screen-constant text is
 * NOT here — it is reserved as screen insets (`CORE_CONTENT_INSETS`). Pure.
 */
import {
  HIDDEN_BASE_ZONE_RECT,
  type MapPoint,
  coreMapLayout,
  coreRegionShapes,
} from '@bga/game-rebellion/board';
import type { Bounds } from '../../board/model/geometry';
import { ORBIT_RADIUS, PIECE_SIZE } from '../../board/model/constants';
import { LEADER_ARC_RADIUS, LEADER_RADIUS } from './constants';

/** Horizontal / downward reach of a system's unit glyphs from its centre. */
export const SYSTEM_REACH = ORBIT_RADIUS + PIECE_SIZE / 2;
/** Upward reach (leader badges on the outer arc). */
export const SYSTEM_REACH_TOP = LEADER_ARC_RADIUS + LEADER_RADIUS;

function include(b: Bounds | null, minX: number, minY: number, maxX: number, maxY: number): Bounds {
  return b
    ? {
        minX: Math.min(b.minX, minX),
        minY: Math.min(b.minY, minY),
        maxX: Math.max(b.maxX, maxX),
        maxY: Math.max(b.maxY, maxY),
      }
    : { minX, minY, maxX, maxY };
}

export interface ContentBoundsInput {
  /** Systems actually drawn (ids of the view). */
  systemIds: readonly string[];
  /** Whether the hidden rebel-base zone is drawn (Empire before the reveal). */
  showZone: boolean;
  layout?: Readonly<Record<string, MapPoint>>;
  regionIds?: readonly string[];
}

export function coreContentBounds({
  systemIds,
  showZone,
  layout = coreMapLayout,
  regionIds = Object.keys(coreRegionShapes),
}: ContentBoundsInput): Bounds | null {
  let b: Bounds | null = null;
  for (const id of regionIds) {
    for (const p of coreRegionShapes[id]?.polygon ?? []) b = include(b, p.x, p.y, p.x, p.y);
  }
  for (const id of systemIds) {
    const c = layout[id];
    if (!c) continue;
    b = include(
      b,
      c.x - SYSTEM_REACH,
      c.y - SYSTEM_REACH_TOP,
      c.x + SYSTEM_REACH,
      c.y + SYSTEM_REACH,
    );
  }
  if (showZone && b) {
    const z = HIDDEN_BASE_ZONE_RECT;
    b = include(b, z.x, z.y, z.x + z.width, z.y + z.height);
  }
  return b;
}
