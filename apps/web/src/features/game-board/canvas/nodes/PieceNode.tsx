import type { Faction, PieceKind } from '@swr/contracts';
import type { MapPoint } from '@swr/game-data/layout';
import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Rect, RegularPolygon, Text } from 'react-konva';
import { PIECE_HIT, PIECE_SIZE } from '../../model/constants';

export interface PieceColors {
  empire: string;
  rebellion: string;
  darkFill: string;
  selected: string;
}

export interface PieceNodeProps {
  id: string;
  kind: PieceKind;
  owner: Faction;
  unknown: boolean;
  slot: MapPoint;
  selected: boolean;
  draggable: boolean;
  pending: boolean;
  colors: PieceColors;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onDragStart(id: string, e: Konva.KonvaEventObject<DragEvent>): void;
  onDragMove(id: string, e: Konva.KonvaEventObject<DragEvent>): void;
  onDragEnd(id: string, e: Konva.KonvaEventObject<DragEvent>): void;
  onHover(id: string | null): void;
}

const HALF = PIECE_SIZE / 2;

function PieceShape({
  kind,
  fill,
  stroke,
  strokeWidth,
  dash,
}: {
  kind: PieceKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
}) {
  const common = { fill, stroke, strokeWidth, dash, perfectDrawEnabled: false, listening: false };
  if (kind === 'leader') return <Circle radius={HALF} {...common} />;
  if (kind === 'token') return <RegularPolygon sides={4} radius={HALF + 2} {...common} />;
  return <Rect x={-HALF} y={-HALF} width={PIECE_SIZE} height={PIECE_SIZE} {...common} />;
}

function PieceNodeImpl({
  id,
  kind,
  owner,
  unknown,
  slot,
  selected,
  draggable,
  pending,
  colors,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onHover,
}: PieceNodeProps) {
  const color = owner === 'empire' ? colors.empire : colors.rebellion;
  const isEmpire = owner === 'empire';
  return (
    <Group
      x={slot.x}
      y={slot.y}
      id={`piece-${id}`}
      name="piece"
      draggable={draggable}
      opacity={pending ? 0.6 : 1}
      onClick={(e) => onSelect(id, e)}
      onTap={(e) => onSelect(id, e)}
      onDragStart={(e) => onDragStart(id, e)}
      onDragMove={(e) => onDragMove(id, e)}
      onDragEnd={(e) => onDragEnd(id, e)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Invisible hit area ≥ 30 world units (D-A-7). */}
      <Rect
        x={-PIECE_HIT / 2}
        y={-PIECE_HIT / 2}
        width={PIECE_HIT}
        height={PIECE_HIT}
        fill="transparent"
      />
      {selected && (
        <>
          <Circle radius={HALF + 5} stroke={colors.selected} strokeWidth={1.5} listening={false} />
          <Circle radius={HALF + 9} stroke={colors.selected} strokeWidth={1.5} listening={false} />
        </>
      )}
      <PieceShape
        kind={kind}
        fill={isEmpire ? color : colors.darkFill}
        stroke={color}
        strokeWidth={isEmpire ? 1.5 : 3}
        dash={unknown ? [3, 2] : undefined}
      />
      {unknown && (
        <Text
          text="?"
          x={-HALF}
          y={-7}
          width={PIECE_SIZE}
          align="center"
          fontSize={13}
          fontStyle="bold"
          fill={isEmpire ? colors.darkFill : color}
          listening={false}
        />
      )}
    </Group>
  );
}

export const PieceNode = memo(PieceNodeImpl);
