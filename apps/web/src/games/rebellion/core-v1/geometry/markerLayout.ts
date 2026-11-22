/**
 * Geometry of the group counter markers (SWR-009 R-3, AC-6, plan §2 M item 4). Markers are screen-constant plates
 * anchored at a world point (a system centre or a point of the hidden zone): the box below is in screen px at
 * factor 1 relative to the anchor. The same numbers drive the Konva node (`GroupMarkerNode`), the debug API
 * (`getGroupMarkers` / `getPieceScreenPos`) and the fit tests. Pure.
 */
import type { MapPoint } from '@bga/game-rebellion/board';
import type { FactionId } from '@bga/game-rebellion/schema';
import type { Viewport } from '../../board/model/geometry';
import type { Arena } from '../model/forces';
import {
  COMPACT_MARKER_FONT_PX,
  COMPACT_MARKER_GLYPH_PX,
  COMPACT_MARKER_HEIGHT_PX,
  COMPACT_MARKER_PAD_PX,
  COMPACT_MARKER_REACH_PX,
  LABEL_CHAR_EM,
  MARKER_FONT_PX,
  MARKER_GLYPH_PX,
  MARKER_HEIGHT_PX,
  MARKER_PAD_PX,
  MARKER_REACH_PX,
  MARKER_ROW_GAP_PX,
  MARKER_WIDTH_PX,
  MARKER_ZONE_GAP_PX,
} from './constants';
import type { Rect } from './labelLayout';
import { labelScreenFactor } from './lod';

/** Marker box relative to its anchor, screen px at factor 1. */
export interface MarkerBox {
  dx: number;
  dy: number;
  width: number;
  height: number;
}

/** Width of a number in the marker font (PT Mono: 0.6 em per digit). */
export function markerTextWidth(n: number, fontPx: number = MARKER_FONT_PX): number {
  return Math.ceil(String(n).length * fontPx * LABEL_CHAR_EM);
}

/** Width of a «glyph + count» part of a detail marker. */
function partWidth(n: number): number {
  return MARKER_GLYPH_PX + 3 + markerTextWidth(n);
}

/** Width of a «glyph + count» part of a compact marker. */
export function compactPartWidth(n: number): number {
  return COMPACT_MARKER_GLYPH_PX + 1 + markerTextWidth(n, COMPACT_MARKER_FONT_PX);
}

/** Gap between the parts of a compact marker. */
export const COMPACT_PART_GAP_PX = 3;

/** What a compact side plate counts: fleet and ground figures, leaders. */
export interface CompactCounts {
  space: number;
  ground: number;
  leaders: number;
}

/** The non-empty parts of a compact plate, in drawing order «▲ fleet · ■ ground · ◆ leaders». */
export function compactParts(
  c: CompactCounts,
): Array<{ kind: 'space' | 'ground' | 'leader'; n: number }> {
  return [
    { kind: 'space' as const, n: c.space },
    { kind: 'ground' as const, n: c.ground },
    { kind: 'leader' as const, n: c.leaders },
  ].filter((p) => p.n > 0);
}

/** Detail marker width: 34 px, wider only when the number does not fit (three digits and more). */
export function groupMarkerWidth(count: number): number {
  return Math.max(MARKER_WIDTH_PX, MARKER_PAD_PX * 2 + 2 + partWidth(count));
}

/** Compact marker (one per side): «▲ fleet ■ ground ◆ leaders», empty parts omitted. */
export function compactMarkerWidth(c: CompactCounts): number {
  const inner = compactParts(c).reduce(
    (w, p, i) => w + compactPartWidth(p.n) + (i > 0 ? COMPACT_PART_GAP_PX : 0),
    0,
  );
  return COMPACT_MARKER_PAD_PX * 2 + 1 + inner;
}

/** Detail LOD: Empire on the left, Rebels on the right; fleet on the upper row, ground on the lower row. */
export function groupMarkerBox(owner: FactionId, arena: Arena, count: number): MarkerBox {
  const width = groupMarkerWidth(count);
  const half = MARKER_ROW_GAP_PX / 2;
  return {
    dx: owner === 'empire' ? -MARKER_REACH_PX - width : MARKER_REACH_PX,
    dy: arena === 'space' ? -MARKER_HEIGHT_PX - half : half,
    width,
    height: MARKER_HEIGHT_PX,
  };
}

/** Compact LOD: one marker per side on the centre line of the node. */
export function compactMarkerBox(owner: FactionId, c: CompactCounts): MarkerBox {
  const width = compactMarkerWidth(c);
  return {
    dx: owner === 'empire' ? -COMPACT_MARKER_REACH_PX - width : COMPACT_MARKER_REACH_PX,
    dy: -COMPACT_MARKER_HEIGHT_PX / 2,
    width,
    height: COMPACT_MARKER_HEIGHT_PX,
  };
}

/** Hidden zone: the Rebel fleet marker first, the ground marker to its right (no system, no side split). */
export function zoneMarkerBox(arena: Arena, count: number, spaceWidth: number): MarkerBox {
  return {
    dx: arena === 'space' ? 0 : spaceWidth + MARKER_ZONE_GAP_PX,
    dy: 0,
    width: groupMarkerWidth(count),
    height: MARKER_HEIGHT_PX,
  };
}

/** Stage-relative screen rect of a marker for `viewport`. */
export function markerScreenRect(anchor: MapPoint, box: MarkerBox, viewport: Viewport): Rect {
  const k = labelScreenFactor(viewport.scale);
  return {
    x: anchor.x * viewport.scale + viewport.x + box.dx * k,
    y: anchor.y * viewport.scale + viewport.y + box.dy * k,
    width: box.width * k,
    height: box.height * k,
  };
}

export function rectCenter(r: Rect): MapPoint {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
