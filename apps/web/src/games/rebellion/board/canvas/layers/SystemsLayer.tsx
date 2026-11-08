import type Konva from 'konva';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layer } from 'react-konva';
import { rebellionPalette } from '../../../theme/palette';
import { useMoveController } from '../../hooks/useMoveController';
import { useBoard } from '../../model/boardContext';
import type { BoardLayout } from '../../model/boardLayout';
import { useDragStore } from '../../model/dragStore';
import { systemName } from '../../model/labels';
import { highlightedSystemIds, isListedTarget } from '../../model/legal';
import { useSelectionStore } from '../../model/selectionStore';
import { LinkLines } from '../nodes/LinkLines';
import { SystemNode } from '../nodes/SystemNode';

export interface SystemsLayerProps {
  layout: BoardLayout;
  setCursor(cursor: string): void;
}

export function SystemsLayer({ layout, setCursor }: SystemsLayerProps) {
  const { view } = useBoard();
  const { t } = useTranslation();
  const selection = useSelectionStore((s) => s.selection);
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const drag = useDragStore((s) => s.drag);
  const { move } = useMoveController();

  const targets = useMemo(
    () => highlightedSystemIds(view, selection, drag),
    [view, selection, drag],
  );
  const sourcePieceId = drag?.pieceId ?? (selection.kind === 'piece' ? selection.pieceId : null);
  const sourcePiece = sourcePieceId ? view.pieces.find((p) => p.id === sourcePieceId) : undefined;

  const onSelect = useCallback(
    (systemId: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      // D-I-4: a click on a highlighted target of the selected piece is the move command (1 click).
      if (
        selection.kind === 'piece' &&
        sourcePiece &&
        sourcePiece.systemId !== systemId &&
        isListedTarget(targets, systemId)
      ) {
        void move([sourcePiece.id], sourcePiece.systemId, systemId);
        return;
      }
      selectSystem(systemId);
    },
    [move, selectSystem, selection.kind, sourcePiece, targets],
  );

  const onHover = useCallback(
    (id: string | null) => setCursor(id ? 'pointer' : 'grab'),
    [setCursor],
  );

  return (
    <Layer>
      <LinkLines
        systems={view.systems}
        centers={layout.centers}
        fromSystemId={sourcePiece?.systemId ?? null}
        targetIds={targets}
        color={rebellionPalette.board.link}
        highlightColor={rebellionPalette.board.legalTarget}
      />
      {view.systems.map((s) => {
        const center = layout.centers.get(s.id);
        if (!center) return null;
        const highlighted = targets.includes(s.id);
        const dropState =
          drag && drag.overSystemId === s.id && drag.overState !== 'none' ? drag.overState : null;
        return (
          <SystemNode
            key={s.id}
            id={s.id}
            center={center}
            label={systemName(t, s)}
            selected={selection.kind === 'system' && selection.systemId === s.id}
            highlighted={highlighted}
            dropState={dropState}
            isBase={view.rebelBase.systemId === s.id}
            colors={rebellionPalette.board}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </Layer>
  );
}
