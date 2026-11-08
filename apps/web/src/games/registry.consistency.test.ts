/**
 * Q-25: the web and the server registries describe the same games — same set of `gameId`s, same order and
 * identical definitions. The only web file allowed to read api sources (ESLint B-16), and only the
 * definitions list (no server modules).
 */
import { GameDefinitionSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { GAME_DEFINITIONS } from '../../../api/src/game-registry/definitions';
import { gameRegistry } from './registry';

describe('web ↔ server game registry consistency (Q-25)', () => {
  const web = gameRegistry.map((entry) => entry.definition);

  it('the same gameIds in the same (catalogue) order', () => {
    expect(web.map((d) => d.id)).toEqual(GAME_DEFINITIONS.map((d) => d.id));
  });

  it('identical, valid definitions', () => {
    expect(web).toEqual([...GAME_DEFINITIONS]);
    for (const definition of web) GameDefinitionSchema.parse(definition);
  });
});
