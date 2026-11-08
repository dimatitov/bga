import type { GameAssets } from '@bga/platform';
import { forbiddenStarsCoverSvg } from './cover';

export { forbiddenStarsCoverSvg } from './cover';

/** Game Assets of Forbidden Stars (`@bga/game-forbidden-stars/assets`): original graphics only. */
export const forbiddenStarsAssets = {
  cover: { svg: forbiddenStarsCoverSvg, width: 640, height: 360 },
  accentColor: '#B83A5E',
} as const satisfies GameAssets;
