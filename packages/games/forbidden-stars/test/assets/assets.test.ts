import { GameAssetsSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { forbiddenStarsAssets, forbiddenStarsCoverSvg } from '../../src/assets';

describe('@bga/game-forbidden-stars/assets', () => {
  it('matches the platform GameAssets shape', () => {
    expect(GameAssetsSchema.safeParse(forbiddenStarsAssets).success).toBe(true);
    expect(forbiddenStarsAssets.cover.svg).toBe(forbiddenStarsCoverSvg);
  });

  it('cover is an original, self-contained 16:9 SVG (geometry only, ≤ 4 KB)', () => {
    const svg = forbiddenStarsCoverSvg;
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
});
