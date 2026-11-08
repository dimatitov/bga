import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Text } from 'react-konva';
import { rebellionPalette } from '../../../theme/palette';
import { LEADER_RADIUS } from '../../geometry/constants';
import type { LeaderScene } from '../../geometry/sceneModel';

const C = rebellionPalette.board;

export interface LeaderBadgeProps {
  leader: LeaderScene;
  /** Localised 2-letter abbreviation (`rebellion.data:leaders.<id>.short`). */
  short: string;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
}

/** Leader on the map (plan-frontend §4): circle in the side's colour (Empire filled, Rebels outlined) + initials. */
function LeaderBadgeImpl({ leader: l, short, onSelect }: LeaderBadgeProps) {
  const color = rebellionPalette.faction[l.owner];
  const isEmpire = l.owner === 'empire';
  return (
    <Group
      x={l.pos.x}
      y={l.pos.y}
      id={`leader-${l.id}`}
      name="leader"
      onClick={(e) => onSelect(l.id, e)}
      onTap={(e) => onSelect(l.id, e)}
    >
      {l.activating && (
        <Circle radius={LEADER_RADIUS + 5} stroke={color} strokeWidth={2.5} listening={false} />
      )}
      {l.selected && (
        <Circle radius={LEADER_RADIUS + 4} stroke={C.selected} strokeWidth={2} listening={false} />
      )}
      <Circle
        radius={LEADER_RADIUS}
        fill={isEmpire ? color : C.systemFill}
        stroke={color}
        strokeWidth={isEmpire ? 1.5 : 3}
        perfectDrawEnabled={false}
      />
      <Text
        text={short}
        x={-LEADER_RADIUS}
        y={-6}
        width={LEADER_RADIUS * 2}
        align="center"
        fontSize={12}
        fontStyle="bold"
        fill={isEmpire ? C.background : C.label}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

export const LeaderBadge = memo(LeaderBadgeImpl);
