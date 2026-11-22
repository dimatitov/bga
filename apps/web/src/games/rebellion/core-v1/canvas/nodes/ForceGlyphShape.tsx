import type { FactionId } from '@bga/game-rebellion/schema';
import { Circle, Line, Rect } from 'react-konva';
import { mapStyle } from '../../../theme/mapStyle';
import { type GlyphKind, forceGlyphSpec } from '../../../theme/glyphs';

export interface ForceGlyphShapeProps {
  owner: FactionId;
  kind: GlyphKind;
  /** Box size in px (the glyph is centred on 0,0). */
  size: number;
  x?: number;
  y?: number;
  dashed?: boolean;
}

/**
 * Konva twin of the DOM `ForceGlyph` (SWR-009 R-3): the same `forceGlyphSpec` — fleet triangle, ground square,
 * leader diamond with an amber contour; Empire filled, Rebels outlined. Decorative, not listening.
 */
export function ForceGlyphShape({ owner, kind, size, x = 0, y = 0, dashed }: ForceGlyphShapeProps) {
  const spec = forceGlyphSpec(owner, kind);
  const shape = spec.shape;
  const h = size / 2;
  const props = {
    x,
    y,
    fill: spec.filled ? spec.color : mapStyle.marker.background,
    stroke: spec.stroke,
    strokeWidth: spec.filled ? 1 : 1.6,
    dash: dashed ? [2, 2] : undefined,
    listening: false,
    perfectDrawEnabled: false,
  };
  switch (shape) {
    case 'triangle':
      return <Line points={[0, -h, h, h, -h, h]} closed {...props} />;
    case 'square':
      return <Rect offsetX={h - 1} offsetY={h - 1} width={size - 2} height={size - 2} {...props} />;
    case 'diamond':
      return <Line points={[0, -h, h, 0, 0, h, -h, 0]} closed {...props} />;
    default:
      return <Circle radius={h - 0.5} {...props} />;
  }
}
