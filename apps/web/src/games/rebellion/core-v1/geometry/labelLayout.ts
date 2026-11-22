/**
 * Screen rectangles of the screen-constant map labels (SWR-005 plan-frontend §4 «Подписи», §6 criterion). The same
 * numbers drive the Konva nodes (`OverlayLayer`) and `__boardDebug.getSystemLabelRect`, so the
 * fit check («labels inside the canvas and pairwise disjoint») tests what is drawn. Text width is estimated
 * conservatively (no canvas measuring), and the drawn text is centred inside that box. Pure.
 */
import type { MapPoint } from '@bga/game-rebellion/board';
import type { Viewport } from '../../board/model/geometry';
import {
  LABEL_CHAR_EM,
  LABEL_FONT_PX,
  LABEL_LINE_PX,
  LABEL_MAX_LINES,
  LABEL_MAX_WIDTH_PX,
  LABEL_OFFSET_COMPACT_PX,
  LABEL_OFFSET_PX,
  LABEL_PAD_PX,
  REGION_CHAR_EM,
  REGION_FONT_PX,
  REGION_LETTER_SPACING_PX,
} from './constants';
import { type Lod, labelScreenFactor, lodFor } from './lod';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelBox {
  /** Box size in screen px at factor 1. */
  width: number;
  height: number;
  lines: string[];
}

/** Estimated width (px, factor 1) of one line of label text. */
export function estimateTextWidth(
  text: string,
  fontPx = LABEL_FONT_PX,
  em = LABEL_CHAR_EM,
): number {
  return Math.ceil([...text].length * fontPx * em);
}

/** Box of a system label: up to two lines, width capped at 120 px (wider text is clipped by the box). */
export function systemLabelBox(lines: readonly string[]): LabelBox {
  const kept = lines.slice(0, LABEL_MAX_LINES);
  const textWidth = Math.max(0, ...kept.map((l) => estimateTextWidth(l)));
  return {
    width: Math.min(LABEL_MAX_WIDTH_PX, textWidth + LABEL_PAD_PX),
    height: kept.length * LABEL_LINE_PX,
    lines: kept,
  };
}

/** Box of a region caption (single UPPERCASE line, left-aligned at its anchor). */
export function regionLabelBox(text: string): LabelBox {
  const upper = text.toLocaleUpperCase();
  const chars = [...upper].length;
  return {
    width: Math.ceil(chars * (REGION_FONT_PX * REGION_CHAR_EM + REGION_LETTER_SPACING_PX)),
    height: Math.ceil(REGION_FONT_PX * 1.3),
    lines: [upper],
  };
}

/** Label offset (px at factor 1) for a LOD: below the ground marker row (detail) or below the node (compact). */
export function systemLabelOffsetBase(lod: Lod): number {
  return lod === 'compact' ? LABEL_OFFSET_COMPACT_PX : LABEL_OFFSET_PX;
}

/** Offset (screen px) of the label box top below the system centre: screen-constant like the node and markers. */
export function systemLabelOffsetPx(scale: number): number {
  return systemLabelOffsetBase(lodFor(scale)) * labelScreenFactor(scale);
}

/** Stage-relative screen rect of a system label for `viewport`. */
export function systemLabelRect(center: MapPoint, box: LabelBox, viewport: Viewport): Rect {
  const k = labelScreenFactor(viewport.scale);
  const sx = center.x * viewport.scale + viewport.x;
  const sy = center.y * viewport.scale + viewport.y;
  return {
    x: sx - (box.width * k) / 2,
    y: sy + systemLabelOffsetPx(viewport.scale),
    width: box.width * k,
    height: box.height * k,
  };
}

/** Stage-relative screen rect of a region caption anchored (top-left) at `anchor`. */
export function regionLabelRect(anchor: MapPoint, box: LabelBox, viewport: Viewport): Rect {
  const k = labelScreenFactor(viewport.scale);
  return {
    x: anchor.x * viewport.scale + viewport.x,
    y: anchor.y * viewport.scale + viewport.y,
    width: box.width * k,
    height: box.height * k,
  };
}

export function rectsOverlap(a: Rect, b: Rect, tolerance = 0): boolean {
  return (
    a.x + tolerance < b.x + b.width &&
    b.x + tolerance < a.x + a.width &&
    a.y + tolerance < b.y + b.height &&
    b.y + tolerance < a.y + a.height
  );
}

export function rectInside(inner: Rect, outer: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/** Pairs of ids whose rects overlap (more than `tolerance` px). */
export function overlappingPairs(
  rects: ReadonlyMap<string, Rect>,
  tolerance = 0,
): Array<[string, string]> {
  const entries = [...rects];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (rectsOverlap(entries[i]![1], entries[j]![1], tolerance)) {
        pairs.push([entries[i]![0], entries[j]![0]]);
      }
    }
  }
  return pairs;
}
