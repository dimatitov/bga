/**
 * Drag of one own unit onto the activated system (SWR-005 plan-frontend §5.2, D-SW5-4). Only units the server lists
 * in a `MOVE_PIECES` action are draggable, only in the detail LOD, and the only target is that action's
 * `toSystemId`; a drop anywhere else rolls the unit back without a request. Group moves (transport) go through the
 * turn panel. Sending, feedback, inline errors (`move-error-<from>`) and focus go through P1's
 * `useTurnCommands().move` (one path for panel and map). The cache changes only from the server response.
 */
import type { MapPoint } from '@bga/game-rebellion/board';
import type Konva from 'konva';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { announce, notify } from '@/shared/feedback';
import { useReduceMotion } from '@/shared/settings';
import { SNAP_RADIUS, ZOOM_TWEEN_MS } from '../../board/model/constants';
import { activeDragNode, useDragStore } from '../../board/model/dragStore';
import { nearestSystem } from '../../board/model/geometry';
import type { Lod } from '../geometry/lod';
import { useCoreBoard } from '../model/coreContext';
import { moveSourceFrom, movableInDetail, systemById } from '../model/viewModel';
import { useTurnCommands } from '../panels/useTurnCommands';

export interface CoreMoveDrag {
  /** Whether a unit may be picked up now (listed by the server, detail LOD, nothing in flight). */
  canDrag(unitId: string, lod: Lod): boolean;
  start(unitId: string, node: Konva.Node): void;
  /** Pointer moved to `world` (stage-relative world point): updates the hovered system / its state. */
  over(unitId: string, world: MapPoint | null): void;
  /** Drop: sends `MOVE_PIECES` for the listed target, otherwise rolls the node back to `home`. */
  drop(node: Konva.Node, unitId: string, home: MapPoint): Promise<void>;
}

export function useCoreMoveDrag(centers: ReadonlyMap<string, MapPoint>): CoreMoveDrag {
  const { view, isPending } = useCoreBoard();
  const { move: sendMove } = useTurnCommands();
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const canDrag = useCallback(
    (unitId: string, lod: Lod) =>
      lod === 'detail' &&
      !isPending &&
      !useDragStore.getState().pendingMove &&
      movableInDetail(view, unitId) !== null,
    [isPending, view],
  );

  const start = useCallback((unitId: string, node: Konva.Node) => {
    const move = movableInDetail(viewRef.current, unitId);
    if (!move) return;
    useDragStore.getState().start(unitId, move.fromSystemId);
    activeDragNode.current = node;
  }, []);

  const over = useCallback(
    (unitId: string, world: MapPoint | null) => {
      const move = movableInDetail(viewRef.current, unitId);
      if (!move || !world) return;
      const target = nearestSystem(world, centers, SNAP_RADIUS);
      // Geometry says which system is under the pointer; legality is only `MOVE_PIECES.toSystemId`.
      const state =
        target === null || target === move.fromSystemId
          ? 'none'
          : target === move.toSystemId
            ? 'legal'
            : 'illegal';
      useDragStore.getState().over(target, state);
    },
    [centers],
  );

  const drop = useCallback(
    async (node: Konva.Node, unitId: string, home: MapPoint) => {
      const store = useDragStore.getState();
      const drag = store.drag;
      store.endDrag();
      activeDragNode.current = null;
      const current = viewRef.current;
      const move = movableInDetail(current, unitId);
      const reset = () => {
        if (reduceMotion) node.position(home);
        else node.to({ x: home.x, y: home.y, duration: ZOOM_TWEEN_MS / 1000 });
      };
      const name = (systemId: string) =>
        t(`rebellion.data:${systemById(current, systemId)?.nameKey ?? `systems.${systemId}`}`);

      if (!move || !drag || !drag.overSystemId || drag.overSystemId === move.fromSystemId) {
        reset();
        announce(t('rebellion.board:move.cancelled'));
        return;
      }
      if (drag.overSystemId !== move.toSystemId) {
        reset();
        notify({
          severity: 'error',
          message: t('rebellion.board:move.illegalTarget', { system: name(drag.overSystemId) }),
        });
        return;
      }
      const source = moveSourceFrom(current, move.fromSystemId);
      if (!source) {
        reset();
        return;
      }
      useDragStore.getState().setPending({
        pieceIds: [unitId],
        fromSystemId: source.fromSystemId,
        toSystemId: source.toSystemId,
      });
      try {
        // On success the new view (already in the cache) moves the node to its new slot via props.
        const outcome = await sendMove(source, [unitId]);
        if (!outcome.ok) reset();
      } finally {
        useDragStore.getState().setPending(null);
      }
    },
    [reduceMotion, sendMove, t],
  );

  return { canDrag, start, over, drop };
}
