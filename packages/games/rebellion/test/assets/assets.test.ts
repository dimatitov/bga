import { GameAssetsSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { rebellionAssets, rebellionCoverSvg, rebellionVisualTokens } from '../../src/assets';

describe('@bga/game-rebellion/assets', () => {
  it('matches the platform GameAssets shape', () => {
    expect(GameAssetsSchema.safeParse(rebellionAssets).success).toBe(true);
    expect(rebellionAssets.cover.svg).toBe(rebellionCoverSvg);
  });

  it('cover is an original, self-contained 16:9 SVG (geometry only, ≤ 4 KB)', () => {
    const svg = rebellionCoverSvg;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 640 360"');
    expect(new TextEncoder().encode(svg).length).toBeLessThanOrEqual(4096);
    for (const forbidden of [
      '<script',
      'href="http',
      'xlink:href="http',
      'url(http',
      '<image',
      '<text',
      '<foreignObject',
      '@font-face',
    ]) {
      expect(svg).not.toContain(forbidden);
    }
  });

  it('visual tokens have every faction and board colour', () => {
    expect(Object.keys(rebellionVisualTokens.faction).sort()).toEqual(['empire', 'rebels']);
    expect(Object.keys(rebellionVisualTokens.board).sort()).toEqual(
      [
        'background',
        'invalidTarget',
        'label',
        'legalTarget',
        'link',
        'selected',
        'star',
        'systemFill',
        'systemStroke',
      ].sort(),
    );
  });
});
