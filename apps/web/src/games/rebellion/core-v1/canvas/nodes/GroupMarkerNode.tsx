import type Konva from 'konva';
import { memo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { mapStyle } from '../../../theme/mapStyle';
import {
  COMPACT_MARKER_FONT_PX,
  COMPACT_MARKER_GLYPH_PX,
  COMPACT_MARKER_PAD_PX,
  MARKER_FONT_PX,
  MARKER_GLYPH_PX,
  MARKER_HIT_PAD_PX,
  MARKER_PAD_PX,
} from '../../geometry/constants';
import { COMPACT_PART_GAP_PX, compactParts, markerTextWidth } from '../../geometry/markerLayout';
import type { GroupMarkerScene } from '../../geometry/sceneModel';
import { SCREEN_FIXED } from '../screenScale';
import { ForceGlyphShape } from './ForceGlyphShape';

const M = mapStyle.marker;

export interface GroupMarkerNodeProps {
  marker: GroupMarkerScene;
  /** Screen-constant node scale (`screenFixedScale(viewport.scale)`), refreshed imperatively on zoom. */
  initialScale: number;
  onSelect(marker: GroupMarkerScene, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onHover(id: string | null): void;
}

/**
 * «glyph + number» parts of a marker, x positions relative to the plate's left edge — the same arithmetic as
 * `markerLayout` (`groupMarkerWidth` / `compactMarkerWidth`). Compact: «▲ fleet ■ ground ◆ leaders» of the side.
 */
function parts(m: GroupMarkerScene) {
  const compact = m.arena === 'all';
  const list: Array<{ kind: 'space' | 'ground' | 'leader'; n: number }> = compact
    ? compactParts(m)
    : [{ kind: m.arena as 'space' | 'ground', n: m.count }];
  const glyph = compact ? COMPACT_MARKER_GLYPH_PX : MARKER_GLYPH_PX;
  const font = compact ? COMPACT_MARKER_FONT_PX : MARKER_FONT_PX;
  const gap = compact ? 1 : 3;
  let x = (compact ? COMPACT_MARKER_PAD_PX : MARKER_PAD_PX) + 1;
  return list.map((p, i) => {
    if (i > 0) x += COMPACT_PART_GAP_PX;
    const glyphX = x + glyph / 2;
    const textX = x + glyph + gap;
    x = textX + markerTextWidth(p.n, font);
    return { ...p, glyph, font, glyphX, textX };
  });
}

/**
 * Counter marker of a group on the map (SWR-009 R-3, AC-6): a dark plate 34×17 framed in the side's colour, the
 * force glyph and the number of figures (`forcesBySystem` / `zoneForces`). Screen-constant; a click opens the Unit
 * Manifest (or acts as a system click while a leader is armed, QD-5) — the stage decides.
 */
function GroupMarkerNodeImpl({ marker: m, initialScale, onSelect, onHover }: GroupMarkerNodeProps) {
  const { dx, dy, width, height } = m.box;
  const border = m.selected ? M.selected : M.border[m.owner];
  return (
    <Group
      name={SCREEN_FIXED}
      id={`marker-${m.key}`}
      x={m.anchor.x}
      y={m.anchor.y}
      scaleX={initialScale}
      scaleY={initialScale}
      onClick={(e) => onSelect(m, e)}
      onTap={(e) => onSelect(m, e)}
      onMouseEnter={() => onHover(m.key)}
      onMouseLeave={() => onHover(null)}
    >
      <Rect
        x={dx - MARKER_HIT_PAD_PX}
        y={dy - 1}
        width={width + MARKER_HIT_PAD_PX * 2}
        height={height + 2}
        fill="transparent"
      />
      <Rect
        x={dx}
        y={dy}
        width={width}
        height={height}
        fill={M.background}
        stroke={border}
        strokeWidth={m.selected ? 2 : 1}
        listening={false}
        perfectDrawEnabled={false}
      />
      {parts(m).map((p) => (
        <Group key={p.kind} listening={false}>
          <ForceGlyphShape
            owner={m.owner}
            kind={p.kind}
            size={p.glyph}
            x={dx + p.glyphX}
            y={dy + height / 2}
          />
          <Text
            text={String(p.n)}
            x={dx + p.textX}
            y={dy + (height - p.font) / 2 + 0.5}
            fontSize={p.font}
            fontFamily={mapStyle.font.family}
            fontStyle={M.fontWeight}
            fill={M.text}
            wrap="none"
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
    </Group>
  );
}

export const GroupMarkerNode = memo(GroupMarkerNodeImpl);
