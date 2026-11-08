import type Konva from 'konva';
import { useCallback } from 'react';
import { Group, Layer, Rect, Text } from 'react-konva';
import { useDragStore } from '../../../board/model/dragStore';
import { rebellionPalette } from '../../../theme/palette';
import type { CoreMoveDrag } from '../../hooks/useCoreMoveDrag';
import type { Lod } from '../../geometry/lod';
import type { Scene, UnitScene } from '../../geometry/sceneModel';
import { CoreSystemNode } from '../nodes/CoreSystemNode';
import { HiddenBaseZone } from '../nodes/HiddenBaseZone';
import { LeaderBadge } from '../nodes/LeaderBadge';
import { SideCountChip } from '../nodes/SideCountChip';
import { UnitGlyphNode } from '../nodes/UnitGlyphNode';

type TapEvent = Konva.KonvaEventObject<MouseEvent | TouchEvent>;

export interface InteractiveLayerProps {
  scene: Scene;
  lod: Lod;
  screenScale: number;
  zoneTitle: string;
  leaderShort(id: string): string;
  moveDrag: CoreMoveDrag;
  onSystem(systemId: string): void;
  onUnit(unitId: string): void;
  onLeader(leaderId: string): void;
  onZone(): void;
  setCursor(cursor: string): void;
}

/**
 * Interactive part of the map (plan-frontend §4): systems, the hidden rebel-base zone, units (detail: glyphs on the
 * orbit, compact: per-side chips) and leaders on the map. Clicks stop at the node (the stage click clears the
 * selection); a unit drag never pans the stage.
 */
export function InteractiveLayer({
  scene,
  lod,
  screenScale,
  zoneTitle,
  leaderShort,
  moveDrag,
  onSystem,
  onUnit,
  onLeader,
  onZone,
  setCursor,
}: InteractiveLayerProps) {
  const pendingMove = useDragStore((s) => s.pendingMove);

  const stop = (e: TapEvent) => {
    e.cancelBubble = true;
  };
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
  const onHover = useCallback(
    (id: string | null) => {
      if (useDragStore.getState().drag) return;
      setCursor(id ? 'pointer' : 'grab');
    },
    [setCursor],
  );

  const homeOf = useCallback(
    (id: string) => scene.units.find((u) => u.id === id)?.pos ?? null,
    [scene.units],
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
          <CoreSystemNode key={s.id} system={s} onSelect={onSelectSystem} onHover={onHover} />
        ))}
      </Group>
      {scene.zone && (
        <HiddenBaseZone
          zone={scene.zone}
          title={zoneTitle}
          leaderShort={leaderShort}
          onSelectZone={onSelectZone}
          onSelectUnit={onSelectUnit}
          onSelectLeader={onSelectLeader}
        />
      )}
      <Group name="units">
        {scene.units.map((u) => (
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
        {scene.overflow.map((o) => (
          <Group
            key={`${o.systemId}-${o.owner}`}
            x={o.pos.x}
            y={o.pos.y}
            onClick={(e) => {
              stop(e);
              onSystem(o.systemId);
            }}
            onTap={(e) => {
              stop(e);
              onSystem(o.systemId);
            }}
          >
            <Rect
              x={-16}
              y={-10}
              width={32}
              height={20}
              cornerRadius={10}
              fill={rebellionPalette.board.systemFill}
              stroke={rebellionPalette.faction[o.owner]}
            />
            <Text
              text={`+${o.count}`}
              x={-16}
              y={-6}
              width={32}
              align="center"
              fontSize={12}
              fill={rebellionPalette.board.label}
            />
          </Group>
        ))}
        {scene.chips.map((c) => (
          <SideCountChip
            key={`${c.systemId}-${c.owner}`}
            chip={c}
            initialScale={screenScale}
            onSelect={onSelectSystem}
          />
        ))}
      </Group>
      <Group name="leaders">
        {scene.leaders.map((l) => (
          <LeaderBadge key={l.id} leader={l} short={leaderShort(l.id)} onSelect={onSelectLeader} />
        ))}
      </Group>
    </Layer>
  );
}
