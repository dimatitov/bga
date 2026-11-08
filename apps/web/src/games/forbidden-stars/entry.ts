import { forbiddenStarsAssets } from '@bga/game-forbidden-stars/assets';
import { forbiddenStarsDefinition } from '@bga/game-forbidden-stars/definition';
import type { WebGameEntry } from '@/games/types';
import { svgDataUrl } from '@/platform';

/** Forbidden Stars — `coming_soon`: definition + cover only, no screens (AC-6, Q-17). */
export const forbiddenStarsEntry: WebGameEntry = {
  definition: forbiddenStarsDefinition,
  cover: {
    src: svgDataUrl(forbiddenStarsAssets.cover.svg),
    accentColor: forbiddenStarsAssets.accentColor,
  },
  i18nPrefix: 'forbidden-stars',
};
