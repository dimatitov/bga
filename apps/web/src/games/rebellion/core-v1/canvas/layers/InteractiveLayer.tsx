import type Konva from 'konva';
import { useCallback } from 'react';
import { Group, Layer } from 'react-konva';
import { useDragStore } from '../../../board/model/dragStore';
import type { CoreMoveDrag } from '../../hooks/useCoreMoveDrag';
import type { Lod } from '../../geometry/lod';
import type { GroupMarkerScene, Scene, UnitScene } from '../../geometry/sceneModel';
import { CoreSystemNode } from '../nodes/CoreSystemNode';
import { GroupMarkerNode } from '../nodes/GroupMarkerNode';
import { HiddenBaseZone } from '../nodes/HiddenBaseZone';
import { LeaderBadge } from '../nodes/LeaderBadge';
import { UnitGlyphNode } from '../nodes/UnitGlyphNode';

type TapEvent = Konva.KonvaEventObject<MouseEvent | TouchEvent>;

export interface InteractiveLayerProps {
  scene: Scene;
  lod: Lod;
  screenScale: number;
  zoneTitle: string;
  /** Localised tag of the AI marks. */
  aiTag: string;
  leaderShort(id: string): string;
  moveDrag: CoreMoveDrag;
  onSystem(systemId: string): void;
  onUnit(unitId: string): void;
  onLeader(leaderId: string): void;
  onZone(): void;
  /** Click / tap on a group counter (the stage applies QD-5: armed leader → system click, else the manifest). */
  onMarker(marker: GroupMarkerScene): void;
  setCursor(cursor: string): void;
}

/**
 * Interactive part of the map (plan-frontend §4; SWR-009 plan §2 M): systems with their state marks, the hidden
 * rebel-base zone, group counter markers (detail: side × arena; compact: per side), leader diamonds and — during the
 * viewer's own activation — single-unit move handles on top. Clicks stop at the node (the stage click clears the
 * selection); a unit drag never pans the stage.
 */
export function InteractiveLayer({
  scene,
  lod,
  screenScale,
  zoneTitle,
  aiTag,
  leaderShort,
  moveDrag,
  onSystem,
  onUnit,
  onLeader,
  onZone,
  onMarker,
  setCursor,
}: InteractiveLayerProps) {
  const pendingMove = useDragStore((s) => s.pendingMove);

  const onSelectSystem = useCallback(
    (id: string, e: TapEvent) => {
      e.cancelBubble = true;
      onSystem(id);
    },
    [onSystem],
  );
  const onSelectUnit = useCallback(
    (id: string, e: TapEvent) => {
      e.cancelBubble = true;
      onUnit(id);
    },
    [onUnit],
  );
  const onSelectLeader = useCallback(
    (id: string, e: TapEvent) => {
      e.cancelBubble = true;
      onLeader(id);
    },
    [onLeader],
  );
  const onSelectZone = useCallback(
    (e: TapEvent) => {
      e.cancelBubble = true;
      onZone();
    },
    [onZone],
  );
  const onSelectMarker = useCallback(
    (m: GroupMarkerScene, e: TapEvent) => {
      e.cancelBubble = true;
      onMarker(m);
    },
    [onMarker],
  );
  const onHover = useCallback(
    (id: string | null) => {
      if (useDragStore.getState().drag) return;
      setCursor(id ? 'pointer' : 'grab');
    },
    [setCursor],
  );

  const homeOf = useCallback(
    (id: string) => scene.handles.find((u) => u.id === id)?.pos ?? null,
    [scene.handles],
  );
  const onDragStart = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      onUnit(id);
      moveDrag.start(id, e.target);
      e.target.moveToTop();
      setCursor('grabbing');
    },
    [moveDrag, onUnit, setCursor],
  );
  const onDragMove = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      moveDrag.over(id, e.target.getStage()?.getRelativePointerPosition() ?? null);
    },
    [moveDrag],
  );
  const onDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      setCursor('grab');
      const home = homeOf(id);
      if (home) void moveDrag.drop(e.target, id, home);
    },
    [homeOf, moveDrag, setCursor],
  );

  const draggable = (u: UnitScene) => !pendingMove && moveDrag.canDrag(u.id, lod);

  return (
    <Layer>
      <Group name="systems">
        {scene.systems.map((s) => (
          <CoreSystemNode
            key={s.id}
            system={s}
            initialScale={screenScale}
            aiTag={aiTag}
            onSelect={onSelectSystem}
            onHover={onHover}
          />
        ))}
      </Group>
      {scene.zone && (
        <HiddenBaseZone
          zone={scene.zone}
          title={zoneTitle}
          initialScale={screenScale}
          leaderShort={leaderShort}
          onSelectZone={onSelectZone}
          onSelectMarker={onSelectMarker}
          onSelectLeader={onSelectLeader}
          onHover={onHover}
        />
      )}
      <Group name="markers">
        {scene.markers.map((m) => (
          <GroupMarkerNode
            key={m.key}
            marker={m}
            initialScale={screenScale}
            onSelect={onSelectMarker}
            onHover={onHover}
          />
        ))}
      </Group>
      <Group name="leaders">
        {scene.leaders.map((l) => (
          <LeaderBadge key={l.id} leader={l} short={leaderShort(l.id)} onSelect={onSelectLeader} />
        ))}
      </Group>
      <Group name="handles">
        {scene.handles.map((u) => (
          <UnitGlyphNode
            key={u.id}
            unit={u}
            draggable={draggable(u)}
            pending={!!pendingMove?.pieceIds.includes(u.id)}
            onSelect={onSelectUnit}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onHover={onHover}
          />
        ))}
      </Group>
    </Layer>
  );
}
