import type { GameDefinition } from '@bga/platform';

/** Stable game id (stored in `Session.gameId`). */
export const REBELLION_GAME_ID = 'star-wars-rebellion';

/**
 * Catalogue data of Star Wars: Rebellion. The name is used nominatively (no logos or box art);
 * texts live in the web i18n namespace `rebellion.meta` (Decisions R-1).
 */
export const rebellionDefinition: GameDefinition = {
  id: REBELLION_GAME_ID,
  name: 'Star Wars: Rebellion',
  descriptionKey: 'rebellion.meta:description',
  coverAltKey: 'rebellion.meta:coverAlt',
  status: 'available',
  supportedPlayers: [2],
  supportsAI: true,
};
