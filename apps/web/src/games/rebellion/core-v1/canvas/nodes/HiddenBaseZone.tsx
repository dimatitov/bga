import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import { mapStyle } from '../../../theme/mapStyle';
import { ZONE_PADDING } from '../../geometry/constants';
import type { GroupMarkerScene, ZoneScene } from '../../geometry/sceneModel';
import { GroupMarkerNode } from './GroupMarkerNode';
import { LeaderBadge } from './LeaderBadge';

const Z = mapStyle.zone;

export interface HiddenBaseZoneProps {
  zone: ZoneScene;
  title: string;
  initialScale: number;
  leaderShort(id: string): string;
  onSelectZone(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onSelectMarker(
    marker: GroupMarkerScene,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ): void;
  onSelectLeader(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onHover(id: string | null): void;
}

/**
 * «Rebel base — location unknown» (D-SW5-11, AM-BE-7; SWR-009 §3.5): a dashed frame outside the galaxy with the
 * Rebel counters (`zoneForces`, per arena) and leader diamonds of what the server placed in
 * `location.kind === 'rebelBase'`. Not a system, not a drop target, and nothing in it names a system. AI mark — a
 * dashed red frame + dot when the AI's last run touched the zone.
 */
function HiddenBaseZoneImpl({
  zone,
  title,
  initialScale,
  leaderShort,
  onSelectZone,
  onSelectMarker,
  onSelectLeader,
  onHover,
}: HiddenBaseZoneProps) {
  const { rect } = zone;
  const accent = zone.selected ? Z.selected : zone.activated ? Z.activated : Z.stroke;
  return (
    <Group id="hidden-base-zone" name="zone">
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill={Z.fill}
        onClick={onSelectZone}
        onTap={onSelectZone}
      />
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke={accent}
        strokeWidth={zone.selected || zone.activated ? 4 : 2}
        dash={[...Z.dash]}
        listening={false}
      />
      {zone.aiRecent && (
        <>
          <Rect
            x={rect.x - 10}
            y={rect.y - 10}
            width={rect.width + 20}
            height={rect.height + 20}
            stroke={mapStyle.tone.ai}
            strokeWidth={2}
            dash={[8, 8]}
            listening={false}
          />
          <Circle
            x={rect.x + rect.width - 14}
            y={rect.y + 14}
            radius={6}
            fill={mapStyle.tone.ai}
            listening={false}
          />
        </>
      )}
      <Text
        text={title}
        x={rect.x + ZONE_PADDING}
        y={rect.y + 12}
        width={rect.width - ZONE_PADDING * 2}
        fontSize={24}
        fontFamily={mapStyle.font.family}
        lineHeight={1.15}
        wrap="word"
        fill={Z.title}
        listening={false}
      />
      {zone.leaders.map((l) => (
        <LeaderBadge key={l.id} leader={l} short={leaderShort(l.id)} onSelect={onSelectLeader} />
      ))}
      {zone.markers.map((m) => (
        <GroupMarkerNode
          key={m.key}
          marker={m}
          initialScale={initialScale}
          onSelect={onSelectMarker}
          onHover={onHover}
        />
      ))}
    </Group>
  );
}

export const HiddenBaseZone = memo(HiddenBaseZoneImpl);
