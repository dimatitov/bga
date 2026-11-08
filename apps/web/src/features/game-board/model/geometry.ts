/**
 * Pure viewport geometry (plan-frontend §4.2). No game rules here: only screen/world transforms,
 * zoom/pan math and nearest-system lookup by distance (used for drag snapping, not for legality).
 */
import type { MapLayout, MapPoint } from '@swr/game-data/layout';
import { BOUNDS_MARGIN, FIT_PADDING, MAX_SCALE, MIN_SCALE, SNAP_RADIUS } from './constants';

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EPS = 1e-6;

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  return Math.min(max, Math.max(min, scale));
}

export function canZoomIn(scale: number): boolean {
  return scale < MAX_SCALE - EPS;
}

export function canZoomOut(scale: number): boolean {
  return scale > MIN_SCALE + EPS;
}

export function worldToScreen(vp: Viewport, p: MapPoint): MapPoint {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y };
}

export function screenToWorld(vp: Viewport, p: MapPoint): MapPoint {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale };
}

/** Zoom by `factor` keeping the world point under `pointer` (screen, stage-relative) fixed. Scale is clamped. */
export function zoomAt(vp: Viewport, pointer: MapPoint, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor);
  if (Math.abs(scale - vp.scale) < EPS) return vp;
  const world = screenToWorld(vp, pointer);
  return { scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale };
}

/** Zoom around the stage center (buttons, keyboard). */
export function zoomAtCenter(vp: Viewport, stage: Size, factor: number): Viewport {
  return zoomAt(vp, { x: stage.width / 2, y: stage.height / 2 }, factor);
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy };
}

/** Bounding box of the given system centers (missing layout entries are skipped) ± margin. */
export function computeBounds(
  layout: MapLayout,
  systemIds: readonly string[],
  margin = BOUNDS_MARGIN,
): Bounds | null {
  let b: Bounds | null = null;
  for (const id of systemIds) {
    const p = layout[id];
    if (!p) continue;
    b = b
      ? {
          minX: Math.min(b.minX, p.x),
          minY: Math.min(b.minY, p.y),
          maxX: Math.max(b.maxX, p.x),
          maxY: Math.max(b.maxY, p.y),
        }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  }
  if (!b) return null;
  return {
    minX: b.minX - margin,
    minY: b.minY - margin,
    maxX: b.maxX + margin,
    maxY: b.maxY + margin,
  };
}

/** Viewport that shows the whole `bounds` centered inside `stage` with `padding` px (scale clamped). */
export function fitViewport(bounds: Bounds, stage: Size, padding = FIT_PADDING): Viewport {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const aw = Math.max(1, stage.width - padding * 2);
  const ah = Math.max(1, stage.height - padding * 2);
  const scale = clampScale(Math.min(aw / bw, ah / bh));
  return {
    scale,
    x: (stage.width - bw * scale) / 2 - bounds.minX * scale,
    y: (stage.height - bh * scale) / 2 - bounds.minY * scale,
  };
}

/** Closest system center within `radius` world units of `p` (geometry only — not a rule). */
export function nearestSystem(
  p: MapPoint,
  centers: ReadonlyMap<string, MapPoint>,
  radius = SNAP_RADIUS,
): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const [id, c] of centers) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}
