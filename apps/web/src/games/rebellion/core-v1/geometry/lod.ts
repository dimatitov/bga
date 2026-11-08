/** Level of detail of the `core-v1` map (SWR-005 plan-frontend §4 «LOD», D-SW5-9). Pure. */
import { LABEL_MAX_SCREEN_FACTOR, LOD_THRESHOLD } from './constants';

export type Lod = 'detail' | 'compact';

/** `compact` below 65 %: per-side count chips instead of glyphs, unit drag off. */
export function lodFor(scale: number): Lod {
  return scale < LOD_THRESHOLD ? 'compact' : 'detail';
}

/**
 * Screen size factor of screen-constant text: 1 up to 100 %, then it grows with the map, capped at 1.6×.
 * A screen-constant node is drawn with `scale = labelScreenFactor(s) / s` inside the world-scaled stage.
 */
export function labelScreenFactor(scale: number): number {
  return Math.min(LABEL_MAX_SCREEN_FACTOR, Math.max(1, scale));
}

export function screenFixedScale(scale: number): number {
  return labelScreenFactor(scale) / scale;
}
