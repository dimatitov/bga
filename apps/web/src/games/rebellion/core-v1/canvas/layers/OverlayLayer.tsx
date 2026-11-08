import type { MapPoint } from '@bga/game-rebellion/board';
import { Arrow, Circle, Group, Layer, Text } from 'react-konva';
import { PIECE_SIZE } from '../../../board/model/constants';
import { useDragStore } from '../../../board/model/dragStore';
import { rebellionPalette } from '../../../theme/palette';
import {
  CORE_SYSTEM_RADIUS,
  LABEL_FONT_PX,
  LABEL_GAP_PX,
  LABEL_LINE_PX,
  REGION_FONT_PX,
  REGION_LETTER_SPACING_PX,
} from '../../geometry/constants';
import type { LabelBox } from '../../geometry/labelLayout';
import type { Scene } from '../../geometry/sceneModel';
import { SCREEN_FIXED } from '../screenScale';

const C = rebellionPalette.board;

export interface OverlayLayerProps {
  scene: Scene;
  screenScale: number;
  labelBoxes: ReadonlyMap<string, LabelBox>;
  regionLabels: ReadonlyMap<string, LabelBox>;
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
export function OverlayLayer({ scene, screenScale, labelBoxes, regionLabels }: OverlayLayerProps) {
  const drag = useDragStore((s) => s.drag);
  const pending = useDragStore((s) => s.pendingMove);
  const ghost = drag ? scene.units.find((u) => u.id === drag.pieceId)?.pos : undefined;
  const pendingCenter = pending ? scene.centers.get(pending.toSystemId) : undefined;
  return (
    <Layer listening={false}>
      {scene.moveLines.map((m) => (
        <Arrow
          key={`${m.fromSystemId}->${m.toSystemId}`}
          points={shortened(m.from, m.to, CORE_SYSTEM_RADIUS + 14)}
          stroke={C.legalTarget}
          fill={C.legalTarget}
          strokeWidth={2}
          dash={[8, 6]}
          pointerLength={14}
          pointerWidth={12}
          opacity={0.85}
        />
      ))}
      {scene.regions.map((r) => {
        const box = regionLabels.get(r.id);
        if (!box) return null;
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
              letterSpacing={REGION_LETTER_SPACING_PX}
              fill={C.label}
              opacity={0.7}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      })}
      {scene.systems.map((s) => {
        const box = labelBoxes.get(s.id);
        if (!box) return null;
        const strong = s.target || s.activatedBy !== null || s.selected;
        return (
          <Group
            key={`label-${s.id}`}
            name={SCREEN_FIXED}
            x={s.center.x}
            y={s.center.y + CORE_SYSTEM_RADIUS}
            scaleX={screenScale}
            scaleY={screenScale}
          >
            <Text
              text={box.lines.join('\n')}
              x={-box.width / 2}
              y={LABEL_GAP_PX}
              width={box.width}
              height={box.height}
              align="center"
              wrap="none"
              fontSize={LABEL_FONT_PX}
              lineHeight={LABEL_LINE_PX / LABEL_FONT_PX}
              fontStyle={strong ? 'bold' : 'normal'}
              fill={s.target ? C.legalTarget : C.label}
              shadowColor={C.background}
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
          stroke={C.label}
          strokeWidth={1.5}
          dash={[4, 3]}
          opacity={0.5}
        />
      )}
      {pendingCenter && (
        <Circle
          x={pendingCenter.x}
          y={pendingCenter.y}
          radius={CORE_SYSTEM_RADIUS + 18}
          stroke={C.legalTarget}
          strokeWidth={3}
          dash={[4, 10]}
          opacity={0.8}
        />
      )}
    </Layer>
  );
}
