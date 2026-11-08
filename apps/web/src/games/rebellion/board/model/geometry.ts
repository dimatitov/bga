/**
 * Pure viewport geometry (plan-frontend §4.2). No game rules here: only screen/world transforms,
 * zoom/pan math and nearest-system lookup by distance (used for drag snapping, not for legality).
 */
import type { MapLayout, MapPoint } from '@bga/game-rebellion/board';
import {
  BOUNDS_MARGIN,
  FIT_PADDING_MAX,
  FIT_PADDING_MIN,
  FIT_PADDING_RATIO,
  MAX_SCALE,
  MIN_SCALE,
  SNAP_RADIUS,
} from './constants';

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

/** Screen-pixel insets around the fitted content (labels are screen-constant, so they are reserved in px). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const EPS = 1e-6;

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  return Math.min(max, Math.max(min, scale));
}

export function canZoomIn(scale: number): boolean {
  return scale < MAX_SCALE - EPS;
}

/** `min` = the store's effective minimum (`min(MIN_SCALE, fit scale)`, SWR-005 §6). */
export function canZoomOut(scale: number, min = MIN_SCALE): boolean {
  return scale > min + EPS;
}

export function worldToScreen(vp: Viewport, p: MapPoint): MapPoint {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y };
}

export function screenToWorld(vp: Viewport, p: MapPoint): MapPoint {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale };
}

/**
 * Zoom by `factor` keeping the world point under `pointer` (screen, stage-relative) fixed. Scale is clamped to
 * `[min, MAX_SCALE]` (`min` defaults to `MIN_SCALE`; the store passes its effective `minScale`).
 */
export function zoomAt(vp: Viewport, pointer: MapPoint, factor: number, min = MIN_SCALE): Viewport {
  const scale = clampScale(vp.scale * factor, min);
  if (Math.abs(scale - vp.scale) < EPS) return vp;
  const world = screenToWorld(vp, pointer);
  return { scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale };
}

/** Zoom around the stage center (buttons, keyboard). */
export function zoomAtCenter(vp: Viewport, stage: Size, factor: number, min = MIN_SCALE): Viewport {
  return zoomAt(vp, { x: stage.width / 2, y: stage.height / 2 }, factor, min);
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

/** SWR-005 §6: adaptive padding `clamp(12, 0.03 × min(w, h), 48)` screen px on every side. */
export function adaptivePadding(stage: Size): number {
  const p = FIT_PADDING_RATIO * Math.min(stage.width, stage.height);
  return Math.min(FIT_PADDING_MAX, Math.max(FIT_PADDING_MIN, p));
}

function toInsets(padding: number | Insets): Insets {
  return typeof padding === 'number'
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding;
}

/** Adaptive padding plus `extra` screen insets (e.g. room for screen-constant labels). */
export function fitInsets(stage: Size, extra: Insets = NO_INSETS): Insets {
  const p = adaptivePadding(stage);
  return {
    top: p + extra.top,
    right: p + extra.right,
    bottom: p + extra.bottom,
    left: p + extra.left,
  };
}

/** Scale at which `bounds` fills `stage` minus `padding` — NOT clamped from below (SWR-005 §6, D-SW5-10). */
export function fitScale(bounds: Bounds, stage: Size, padding: number | Insets): number {
  const pad = toInsets(padding);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const aw = Math.max(1, stage.width - pad.left - pad.right);
  const ah = Math.max(1, stage.height - pad.top - pad.bottom);
  return Math.min(MAX_SCALE, aw / bw, ah / bh);
}

/**
 * Viewport that shows the whole `bounds` centered inside the area of `stage` left by `padding` (px, a number for
 * all sides or per-side insets). The scale is capped by `MAX_SCALE` but never raised to `MIN_SCALE`: "fit" must
 * always show the whole map, even on a narrow stage (SWR-004 O-2 → SWR-005 §6).
 */
export function fitViewport(bounds: Bounds, stage: Size, padding: number | Insets): Viewport {
  const pad = toInsets(padding);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const scale = fitScale(bounds, stage, pad);
  const aw = stage.width - pad.left - pad.right;
  const ah = stage.height - pad.top - pad.bottom;
  return {
    scale,
    x: pad.left + (aw - bw * scale) / 2 - bounds.minX * scale,
    y: pad.top + (ah - bh * scale) / 2 - bounds.minY * scale,
  };
}

/** Effective minimum zoom: `MIN_SCALE`, or lower when the whole map needs it (the fit view stays reachable). */
export function effectiveMinScale(fit: number | null): number {
  return fit === null ? MIN_SCALE : Math.min(MIN_SCALE, fit);
}

export function sameBounds(a: Bounds | null, b: Bounds | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

export function sameInsets(a: Insets, b: Insets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
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
