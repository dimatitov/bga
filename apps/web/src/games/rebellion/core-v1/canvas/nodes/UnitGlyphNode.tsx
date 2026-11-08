import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Rect, RegularPolygon } from 'react-konva';
import { PIECE_HIT, PIECE_SIZE } from '../../../board/model/constants';
import { rebellionPalette } from '../../../theme/palette';
import type { UnitScene } from '../../geometry/sceneModel';

const HALF = PIECE_SIZE / 2;
const C = rebellionPalette.board;

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
 * Unit glyph (own graphics): ship = triangle, ground unit = square, structure (immobile) = diamond. Empire filled,
 * Rebels outlined on the dark fill (ux §7). A unit the server lists as movable gets a dashed teal ring.
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
  const color = rebellionPalette.faction[u.owner];
  const isEmpire = u.owner === 'empire';
  const shape = {
    fill: isEmpire ? color : C.systemFill,
    stroke: color,
    strokeWidth: isEmpire ? 1.5 : 3,
    listening: false,
    perfectDrawEnabled: false,
  };
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
      {u.movable && (
        <Circle
          radius={HALF + 5}
          stroke={C.legalTarget}
          strokeWidth={1.5}
          dash={[3, 3]}
          listening={false}
        />
      )}
      {u.selected && (
        <>
          <Circle radius={HALF + 4} stroke={C.selected} strokeWidth={1.5} listening={false} />
          <Circle radius={HALF + 8} stroke={C.selected} strokeWidth={1.5} listening={false} />
        </>
      )}
      {u.immobile ? (
        <RegularPolygon sides={4} radius={HALF + 1} {...shape} />
      ) : u.arena === 'space' ? (
        <RegularPolygon sides={3} radius={HALF + 2} y={2} {...shape} />
      ) : (
        <Rect
          x={-HALF + 1}
          y={-HALF + 1}
          width={PIECE_SIZE - 2}
          height={PIECE_SIZE - 2}
          {...shape}
        />
      )}
    </Group>
  );
}

export const UnitGlyphNode = memo(UnitGlyphNodeImpl);
