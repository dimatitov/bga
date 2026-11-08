import type { BoardPalette } from '../../../theme/palette';
import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Line, Path, Text } from 'react-konva';
import type { MapPoint } from '@bga/game-rebellion/board';
import { SYSTEM_RADIUS } from '../../model/constants';

export interface SystemNodeProps {
  id: string;
  center: MapPoint;
  label: string;
  selected: boolean;
  highlighted: boolean;
  dropState: 'legal' | 'illegal' | null;
  isBase: boolean;
  colors: BoardPalette;
  onSelect(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
  onHover(id: string | null): void;
}

const LABEL_WIDTH = 160;
/** MUI Home icon path (24×24), drawn as a Konva Path (own placeholder graphics, D-V-4). */
const HOME_PATH = 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z';

function SystemNodeImpl({
  id,
  center,
  label,
  selected,
  highlighted,
  dropState,
  isBase,
  colors,
  onSelect,
  onHover,
}: SystemNodeProps) {
  return (
    <Group
      x={center.x}
      y={center.y}
      name="system"
      id={`system-${id}`}
      onClick={(e) => onSelect(id, e)}
      onTap={(e) => onSelect(id, e)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      {highlighted && (
        <Circle
          radius={SYSTEM_RADIUS + 10}
          fill={colors.legalTarget}
          opacity={0.12}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Circle
        radius={SYSTEM_RADIUS}
        fill={colors.systemFill}
        stroke={colors.systemStroke}
        strokeWidth={2}
        perfectDrawEnabled={false}
      />
      {highlighted && (
        <Circle
          radius={SYSTEM_RADIUS + 8}
          stroke={colors.legalTarget}
          strokeWidth={dropState === 'legal' ? 5 : 2.5}
          dash={[8, 6]}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {dropState === 'illegal' && (
        <>
          <Circle
            radius={SYSTEM_RADIUS + 8}
            stroke={colors.invalidTarget}
            strokeWidth={4}
            listening={false}
          />
          <Line
            points={[-12, -12, 12, 12]}
            stroke={colors.invalidTarget}
            strokeWidth={4}
            listening={false}
          />
          <Line
            points={[12, -12, -12, 12]}
            stroke={colors.invalidTarget}
            strokeWidth={4}
            listening={false}
          />
        </>
      )}
      {selected && (
        <>
          <Circle
            radius={SYSTEM_RADIUS + 4}
            stroke={colors.selected}
            strokeWidth={2}
            listening={false}
          />
          <Circle
            radius={SYSTEM_RADIUS + 9}
            stroke={colors.selected}
            strokeWidth={2}
            listening={false}
          />
        </>
      )}
      {isBase && (
        <Path
          data={HOME_PATH}
          x={-12}
          y={-12}
          fill={colors.label}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Text
        text={highlighted ? `➜ ${label}` : label}
        x={-LABEL_WIDTH / 2}
        y={SYSTEM_RADIUS + 14}
        width={LABEL_WIDTH}
        align="center"
        fontSize={14}
        fontStyle={selected ? 'bold' : 'normal'}
        fill={highlighted ? colors.legalTarget : colors.label}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

export const SystemNode = memo(SystemNodeImpl);
