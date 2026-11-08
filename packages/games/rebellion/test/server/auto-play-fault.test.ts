/**
 * TC-AI-12 / Q-27 at the module level: a policy without a move makes the module THROW (the session service
 * turns that into 500 and writes nothing) — for the player's command and for the creation of an AI game.
 * The policy is replaced through the module system, exactly as an API test could do it.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as AiModule from '../../src/ai';
import { createCoreGame } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import { toStoredSetup } from '../../src/schema';
import { rebellionServerModule } from '../../src/server';
import { EMPIRE_VS_AI, NOW, REBELS_VS_AI } from './core-script';

vi.mock('../../src/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AiModule>()),
  chooseAutoCommand: () => null,
}));

describe('auto-play fault → the module throws (500, nothing written)', () => {
  it('player command in an AI game: throws without state data; input not mutated', () => {
    const state = createCoreGame(REBELS_VS_AI, coreDataBaseV1, { gameId: 'fault-1', now: NOW });
    const frozen = JSON.stringify(state);
    expect(() =>
      rebellionServerModule.applyCommand(
        state,
        { actor: 'rebels', expectedVersion: 1, command: { type: 'PASS' } },
        { now: NOW },
      ),
    ).toThrow('auto-play: the AI policy returned no move');
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('creation of an AI-Rebels game throws; a game the AI does not start in is unaffected', () => {
    const ctx = { sessionId: 'fault-2', now: NOW };
    expect(() =>
      rebellionServerModule.createInitialState(toStoredSetup(EMPIRE_VS_AI), ctx),
    ).toThrow('auto-play: the AI policy returned no move');
    expect(() =>
      rebellionServerModule.createInitialState(toStoredSetup(REBELS_VS_AI), ctx),
    ).not.toThrow();
  });
});
