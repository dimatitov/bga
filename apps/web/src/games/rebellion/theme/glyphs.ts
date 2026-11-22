import type { FactionId } from '@bga/game-rebellion/schema';
import { terminalTokens } from '@/shared/theme';
import type { GlyphShape } from '@/shared/ui';
import { rebellionPalette } from './palette';

/** What a glyph stands for: a fleet (space), ground forces (everything not `space`, QD-4) or a leader. */
export type GlyphKind = 'space' | 'ground' | 'leader';

/** One colour-independent glyph descriptor shared by DOM (`ForceGlyph` → `UnitGlyph`) and Konva (map layers). */
export interface ForceGlyphSpec {
  shape: GlyphShape;
  /** Empire filled, Rebels outlined — the code that does not rely on colour (R-2). */
  filled: boolean;
  /** Fill of a filled glyph / outline of an outlined one: the faction colour. */
  color: string;
  /** Outline colour (leaders: amber contour). */
  stroke: string;
}

const SHAPE: Readonly<Record<GlyphKind, GlyphShape>> = {
  space: 'triangle',
  ground: 'square',
  leader: 'diamond',
};

/**
 * R-3 glyph of a force (SWR-009 K-4, plan §1.3): fleet = triangle, ground = square, leader = diamond with an amber
 * contour; Empire filled red, Rebels outlined phosphor. The same descriptor feeds the DOM and Konva.
 */
export function forceGlyphSpec(owner: FactionId, kind: GlyphKind): ForceGlyphSpec {
  const color = rebellionPalette.faction[owner];
  return {
    shape: SHAPE[kind],
    filled: owner === 'empire',
    color,
    stroke: kind === 'leader' ? terminalTokens.color.amber : color,
  };
}
