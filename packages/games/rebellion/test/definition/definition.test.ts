import { GameDefinitionSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { REBELLION_GAME_ID, rebellionDefinition } from '../../src/definition';

describe('@bga/game-rebellion/definition', () => {
  it('is a valid GameDefinition', () => {
    expect(GameDefinitionSchema.parse(rebellionDefinition)).toEqual(rebellionDefinition);
  });

  it('is the available Rebellion game for 2 players with AI (spec assumptions)', () => {
    expect(rebellionDefinition.id).toBe(REBELLION_GAME_ID);
    expect(REBELLION_GAME_ID).toBe('star-wars-rebellion');
    expect(rebellionDefinition.status).toBe('available');
    expect(rebellionDefinition.supportedPlayers).toEqual([2]);
    expect(rebellionDefinition.supportsAI).toBe(true);
  });

  it('uses namespace-qualified i18n keys of the rebellion.meta namespace (Decisions R-1)', () => {
    expect(rebellionDefinition.descriptionKey).toBe('rebellion.meta:description');
    expect(rebellionDefinition.coverAltKey).toBe('rebellion.meta:coverAlt');
    expect('coverImage' in rebellionDefinition).toBe(false);
  });
});
