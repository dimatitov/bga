import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Line, Path, RegularPolygon } from 'react-konva';
import { rebellionPalette } from '../../../theme/palette';
import { CORE_SYSTEM_RADIUS } from '../../geometry/constants';
import type { SystemScene } from '../../geometry/sceneModel';

/** MUI Home icon path (24×24), own placeholder graphics (D-V-4). */
const HOME_PATH = 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z';
const R = CORE_SYSTEM_RADIUS;
const C = rebellionPalette.board;
const F = rebellionPalette.faction;

export interface CoreSystemNodeProps {
  system: SystemScene;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onHover(id: string | null): void;
}

/**
 * One system of the core map (plan-frontend §4 «CoreSystemNode»). Every state has a non-colour cue (ux §7):
 * remote — dashed outline + small diamond; contested — badge with two crossed strokes; activation target — dashed
 * teal ring + halo; activated — solid ring in the side's colour + flag; move source — thin dashed ring; selected —
 * double white ring; rebel base — Home icon (only when the server shows the base).
 */
function CoreSystemNodeImpl({ system: s, onSelect, onHover }: CoreSystemNodeProps) {
  const sideColor = s.activatedBy ? F[s.activatedBy] : C.legalTarget;
  return (
    <Group
      x={s.center.x}
      y={s.center.y}
      id={`system-${s.id}`}
      name="system"
      onClick={(e) => onSelect(s.id, e)}
      onTap={(e) => onSelect(s.id, e)}
      onMouseEnter={() => onHover(s.id)}
      onMouseLeave={() => onHover(null)}
    >
      {s.target && (
        <Circle
          radius={R + 12}
          fill={C.legalTarget}
          opacity={0.12}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Circle
        radius={R}
        fill={C.systemFill}
        stroke={C.systemStroke}
        strokeWidth={2}
        dash={s.remote ? [6, 5] : undefined}
        perfectDrawEnabled={false}
      />
      {s.remote && (
        <RegularPolygon
          sides={4}
          radius={6}
          x={-R - 2}
          y={R - 4}
          fill={C.systemFill}
          stroke={C.label}
          strokeWidth={1.5}
          listening={false}
        />
      )}
      {s.source && (
        <Circle
          radius={R + 5}
          stroke={C.legalTarget}
          strokeWidth={1.5}
          dash={[3, 4]}
          listening={false}
        />
      )}
      {s.target && (
        <Circle
          radius={R + 9}
          stroke={C.legalTarget}
          strokeWidth={2.5}
          dash={[8, 6]}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {s.activatedBy && (
        <>
          <Circle
            radius={R + 9}
            stroke={sideColor}
            strokeWidth={s.dropTarget ? 7 : 4}
            listening={false}
          />
          {/* flag: pole + triangle above the top right of the ring */}
          <Line
            points={[R * 0.55, -R - 6, R * 0.55, -R - 30]}
            stroke={sideColor}
            strokeWidth={3}
            listening={false}
          />
          <Line
            points={[R * 0.55, -R - 30, R * 0.55 + 18, -R - 24, R * 0.55, -R - 18]}
            closed
            fill={sideColor}
            listening={false}
          />
        </>
      )}
      {s.selected && (
        <>
          <Circle radius={R + 4} stroke={C.selected} strokeWidth={2} listening={false} />
          <Circle radius={R + 14} stroke={C.selected} strokeWidth={2} listening={false} />
        </>
      )}
      {s.contested && (
        <Group x={R * 0.75} y={-R * 0.75} listening={false}>
          <Circle radius={11} fill={C.systemFill} stroke={C.label} strokeWidth={1} />
          <Line points={[-6, -6, 6, 6]} stroke={F.rebels} strokeWidth={3} lineCap="round" />
          <Line points={[6, -6, -6, 6]} stroke={F.empire} strokeWidth={3} lineCap="round" />
        </Group>
      )}
      {s.isBase && (
        <Path
          data={HOME_PATH}
          x={-12}
          y={-12}
          fill={C.label}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
}

export const CoreSystemNode = memo(CoreSystemNodeImpl);
