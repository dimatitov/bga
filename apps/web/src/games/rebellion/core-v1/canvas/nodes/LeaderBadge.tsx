import type Konva from 'konva';
import { memo } from 'react';
import { Group, Line, Text } from 'react-konva';
import { mapStyle } from '../../../theme/mapStyle';
import { forceGlyphSpec } from '../../../theme/glyphs';
import { LEADER_RADIUS } from '../../geometry/constants';
import type { LeaderScene } from '../../geometry/sceneModel';

const S = mapStyle;
const D = LEADER_RADIUS + 2;

export interface LeaderBadgeProps {
  leader: LeaderScene;
  /** Localised 2-letter abbreviation (`rebellion.data:leaders.<id>.short`). */
  short: string;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
}

const diamond = (r: number) => [0, -r, r, 0, 0, r, -r, 0];

/**
 * Leader on the map (SWR-009 R-3): a diamond with an amber contour (Empire filled red, Rebels on the dark plate) and
 * the initials; activating — an outer solid diamond, selected — an outer dashed amber diamond.
 */
function LeaderBadgeImpl({ leader: l, short, onSelect }: LeaderBadgeProps) {
  const spec = forceGlyphSpec(l.owner, 'leader');
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
        <Line
          points={diamond(D + 6)}
          closed
          stroke={S.faction[l.owner]}
          strokeWidth={2.5}
          listening={false}
        />
      )}
      {l.selected && (
        <Line
          points={diamond(D + 11)}
          closed
          stroke={S.leader.selected}
          strokeWidth={2}
          dash={[4, 3]}
          listening={false}
        />
      )}
      <Line
        points={diamond(D)}
        closed
        fill={spec.filled ? spec.color : S.marker.background}
        stroke={spec.stroke}
        strokeWidth={2}
        perfectDrawEnabled={false}
      />
      <Text
        text={short}
        x={-D}
        y={-5}
        width={D * 2}
        align="center"
        fontSize={10}
        fontFamily={S.font.family}
        fontStyle="bold"
        fill={spec.filled ? S.screen.background : S.label.color}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

export const LeaderBadge = memo(LeaderBadgeImpl);
