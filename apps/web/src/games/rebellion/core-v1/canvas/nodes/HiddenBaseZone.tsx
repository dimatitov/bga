import type Konva from 'konva';
import { memo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { rebellionPalette } from '../../../theme/palette';
import { ZONE_PADDING } from '../../geometry/constants';
import type { ZoneScene } from '../../geometry/sceneModel';
import { LeaderBadge } from './LeaderBadge';
import { UnitGlyphNode } from './UnitGlyphNode';

const C = rebellionPalette.board;

export interface HiddenBaseZoneProps {
  zone: ZoneScene;
  title: string;
  leaderShort(id: string): string;
  onSelectZone(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onSelectUnit(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onSelectLeader(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
}

/**
 * «Rebel base — location unknown» (D-SW5-11, AM-BE-7): a dashed frame outside the galaxy with the Rebel units and
 * leaders the server placed in `location.kind === 'rebelBase'`. Not a system and not a drop target.
 */
function HiddenBaseZoneImpl({
  zone,
  title,
  leaderShort,
  onSelectZone,
  onSelectUnit,
  onSelectLeader,
}: HiddenBaseZoneProps) {
  const { rect } = zone;
  const accent = zone.activated ? rebellionPalette.faction.rebels : C.systemStroke;
  return (
    <Group id="hidden-base-zone" name="zone">
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        cornerRadius={12}
        fill={C.systemFill}
        opacity={0.55}
        onClick={onSelectZone}
        onTap={onSelectZone}
      />
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        cornerRadius={12}
        stroke={zone.selected ? C.selected : accent}
        strokeWidth={zone.selected || zone.activated ? 4 : 2.5}
        dash={[14, 10]}
        listening={false}
      />
      <Text
        text={title}
        x={rect.x + ZONE_PADDING}
        y={rect.y + 12}
        width={rect.width - ZONE_PADDING * 2}
        fontSize={24}
        lineHeight={1.15}
        wrap="word"
        fill={C.label}
        listening={false}
      />
      {zone.leaders.map((l) => (
        <LeaderBadge key={l.id} leader={l} short={leaderShort(l.id)} onSelect={onSelectLeader} />
      ))}
      {zone.units.map((u) => (
        <UnitGlyphNode
          key={u.id}
          unit={u}
          draggable={false}
          pending={false}
          onSelect={onSelectUnit}
        />
      ))}
    </Group>
  );
}

export const HiddenBaseZone = memo(HiddenBaseZoneImpl);
