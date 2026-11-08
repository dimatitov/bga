import type { GameDefinition } from '@bga/platform';
import { forbiddenStarsDefinition } from '@bga/game-forbidden-stars/definition';
import { rebellionDefinition } from '@bga/game-rebellion/definition';

/**
 * Every game of the catalogue, including `coming_soon` ones — used to tell 404 (unknown game) from
 * 422 (unavailable game). Order = catalogue order (Q-2). Imports only the `./definition` entry points of games: the web
 * registry consistency test (Q-25) reads this file.
 */
export const GAME_DEFINITIONS: readonly GameDefinition[] = [
  rebellionDefinition,
  forbiddenStarsDefinition,
];
