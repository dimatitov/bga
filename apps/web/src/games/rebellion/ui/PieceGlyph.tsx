import { useTheme } from '@mui/material/styles';
import { type Faction, type PieceKind } from '@bga/game-rebellion/schema';
import { rebellionPalette } from '../theme/palette';

export interface PieceGlyphProps {
  kind: PieceKind;
  owner: Faction;
  hidden?: boolean;
  /** Pixel size of the square box (default 16). */
  size?: number;
}

/**
 * SVG shape matching the canvas: unit = square, leader = circle, token = diamond;
 * Empire filled, Rebels outlined (3px on dark fill); hidden → dashed + «?» (ux-decisions §7).
 * Decorative: always paired with text by the caller.
 */
export function PieceGlyph({ kind, owner, hidden = false, size = 16 }: PieceGlyphProps) {
  const { palette } = useTheme();
  const color = rebellionPalette.faction[owner];
  const isEmpire = owner === 'empire';
  const strokeWidth = isEmpire ? 1.5 : 3;
  const shapeProps = {
    fill: isEmpire ? color : rebellionPalette.board.systemFill,
    stroke: color,
    strokeWidth,
    strokeDasharray: hidden ? '3 2' : undefined,
  };
  const inset = 3;
  const max = 24 - inset;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-kind={kind}
      data-owner={owner}
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
    >
      {kind === 'unit' && (
        <rect x={inset} y={inset} width={max - inset} height={max - inset} {...shapeProps} />
      )}
      {kind === 'leader' && <circle cx={12} cy={12} r={12 - inset} {...shapeProps} />}
      {kind === 'token' && (
        <polygon points={`12,${inset} ${max},12 12,${max} ${inset},12`} {...shapeProps} />
      )}
      {hidden && (
        <text
          x={12}
          y={16}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={isEmpire ? palette.background.default : color}
        >
          {'?'}
        </text>
      )}
    </svg>
  );
}
