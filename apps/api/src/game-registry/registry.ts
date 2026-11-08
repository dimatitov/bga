import type { ServerGameModule } from '@bga/platform';
import { rebellionServerModule } from '@bga/game-rebellion/server';

/**
 * Server modules of the playable games — the ONLY place where a game's server code is named.
 * A plain typed array with static imports (AC-9): no plugins, no loading by name.
 * Adding a game: one entry here + its definition in `./definitions.ts` (docs/architecture/adding-a-game.md).
 */
export const SERVER_GAME_MODULES: readonly ServerGameModule[] = [rebellionServerModule];
