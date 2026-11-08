import { useTheme } from '@mui/material/styles';
import type { PieceKind } from '@swr/contracts';
import type Konva from 'konva';
import { useCallback, useMemo } from 'react';
import { Group, Layer, Rect, Text } from 'react-konva';
import { useMoveController } from '../../hooks/useMoveController';
import { useBoard } from '../../model/boardContext';
import type { BoardLayout } from '../../model/boardLayout';
import { activeDragNode, useDragStore } from '../../model/dragStore';
import { nearestSystem } from '../../model/geometry';
import { isUnknownPiece } from '../../model/labels';
import { isListedTarget, moveTargetsForPiece } from '../../model/legal';
import { overflowChipPosition } from '../../model/pieceLayout';
import { useSelectionStore } from '../../model/selectionStore';
import { type PieceColors, PieceNode } from '../nodes/PieceNode';

const KIND_GROUPS: PieceKind[] = ['unit', 'leader', 'token'];

export interface PiecesLayerProps {
  layout: BoardLayout;
  setCursor(cursor: string): void;
}

/** Units < leaders < tokens as Groups inside one Layer (plan-frontend §4.1). */
export function PiecesLayer({ layout, setCursor }: PiecesLayerProps) {
  const { view, isPending } = useBoard();
  const { palette } = useTheme();
  const selection = useSelectionStore((s) => s.selection);
  const selectPiece = useSelectionStore((s) => s.selectPiece);
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const pendingMove = useDragStore((s) => s.pendingMove);
  const { drop } = useMoveController();
  const human = view.setup.humanFaction;

  const colors: PieceColors = useMemo(
    () => ({
      empire: palette.faction.empire,
      rebellion: palette.faction.rebellion,
      darkFill: palette.board.systemFill,
      selected: palette.board.selected,
    }),
    [palette],
  );

  const pieceById = useMemo(() => new Map(view.pieces.map((p) => [p.id, p])), [view.pieces]);

  const onSelect = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      selectPiece(id);
    },
    [selectPiece],
  );

  const onDragStart = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const piece = pieceById.get(id);
      if (!piece) return;
      selectPiece(id);
      useDragStore.getState().start(id, piece.systemId);
      activeDragNode.current = e.target;
      e.target.moveToTop();
      setCursor('grabbing');
    },
    [pieceById, selectPiece, setCursor],
  );

  const onDragMove = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const stage = e.target.getStage();
      const piece = pieceById.get(id);
      const world = stage?.getRelativePointerPosition();
      if (!piece || !world) return;
      const over = nearestSystem(world, layout.centers);
      // Geometry decides which system is under the cursor; legality is only membership in legalActions targets.
      const state =
        over === null || over === piece.systemId
          ? 'none'
          : isListedTarget(moveTargetsForPiece(view, id), over)
            ? 'legal'
            : 'illegal';
      useDragStore.getState().over(over, state);
    },
    [layout.centers, pieceById, view],
  );

  const onDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      setCursor('grab');
      void drop(e.target, id);
    },
    [drop, setCursor],
  );

  const onHover = useCallback(
    (id: string | null) => {
      if (useDragStore.getState().drag) return;
      setCursor(id ? 'pointer' : 'grab');
    },
    [setCursor],
  );

  return (
    <Layer>
      {KIND_GROUPS.map((kind) => (
        <Group key={kind} name={`${kind}s`}>
          {view.pieces
            .filter((p) => p.kind === kind)
            .map((p) => {
              const slot = layout.slots.get(p.id);
              if (!slot) return null;
              const draggable =
                p.owner === human &&
                !isPending &&
                !pendingMove &&
                moveTargetsForPiece(view, p.id).length > 0;
              return (
                <PieceNode
                  key={p.id}
                  id={p.id}
                  kind={p.kind}
                  owner={p.owner}
                  unknown={isUnknownPiece(p)}
                  slot={slot}
                  selected={selection.kind === 'piece' && selection.pieceId === p.id}
                  draggable={draggable}
                  pending={!!pendingMove?.pieceIds.includes(p.id)}
                  colors={colors}
                  onSelect={onSelect}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  onHover={onHover}
                />
              );
            })}
        </Group>
      ))}
      {[...layout.overflow].flatMap(([systemId, counts]) =>
        (['empire', 'rebellion'] as const)
          .filter((f) => counts[f] > 0)
          .map((f) => {
            const c = layout.centers.get(systemId);
            if (!c) return null;
            const p = overflowChipPosition(c, f);
            return (
              <Group
                key={`${systemId}-${f}`}
                x={p.x}
                y={p.y}
                onClick={(e) => {
                  e.cancelBubble = true;
                  selectSystem(systemId);
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  selectSystem(systemId);
                }}
              >
                <Rect
                  x={-16}
                  y={-10}
                  width={32}
                  height={20}
                  cornerRadius={10}
                  fill={palette.board.systemFill}
                  stroke={palette.faction[f]}
                />
                <Text
                  text={`+${counts[f]}`}
                  x={-16}
                  y={-6}
                  width={32}
                  align="center"
                  fontSize={12}
                  fill={palette.board.label}
                />
              </Group>
            );
          }),
      )}
    </Layer>
  );
}
