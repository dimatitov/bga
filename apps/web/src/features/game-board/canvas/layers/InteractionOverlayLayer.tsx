import { useTheme } from '@mui/material/styles';
import { Circle, Layer } from 'react-konva';
import type { BoardLayout } from '../../model/boardLayout';
import { PIECE_SIZE, SYSTEM_RADIUS } from '../../model/constants';
import { useDragStore } from '../../model/dragStore';

/** Drag ghost on the origin slot and a "pending" ring on the target while a move is in flight. Not interactive. */
export function InteractionOverlayLayer({ layout }: { layout: BoardLayout }) {
  const { palette } = useTheme();
  const drag = useDragStore((s) => s.drag);
  const pending = useDragStore((s) => s.pendingMove);
  const ghost = drag ? layout.slots.get(drag.pieceId) : undefined;
  const pendingCenter = pending ? layout.centers.get(pending.toSystemId) : undefined;
  return (
    <Layer listening={false}>
      {ghost && (
        <Circle
          x={ghost.x}
          y={ghost.y}
          radius={PIECE_SIZE / 2 + 2}
          stroke={palette.board.label}
          strokeWidth={1.5}
          dash={[4, 3]}
          opacity={0.5}
        />
      )}
      {pendingCenter && (
        <Circle
          x={pendingCenter.x}
          y={pendingCenter.y}
          radius={SYSTEM_RADIUS + 16}
          stroke={palette.board.legalTarget}
          strokeWidth={3}
          dash={[4, 10]}
          opacity={0.8}
        />
      )}
    </Layer>
  );
}
