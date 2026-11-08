import type { GameAssets } from '@bga/platform';
import { rebellionCoverSvg } from './cover';
import { rebellionVisualTokens, type RebellionVisualTokens } from './tokens';

export { rebellionCoverSvg } from './cover';
export { rebellionVisualTokens, type AssetFactionId, type RebellionVisualTokens } from './tokens';
export { factions, type FactionVisual } from './factions';
export { empireEmblemSvg, factionEmblems, rebelsEmblemSvg } from './emblems';

/** Game Assets of Rebellion (`@bga/game-rebellion/assets`): original graphics only. */
export const rebellionAssets = {
  cover: { svg: rebellionCoverSvg, width: 640, height: 360 },
  accentColor: '#F5A524',
  visualTokens: rebellionVisualTokens,
} as const satisfies GameAssets & { visualTokens: RebellionVisualTokens };
