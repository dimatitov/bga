import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type AssetFactionId,
  empireEmblemSvg,
  factionEmblems,
  factions,
  rebellionVisualTokens,
  rebelsEmblemSvg,
} from '../../src/assets';
import { FactionSchema, type FactionId } from '../../src/schema';

/** WCAG 2.x relative luminance of `#RRGGBB`. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const ids = FactionSchema.options as readonly FactionId[];
const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('@bga/game-rebellion/assets — factions registry', () => {
  it('AssetFactionId is exactly the schema FactionId (assets cannot import ./schema, ESLint B-3)', () => {
    expectTypeOf<AssetFactionId>().toEqualTypeOf<FactionId>();
  });

  it('has exactly one entry per FactionId, keyed by its own id', () => {
    expect(Object.keys(factions).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(factions[id].id).toBe(id);
  });

  it('uses namespace-qualified i18n keys', () => {
    for (const id of ids) {
      expect(factions[id].nameKey).toBe(`rebellion.common:faction.${id}`);
      expect(factions[id].shortNameKey).toBe(`rebellion.common:factionShort.${id}`);
      expect(factions[id].taglineKey).toBe(`rebellion.common:factionTagline.${id}`);
    }
  });

  it('colours match the visual tokens and are #RRGGBB', () => {
    for (const id of ids) {
      expect(factions[id].color).toBe(rebellionVisualTokens.faction[id]);
      expect(factions[id].color).toMatch(HEX);
      expect(factions[id].onColor).toMatch(HEX);
    }
  });

  it('onColor on color has WCAG contrast ≥ 4.5:1 (TC-U-33)', () => {
    for (const id of ids) {
      expect(contrast(factions[id].onColor, factions[id].color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('faction colour (emblem/stripe) on the dark board background is ≥ 3:1 (WCAG 1.4.11)', () => {
    for (const id of ids) {
      expect(
        contrast(factions[id].color, rebellionVisualTokens.board.background),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('is frozen (plain read-only data)', () => {
    expect(Object.isFrozen(factions)).toBe(true);
    for (const id of ids) expect(Object.isFrozen(factions[id])).toBe(true);
  });
});

describe('@bga/game-rebellion/assets — emblems', () => {
  it('each faction uses its own emblem', () => {
    expect(factions.rebels.emblemSvg).toBe(rebelsEmblemSvg);
    expect(factions.empire.emblemSvg).toBe(empireEmblemSvg);
    expect(rebelsEmblemSvg).not.toBe(empireEmblemSvg);
    for (const id of ids) expect(factionEmblems[id]).toBe(factions[id].emblemSvg);
  });

  it.each(ids)('%s emblem is a self-contained square SVG (geometry only, ≤ 1 KB)', (id) => {
    const svg = factions[id].emblemSvg;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 48 48"');
    expect(new TextEncoder().encode(svg).length).toBeLessThanOrEqual(1024);
    for (const forbidden of [
      '<script',
      'href=',
      'url(',
      '<image',
      '<text',
      '<foreignObject',
      '@font-face',
      '<style',
      ' on',
    ]) {
      expect(svg).not.toContain(forbidden);
    }
    expect(svg).toContain(factions[id].color);
  });

  it('rebels emblem is outlined, empire emblem is filled (map code «contour vs fill»)', () => {
    expect(rebelsEmblemSvg).toContain('fill="none"');
    expect(rebelsEmblemSvg).toContain(`stroke="${factions.rebels.color}"`);
    expect(empireEmblemSvg).not.toContain('fill="none"');
    expect(empireEmblemSvg).not.toContain('stroke=');
    expect(empireEmblemSvg).toContain(`fill="${factions.empire.color}"`);
  });
});
