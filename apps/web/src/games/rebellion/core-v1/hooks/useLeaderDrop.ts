/**
 * Drop of a leader chip dragged from the pool (HTML5 DnD, `LEADER_DND_MIME`) onto the map (SWR-005 plan-frontend
 * §5.2, Q-FE-10 — optional path; click + keyboard are the main ones). The pointer is mapped into the stage, the
 * nearest system is taken by distance, and the command is sent only when `ACTIVATE_SYSTEM` lists that pair.
 */
import type { MapPoint } from '@bga/game-rebellion/board';
import type Konva from 'konva';
import { type DragEvent, type RefObject, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '@/shared/feedback';
import { SNAP_RADIUS } from '../../board/model/constants';
import { nearestSystem } from '../../board/model/geometry';
import { decodeLeaderDrag, hasLeaderDrag } from '../model/dnd';
import { useActivateSystem } from './useActivateSystem';

export function useLeaderDrop(
  stageRef: RefObject<Konva.Stage | null>,
  centers: ReadonlyMap<string, MapPoint>,
): { onDragOver(e: DragEvent<HTMLElement>): void; onDrop(e: DragEvent<HTMLElement>): void } {
  const { t } = useTranslation();
  const activate = useActivateSystem();

  const onDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    if (!hasLeaderDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      const leaderId = decodeLeaderDrag(e.dataTransfer);
      if (!leaderId) return;
      e.preventDefault();
      const stage = stageRef.current;
      if (stage) stage.setPointersPositions(e.nativeEvent);
      const world = stage?.getRelativePointerPosition() ?? null;
      const systemId = world ? nearestSystem(world, centers, SNAP_RADIUS) : null;
      if (!systemId) {
        announce(t('rebellion.map:drop.cancelled'));
        return;
      }
      void activate(leaderId, systemId);
    },
    [activate, centers, stageRef, t],
  );

  return { onDragOver, onDrop };
}
