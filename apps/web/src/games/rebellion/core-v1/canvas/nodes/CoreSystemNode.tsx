import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Line, Text } from 'react-konva';
import { mapStyle } from '../../../theme/mapStyle';
import { CORE_SYSTEM_RADIUS, NODE_RADIUS_PX } from '../../geometry/constants';
import type { SystemScene } from '../../geometry/sceneModel';
import { type Mark, type MarkRing, type MarkTone, systemMarks } from '../../geometry/systemMarks';
import { SCREEN_FIXED } from '../screenScale';

const S = mapStyle;
const R = NODE_RADIUS_PX;

export interface CoreSystemNodeProps {
  system: SystemScene;
  /** Screen-constant node scale (`screenFixedScale(viewport.scale)`), refreshed imperatively on zoom. */
  initialScale: number;
  /** Localised tag of the AI mark («AI»), followed by « · 01». */
  aiTag: string;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onHover(id: string | null): void;
}

function toneColor(tone: MarkTone, s: SystemScene): string {
  if (tone === 'side') return s.activatedBy ? S.faction[s.activatedBy] : S.tone.selected;
  return S.tone[tone];
}

function RingShape({ ring, color }: { ring: MarkRing; color: string }) {
  return (
    <Circle
      radius={ring.radius}
      stroke={color}
      strokeWidth={ring.width}
      dash={ring.dash ? [...ring.dash] : undefined}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** Extra glyph of a mark (own vector graphics, screen px). */
function MarkGlyphShape({ mark, color, aiTag }: { mark: Mark; color: string; aiTag: string }) {
  const common = { listening: false, perfectDrawEnabled: false } as const;
  switch (mark.glyph) {
    case 'notch': // remote: small diamond at the lower left of the node
      return (
        <Line
          points={[-R - 4, R - 1, -R - 1, R + 2, -R - 4, R + 5, -R - 7, R + 2]}
          closed
          stroke={color}
          strokeWidth={1}
          {...common}
        />
      );
    case 'flag': // activated: pole + pennant above the ring
      return (
        <>
          <Line points={[4, -10, 4, -24]} stroke={color} strokeWidth={1.5} {...common} />
          <Line points={[4, -24, 13, -21, 4, -18]} closed fill={color} {...common} />
        </>
      );
    case 'crosshair': // selected: four ticks across the double ring
      return (
        <>
          <Line points={[-29, 0, -19, 0]} stroke={color} strokeWidth={1} {...common} />
          <Line points={[19, 0, 29, 0]} stroke={color} strokeWidth={1} {...common} />
          <Line points={[0, -29, 0, -19]} stroke={color} strokeWidth={1} {...common} />
          <Line points={[0, 19, 0, 29]} stroke={color} strokeWidth={1} {...common} />
        </>
      );
    case 'chevron': // move source: outward chevron at the lower right
      return (
        <Line
          points={[18, 15, 23, 20, 18, 25]}
          stroke={color}
          strokeWidth={1.5}
          lineCap="round"
          {...common}
        />
      );
    case 'cross': // contested: two crossed strokes in both sides' colours
      return (
        <Group x={R + 4} y={-R - 4} {...common}>
          <Line points={[-4, -4, 4, 4]} stroke={S.faction.rebels} strokeWidth={2} lineCap="round" />
          <Line points={[4, -4, -4, 4]} stroke={S.faction.empire} strokeWidth={2} lineCap="round" />
        </Group>
      );
    case 'home': // rebel base: outline house at the upper left
      return (
        <Line
          points={[-R - 9, -R - 1, -R - 9, -R - 7, -R - 5, -R - 11, -R - 1, -R - 7, -R - 1, -R - 1]}
          closed
          stroke={color}
          strokeWidth={1.5}
          {...common}
        />
      );
    case 'dot': // AI: filled dot + «AI · 01» above the node
      return (
        <>
          <Circle x={10} y={-10} radius={2.5} fill={color} {...common} />
          {mark.order !== undefined && (
            <Text
              text={`${aiTag} · ${String(mark.order).padStart(2, '0')}`}
              x={-30}
              y={-44}
              width={60}
              align="center"
              fontSize={10}
              fontFamily={S.font.family}
              fontStyle="bold"
              fill={S.tone.aiText}
              {...common}
            />
          )}
        </>
      );
    case 'xmark': // illegal drop
      return (
        <>
          <Line points={[-5, -5, 5, 5]} stroke={color} strokeWidth={2} {...common} />
          <Line points={[5, -5, -5, 5]} stroke={color} strokeWidth={2} {...common} />
        </>
      );
    default:
      return null;
  }
}

/**
 * One system of the vector map (SWR-009 R-4, AC-5). The world group keeps the old hit area (radius 30, clicks and
 * drops); the node and its state marks are screen-constant (Console prototype: node r 7, dark fill, phosphor outline).
 * Marks come from `systemMarks` — every state differs by geometry (radius / dash / width / glyph), not by colour only.
 */
function CoreSystemNodeImpl({
  system: s,
  initialScale,
  aiTag,
  onSelect,
  onHover,
}: CoreSystemNodeProps) {
  const marks = systemMarks(s);
  const remote = marks.find((m) => m.kind === 'remote');
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
      <Circle radius={CORE_SYSTEM_RADIUS} fill={S.node.hit} perfectDrawEnabled={false} />
      <Group name={SCREEN_FIXED} scaleX={initialScale} scaleY={initialScale} listening={false}>
        <Circle
          radius={R}
          fill={S.node.fill}
          stroke={S.node.stroke}
          strokeWidth={S.node.strokeWidth}
          dash={remote?.nodeDash ? [...remote.nodeDash] : undefined}
          perfectDrawEnabled={false}
        />
        {marks.map((m) => {
          const color = toneColor(m.tone, s);
          return (
            <Group key={m.kind} name={`mark-${m.kind}`}>
              {m.ring && <RingShape ring={m.ring} color={color} />}
              {m.outer && <RingShape ring={m.outer} color={color} />}
              <MarkGlyphShape mark={m} color={color} aiTag={aiTag} />
            </Group>
          );
        })}
      </Group>
    </Group>
  );
}

export const CoreSystemNode = memo(CoreSystemNodeImpl);
