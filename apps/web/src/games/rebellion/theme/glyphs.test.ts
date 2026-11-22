import { FactionIdSchema } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { forceGlyphSpec, type GlyphKind } from './glyphs';
import { rebellionPalette } from './palette';

const KINDS: GlyphKind[] = ['space', 'ground', 'leader'];

describe('forceGlyphSpec (SWR-009 R-3, TC-TK-10)', () => {
  it('Empire fleet = filled triangle, Rebel fleet = outlined triangle, ground = square, leader = amber diamond', () => {
    expect(forceGlyphSpec('empire', 'space')).toEqual({
      shape: 'triangle',
      filled: true,
      color: rebellionPalette.faction.empire,
      stroke: rebellionPalette.faction.empire,
    });
    expect(forceGlyphSpec('rebels', 'space')).toMatchObject({ shape: 'triangle', filled: false });
    expect(forceGlyphSpec('empire', 'ground')).toMatchObject({ shape: 'square', filled: true });
    expect(forceGlyphSpec('rebels', 'ground')).toMatchObject({ shape: 'square', filled: false });
    for (const owner of FactionIdSchema.options) {
      expect(forceGlyphSpec(owner, 'leader')).toMatchObject({
        shape: 'diamond',
        stroke: terminalTokens.color.amber,
      });
    }
  });

  it('faction colours are the visual tokens (Empire red, Rebels phosphor)', () => {
    expect(forceGlyphSpec('empire', 'space').color).toBe('#DD6B59');
    expect(forceGlyphSpec('rebels', 'ground').color).toBe('#91DFA1');
  });

  it('every combination side × kind is distinguishable WITHOUT colour (R-2)', () => {
    const specs = FactionIdSchema.options.flatMap((owner) =>
      KINDS.map((kind) => {
        const { shape, filled } = forceGlyphSpec(owner, kind);
        return `${shape}:${filled}`;
      }),
    );
    expect(specs).toHaveLength(6);
    expect(new Set(specs).size).toBe(6);
  });
});
