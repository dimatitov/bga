import type { CSSProperties } from 'react';

export type GlyphShape = 'triangle' | 'square' | 'diamond' | 'circle';

export interface UnitGlyphProps {
  shape: GlyphShape;
  /** Filled (e.g. Empire) or outlined (e.g. Rebels) — the code that does not rely on colour. */
  filled: boolean;
  /** Main colour: the fill of a filled glyph, the outline of an outlined one. */
  color: string;
  /** Outline colour if it differs from `color` (e.g. a leader's amber contour). */
  stroke?: string;
  /** Dashed outline (e.g. a single-unit move handle). */
  dashed?: boolean;
  /** Pixel size of the square box (default 14). */
  size?: number;
  style?: CSSProperties;
}

const BOX = 24;
const PAD = 3;

function shapeElement(shape: GlyphShape, props: Record<string, string | number | undefined>) {
  const max = BOX - PAD;
  switch (shape) {
    case 'triangle':
      return <polygon points={`12,${PAD} ${max},${max} ${PAD},${max}`} {...props} />;
    case 'square':
      return (
        <rect x={PAD + 1} y={PAD + 1} width={max - PAD - 2} height={max - PAD - 2} {...props} />
      );
    case 'diamond':
      return (
        <polygon points={`12,${PAD - 1} ${max + 1},12 12,${max + 1} ${PAD - 1},12`} {...props} />
      );
    case 'circle':
      return <circle cx={12} cy={12} r={12 - PAD} {...props} />;
  }
}

/**
 * Vector unit glyph (SWR-009 R-3, TC-TK-10): triangle = fleet, square = ground, diamond = leader, circle = other.
 * Decorative (`aria-hidden`); `data-shape` / `data-filled` expose the colour-free code for tests.
 */
export function UnitGlyph({
  shape,
  filled,
  color,
  stroke,
  dashed = false,
  size = 14,
  style,
}: UnitGlyphProps) {
  const outline = stroke ?? color;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      aria-hidden="true"
      focusable="false"
      data-shape={shape}
      data-filled={filled ? 'true' : 'false'}
      data-dashed={dashed ? 'true' : 'false'}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      {shapeElement(shape, {
        fill: filled ? color : 'none',
        stroke: outline,
        strokeWidth: filled ? 1.5 : 3,
        strokeLinejoin: 'round',
        strokeDasharray: dashed ? '4 3' : undefined,
      })}
    </svg>
  );
}
