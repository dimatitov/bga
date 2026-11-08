/**
 * Single entry point for moves from the actions panel, a map click on a highlighted target, the accessible list
 * and drag-and-drop (plan-frontend §4.6). Targets are always checked against `view.legalActions` (set membership);
 * the server stays the judge, and the cache is changed only by server data (no optimistic writes).
 */
import type { PlayerView } from '@swr/contracts';
import type Konva from 'konva';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { announce, notify } from '@/shared/feedback';
import { useReduceMotion } from '@/shared/settings';
import { type CommandOutcome, useBoard } from '../model/boardContext';
import { computeBoardLayout } from '../model/boardLayout';
import { reportCommandFailure } from '../model/commandFeedback';
import { ZOOM_TWEEN_MS } from '../model/constants';
import { activeDragNode, useDragStore } from '../model/dragStore';
import { pieceName, systemNameById } from '../model/labels';
import { isListedTarget, moveTargetsForPiece } from '../model/legal';
import { previewSlotForMove } from '../model/pieceLayout';

/** DOM id of the context panel heading: focus goes there after a successful move (D-C-6). */
export const CONTEXT_HEADING_ID = 'context-panel-heading';

export interface MoveController {
  move(
    pieceIds: string[],
    fromSystemId: string,
    toSystemId: string,
  ): Promise<CommandOutcome | null>;
  drop(node: Konva.Node, pieceId: string): Promise<void>;
  isPending: boolean;
}

export function useMoveController(): MoveController {
  const { view, send, isPending } = useBoard();
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const viewRef = useRef<PlayerView>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const move = useCallback(
    async (pieceIds: string[], fromSystemId: string, toSystemId: string) => {
      const drag = useDragStore.getState();
      if (drag.pendingMove) return null;
      drag.setPending({ pieceIds, fromSystemId, toSystemId });
      try {
        const outcome = await send({ type: 'MOVE_PIECES', pieceIds, fromSystemId, toSystemId });
        if (outcome.ok) {
          const system = systemNameById(t, outcome.view, toSystemId);
          const message =
            pieceIds.length === 1
              ? t('board:move.success', {
                  piece: pieceName(
                    t,
                    outcome.view.pieces.find((p) => p.id === pieceIds[0]),
                  ),
                  system,
                })
              : t('board:move.successGroup', { count: pieceIds.length, system });
          notify({ severity: 'success', message });
          requestAnimationFrame(() => document.getElementById(CONTEXT_HEADING_ID)?.focus());
        } else {
          reportCommandFailure(t, outcome, () => void move(pieceIds, fromSystemId, toSystemId));
        }
        return outcome;
      } finally {
        useDragStore.getState().setPending(null);
      }
    },
    [send, t],
  );

  const drop = useCallback(
    async (node: Konva.Node, pieceId: string) => {
      const store = useDragStore.getState();
      const drag = store.drag;
      store.endDrag();
      activeDragNode.current = null;
      const current = viewRef.current;
      const piece = current.pieces.find((p) => p.id === pieceId);

      const resetNode = (v: PlayerView) => {
        const slot = computeBoardLayout(v).slots.get(pieceId);
        if (!slot) return;
        if (reduceMotion) node.position(slot);
        else node.to({ x: slot.x, y: slot.y, duration: ZOOM_TWEEN_MS / 1000 });
      };

      if (!piece || !drag || !drag.overSystemId || drag.overSystemId === piece.systemId) {
        resetNode(current);
        announce(t('board:move.cancelled'));
        return;
      }
      const targets = moveTargetsForPiece(current, pieceId);
      if (drag.overState !== 'legal' || !isListedTarget(targets, drag.overSystemId)) {
        // A-16: no request for a target that is not in legalActions.
        resetNode(current);
        notify({
          severity: 'error',
          message: t('board:move.illegalTarget', {
            system: systemNameById(t, current, drag.overSystemId),
          }),
        });
        return;
      }
      const toSystemId = drag.overSystemId;
      const center = computeBoardLayout(current).centers.get(toSystemId);
      const preview =
        center &&
        previewSlotForMove(
          center,
          current.pieces.filter((p) => p.systemId === toSystemId),
          piece,
        );
      if (preview) node.position(preview);
      let outcome: CommandOutcome | null = null;
      try {
        outcome = await move([pieceId], piece.systemId, toSystemId);
      } finally {
        // react-konva will not reset x/y if props did not change: always put the node where the latest view says.
        resetNode(outcome?.ok ? outcome.view : viewRef.current);
      }
    },
    [move, reduceMotion, t],
  );

  return { move, drop, isPending };
}
