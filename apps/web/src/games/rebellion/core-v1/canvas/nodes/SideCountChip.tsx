import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import { rebellionPalette } from '../../../theme/palette';
import {
  CHIP_FONT_PX,
  CHIP_GLYPH_PX,
  CHIP_HEIGHT_PX,
  CORE_SYSTEM_RADIUS,
} from '../../geometry/constants';
import { chipBox, estimateTextWidth } from '../../geometry/labelLayout';
import type { ChipScene } from '../../geometry/sceneModel';
import { SCREEN_FIXED } from '../screenScale';

const C = rebellionPalette.board;

export interface SideCountChipProps {
  chip: ChipScene;
  /** Screen-constant node scale (`screenFixedScale(viewport.scale)`), refreshed imperatively on zoom. */
  initialScale: number;
  onSelect(systemId: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void;
}

/** Glyph / text x positions (chip-local px) of the «units» and «leaders» parts. */
function chipParts(units: number, leaders: number, start: number) {
  const parts: Array<{ kind: 'unit' | 'leader'; text: string; glyphX: number; textX: number }> = [];
  let x = start;
  for (const [kind, n] of [
    ['unit', units],
    ['leader', leaders],
  ] as const) {
    if (n <= 0) continue;
    const glyphX = x + (parts.length > 0 ? 4 : 0);
    const textX = glyphX + CHIP_GLYPH_PX + 2;
    const text = String(n);
    parts.push({ kind, text, glyphX, textX });
    x = textX + estimateTextWidth(text, CHIP_FONT_PX, 0.62);
  }
  return parts;
}

/**
 * Compact LOD (D-SW5-9, Q-FE-7): one chip per side on the system's row — «■ 5 ● 1» (units, leaders), Empire left,
 * Rebels right. Screen-constant; geometry mirrors `labelLayout.chipRect` (used by the fit check and debug).
 */
function SideCountChipImpl({ chip, initialScale, onSelect }: SideCountChipProps) {
  const color = rebellionPalette.faction[chip.owner];
  const isEmpire = chip.owner === 'empire';
  const box = chipBox(chip.units, chip.leaders);
  const left = isEmpire ? -box.width : 0;
  const half = CHIP_GLYPH_PX / 2;
  const parts = chipParts(chip.units, chip.leaders, left + 3);
  return (
    <Group
      name={SCREEN_FIXED}
      x={chip.anchor.x + (isEmpire ? -CORE_SYSTEM_RADIUS / 2 : CORE_SYSTEM_RADIUS / 2)}
      y={chip.anchor.y}
      scaleX={initialScale}
      scaleY={initialScale}
      onClick={(e) => onSelect(chip.systemId, e)}
      onTap={(e) => onSelect(chip.systemId, e)}
    >
      <Rect
        x={left}
        y={-CHIP_HEIGHT_PX / 2}
        width={box.width}
        height={CHIP_HEIGHT_PX}
        cornerRadius={CHIP_HEIGHT_PX / 2}
        fill={C.systemFill}
        stroke={color}
        strokeWidth={1.5}
      />
      {parts.map(({ kind, text, glyphX, textX }) => {
        const fill = isEmpire ? color : C.systemFill;
        return (
          <Group key={kind} listening={false}>
            {kind === 'unit' ? (
              <Rect
                x={glyphX}
                y={-half}
                width={CHIP_GLYPH_PX}
                height={CHIP_GLYPH_PX}
                fill={fill}
                stroke={color}
                strokeWidth={isEmpire ? 1 : 2}
              />
            ) : (
              <Circle
                x={glyphX + half}
                y={0}
                radius={half}
                fill={fill}
                stroke={color}
                strokeWidth={isEmpire ? 1 : 2}
              />
            )}
            <Text
              text={text}
              x={textX}
              y={-CHIP_FONT_PX / 2}
              fontSize={CHIP_FONT_PX}
              fontStyle="bold"
              fill={C.label}
            />
          </Group>
        );
      })}
    </Group>
  );
}

export const SideCountChip = memo(SideCountChipImpl);
