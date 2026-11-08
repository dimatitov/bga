import type { GameDefinition } from '@bga/platform';

/** Stable game id. */
export const FORBIDDEN_STARS_GAME_ID = 'forbidden-stars';

/**
 * Catalogue data of Forbidden Stars — `coming_soon`: no rules, schemas, map or server module (AC-6).
 * The name is used nominatively; texts live in the web i18n namespace `forbidden-stars.meta`.
 */
export const forbiddenStarsDefinition: GameDefinition = {
  id: FORBIDDEN_STARS_GAME_ID,
  name: 'Forbidden Stars',
  descriptionKey: 'forbidden-stars.meta:description',
  coverAltKey: 'forbidden-stars.meta:coverAlt',
  status: 'coming_soon',
  supportedPlayers: [2, 3, 4],
  supportsAI: true,
};
