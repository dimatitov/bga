import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Rect } from 'react-konva';
import { PIECE_HIT, PIECE_SIZE } from '../../../board/model/constants';
import { mapStyle } from '../../../theme/mapStyle';
import type { UnitScene } from '../../geometry/sceneModel';
import { ForceGlyphShape } from './ForceGlyphShape';

const HALF = PIECE_SIZE / 2;
const S = mapStyle;

export interface UnitGlyphNodeProps {
  unit: UnitScene;
  draggable: boolean;
  pending: boolean;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onDragStart?(id: string, e: Konva.KonvaEventObject<DragEvent>): void;
  onDragMove?(id: string, e: Konva.KonvaEventObject<DragEvent>): void;
  onDragEnd?(id: string, e: Konva.KonvaEventObject<DragEvent>): void;
  onHover?(id: string | null): void;
}

/**
 * Single-unit move handle (SWR-009 plan §2 M item 5, R-1/OQ-2): during the viewer's own activation every unit the
 * server lists in `MOVE_PIECES.pieces` gets a draggable glyph (no number) with a phosphor dashed ring on the inner arc
 * above its source system; the group counters still show the full composition. Drag = `useCoreMoveDrag` (one unit).
 */
function UnitGlyphNodeImpl({
  unit: u,
  draggable,
  pending,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onHover,
}: UnitGlyphNodeProps) {
  return (
    <Group
      x={u.pos.x}
      y={u.pos.y}
      id={`unit-${u.id}`}
      name="unit"
      draggable={draggable}
      opacity={pending ? 0.6 : 1}
      onClick={(e) => onSelect(u.id, e)}
      onTap={(e) => onSelect(u.id, e)}
      onDragStart={(e) => onDragStart?.(u.id, e)}
      onDragMove={(e) => onDragMove?.(u.id, e)}
      onDragEnd={(e) => onDragEnd?.(u.id, e)}
      onMouseEnter={() => onHover?.(u.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <Rect
        x={-PIECE_HIT / 2}
        y={-PIECE_HIT / 2}
        width={PIECE_HIT}
        height={PIECE_HIT}
        fill="transparent"
      />
      <Circle
        radius={HALF + 3}
        fill={S.handle.plate}
        stroke={S.handle.ring}
        strokeWidth={1.5}
        dash={[...S.handle.dash]}
        listening={false}
        perfectDrawEnabled={false}
      />
      {u.selected && (
        <Circle radius={HALF + 7} stroke={S.tone.selected} strokeWidth={2} listening={false} />
      )}
      <ForceGlyphShape owner={u.owner} kind={u.arena} size={PIECE_SIZE - 6} />
    </Group>
  );
}

export const UnitGlyphNode = memo(UnitGlyphNodeImpl);
