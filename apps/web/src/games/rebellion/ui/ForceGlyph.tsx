import type { FactionId } from '@bga/game-rebellion/schema';
import { UnitGlyph } from '@/shared/ui';
import { forceGlyphSpec, type GlyphKind } from '../theme/glyphs';

export interface ForceGlyphProps {
  owner: FactionId;
  kind: GlyphKind;
  /** Pixel size (default 14). */
  size?: number;
  /** Dashed outline (single-unit move handle). */
  dashed?: boolean;
}

/**
 * DOM glyph of a Rebellion force (SWR-009 R-3): `forceGlyphSpec` → shared `UnitGlyph`. Decorative (`aria-hidden`);
 * `data-owner` / `data-kind` for tests. Konva draws the same spec on the map.
 */
export function ForceGlyph({ owner, kind, size, dashed }: ForceGlyphProps) {
  const spec = forceGlyphSpec(owner, kind);
  return (
    <span data-owner={owner} data-kind={kind} style={{ display: 'inline-flex', flex: 'none' }}>
      <UnitGlyph {...spec} size={size} dashed={dashed} />
    </span>
  );
}
