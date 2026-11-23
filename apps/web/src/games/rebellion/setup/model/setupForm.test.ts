import { REBELLION_GAME_ID } from '@bga/game-rebellion/definition';
import {
  type AIDifficulty,
  type FactionId,
  RebellionSetupInputSchema,
} from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETUP,
  initialSetupForm,
  type SetupFormValues,
  withOpponentType,
} from './setupForm';
import { toCreateSessionRequest, toSetupInput, validateSetup } from './toSetupInput';

const FACTIONS: FactionId[] = ['rebels', 'empire'];
const DIFFICULTIES: AIDifficulty[] = ['easy', 'normal', 'hard'];
const FORBIDDEN = ['aiFaction', 'opponentFaction', 'humanFaction', 'opponent'];

describe('setup form model (TC-U-03, TC-C-07, TR-12)', () => {
  it('DEFAULT_SETUP = PO defaults (AC-02) and is frozen; each opening gets its own copy', () => {
    expect(DEFAULT_SETUP).toEqual({
      playerFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect(Object.isFrozen(DEFAULT_SETUP)).toBe(true);
    const a = initialSetupForm();
    a.playerFaction = 'empire';
    expect(initialSetupForm()).toEqual(DEFAULT_SETUP);
    expect(a).not.toBe(DEFAULT_SETUP);
  });

  it.each(FACTIONS.flatMap((f) => DIFFICULTIES.map((d) => [f, d] as const)))(
    'AI: %s / %s → full body with difficulty, valid for the game schema',
    (playerFaction, aiDifficulty) => {
      const form: SetupFormValues = { ...DEFAULT_SETUP, playerFaction, aiDifficulty };
      const body = toCreateSessionRequest(form);
      expect(body).toEqual({
        gameId: REBELLION_GAME_ID,
        setup: {
          playerFaction,
          opponentType: 'ai',
          aiDifficulty,
          ruleset: 'base',
          gameMode: 'digital',
        },
      });
      expect(RebellionSetupInputSchema.safeParse(body.setup).success).toBe(true);
      for (const k of FORBIDDEN) expect(body.setup).not.toHaveProperty(k);
    },
  );

  it.each(FACTIONS.flatMap((f) => DIFFICULTIES.map((d) => [f, d] as const)))(
    'human: %s (remembered difficulty %s) → no aiDifficulty at all',
    (playerFaction, aiDifficulty) => {
      const setup = toSetupInput({
        ...DEFAULT_SETUP,
        playerFaction,
        opponentType: 'human',
        aiDifficulty,
      });
      expect(setup).toEqual({
        playerFaction,
        opponentType: 'human',
        ruleset: 'base',
        gameMode: 'digital',
      });
      expect(setup).not.toHaveProperty('aiDifficulty');
      for (const k of FORBIDDEN) expect(setup).not.toHaveProperty(k);
      expect(RebellionSetupInputSchema.safeParse(setup).success).toBe(true);
    },
  );

  it('validateSetup: defaults ok; unavailable ruleset/mode rejected (ruleset first, Q-8); garbage → invalid', () => {
    expect(validateSetup({ ...DEFAULT_SETUP })).toEqual({
      ok: true,
      setup: toSetupInput(DEFAULT_SETUP),
    });
    expect(validateSetup({ ...DEFAULT_SETUP, ruleset: 'rise-of-the-empire' })).toEqual({
      ok: false,
      reason: 'rulesetUnavailable',
    });
    // SWR-010 AC-22: physical_companion is available against AI (both sides), not with a second player.
    for (const playerFaction of FACTIONS) {
      const physicalAi: SetupFormValues = {
        ...DEFAULT_SETUP,
        playerFaction,
        gameMode: 'physical_companion',
      };
      expect(validateSetup(physicalAi)).toEqual({ ok: true, setup: toSetupInput(physicalAi) });
      expect(toSetupInput(physicalAi).gameMode).toBe('physical_companion');
      expect(validateSetup({ ...physicalAi, opponentType: 'human' })).toEqual({
        ok: false,
        reason: 'modeUnavailable',
      });
    }
    expect(
      validateSetup({
        ...DEFAULT_SETUP,
        ruleset: 'rise-of-the-empire',
        gameMode: 'physical_companion',
      }),
    ).toEqual({ ok: false, reason: 'rulesetUnavailable' });
    expect(
      validateSetup({ ...DEFAULT_SETUP, playerFaction: 'jedi' as unknown as FactionId }),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('withOpponentType (SWR-010 §7): human resets physical_companion → digital (announced); other changes keep the mode', () => {
    const physical: SetupFormValues = { ...DEFAULT_SETUP, gameMode: 'physical_companion' };
    expect(withOpponentType(physical, 'human')).toEqual({
      form: { ...physical, opponentType: 'human', gameMode: 'digital' },
      modeReset: true,
    });
    // Back to AI does not restore physical (explicit choice) and is not announced.
    const human = withOpponentType(physical, 'human').form;
    expect(withOpponentType(human, 'ai')).toEqual({
      form: { ...human, opponentType: 'ai' },
      modeReset: false,
    });
    // Digital is available for any opponent; same opponent → same object.
    expect(withOpponentType({ ...DEFAULT_SETUP }, 'human')).toEqual({
      form: { ...DEFAULT_SETUP, opponentType: 'human' },
      modeReset: false,
    });
    expect(withOpponentType(physical, 'ai').form).toBe(physical);
    // aiDifficulty is kept (Q-19).
    expect(withOpponentType({ ...physical, aiDifficulty: 'hard' }, 'human').form.aiDifficulty).toBe(
      'hard',
    );
  });
});
