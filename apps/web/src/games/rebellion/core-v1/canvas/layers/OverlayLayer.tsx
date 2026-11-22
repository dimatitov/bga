import type { MapPoint } from '@bga/game-rebellion/board';
import { Arrow, Circle, Group, Layer, Text } from 'react-konva';
import { PIECE_SIZE } from '../../../board/model/constants';
import { useDragStore } from '../../../board/model/dragStore';
import { mapStyle } from '../../../theme/mapStyle';
import {
  CORE_SYSTEM_RADIUS,
  LABEL_FONT_PX,
  LABEL_LINE_PX,
  REGION_FONT_PX,
  REGION_LETTER_SPACING_PX,
} from '../../geometry/constants';
import { type LabelBox, systemLabelOffsetBase } from '../../geometry/labelLayout';
import type { CulledLabels } from '../../geometry/labelCulling';
import type { Scene } from '../../geometry/sceneModel';
import { SCREEN_FIXED } from '../screenScale';

const S = mapStyle;

export interface OverlayLayerProps {
  scene: Scene;
  screenScale: number;
  labelBoxes: ReadonlyMap<string, LabelBox>;
  regionLabels: ReadonlyMap<string, LabelBox>;
  /** Captions left after collision culling (compact LOD); `null`/absent = all. */
  shown?: CulledLabels | null;
}

/** End points of an arrow between two system centres, stopping outside both circles. */
function shortened(from: MapPoint, to: MapPoint, gap: number): number[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return [from.x + ux * gap, from.y + uy * gap, to.x - ux * gap, to.y - uy * gap];
}

/**
 * Not interactive (plan-frontend §4): screen-constant system labels and region captions (counter-scaled
 * imperatively, see `screenScale.ts`; geometry = `labelLayout`), «source → activated» arrows, the drag ghost and
 * the ring of a move in flight.
 */
export function OverlayLayer({
  scene,
  screenScale,
  labelBoxes,
  regionLabels,
  shown = null,
}: OverlayLayerProps) {
  const drag = useDragStore((s) => s.drag);
  const pending = useDragStore((s) => s.pendingMove);
  const ghost = drag ? scene.handles.find((u) => u.id === drag.pieceId)?.pos : undefined;
  const pendingCenter = pending ? scene.centers.get(pending.toSystemId) : undefined;
  return (
    <Layer listening={false}>
      {scene.moveLines.map((m) => (
        <Arrow
          key={`${m.fromSystemId}->${m.toSystemId}`}
          points={shortened(m.from, m.to, CORE_SYSTEM_RADIUS + 14)}
          stroke={S.move.stroke}
          fill={S.move.stroke}
          strokeWidth={S.move.width}
          strokeScaleEnabled={false}
          dash={[...S.move.dash]}
          pointerLength={14}
          pointerWidth={12}
          opacity={0.85}
        />
      ))}
      {scene.regions.map((r) => {
        const box = regionLabels.get(r.id);
        if (!box || (shown && !shown.regions.has(r.id))) return null;
        return (
          <Group
            key={`rl-${r.id}`}
            name={SCREEN_FIXED}
            x={r.label.x}
            y={r.label.y}
            scaleX={screenScale}
            scaleY={screenScale}
          >
            <Text
              text={box.lines[0]}
              fontSize={REGION_FONT_PX}
              fontFamily={S.font.family}
              letterSpacing={REGION_LETTER_SPACING_PX}
              fill={S.region.label}
              opacity={S.region.labelOpacity}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      })}
      {scene.systems.map((s) => {
        const box = labelBoxes.get(s.id);
        if (!box || (shown && !shown.systems.has(s.id))) return null;
        const strong = s.target || s.activatedBy !== null || s.selected;
        return (
          <Group
            key={`label-${s.id}`}
            name={SCREEN_FIXED}
            x={s.center.x}
            y={s.center.y}
            scaleX={screenScale}
            scaleY={screenScale}
          >
            <Text
              text={box.lines.join('\n')}
              x={-box.width / 2}
              y={systemLabelOffsetBase(scene.lod)}
              width={box.width}
              height={box.height}
              align="center"
              wrap="none"
              fontSize={LABEL_FONT_PX}
              lineHeight={LABEL_LINE_PX / LABEL_FONT_PX}
              fontFamily={S.font.family}
              fontStyle={strong ? 'bold' : 'normal'}
              fill={s.selected ? S.label.selected : s.target ? S.label.target : S.label.color}
              shadowColor={S.label.halo}
              shadowBlur={4}
              shadowOpacity={0.9}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      })}
      {ghost && (
        <Circle
          x={ghost.x}
          y={ghost.y}
          radius={PIECE_SIZE / 2 + 2}
          stroke={S.ghost.stroke}
          strokeWidth={1.5}
          dash={[...S.ghost.dash]}
          opacity={0.5}
        />
      )}
      {pendingCenter && (
        <Circle
          x={pendingCenter.x}
          y={pendingCenter.y}
          radius={CORE_SYSTEM_RADIUS + 18}
          stroke={S.move.stroke}
          strokeWidth={3}
          dash={[4, 10]}
          opacity={0.8}
        />
      )}
    </Layer>
  );
}
