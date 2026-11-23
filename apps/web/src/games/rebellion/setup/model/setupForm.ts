import {
  type AIDifficulty,
  type FactionId,
  type GameMode,
  type GameRuleset,
  isSupportedGameModeFor,
  type OpponentType,
  REBELLION_SETUP_DEFAULTS,
} from '@bga/game-rebellion/schema';

/**
 * State of the Rebellion new-game form (SWR-004 plan-frontend §2.3). Pure TS, no React.
 * `aiDifficulty` is kept while the opponent is human, so switching back to AI restores the last difficulty
 * chosen on this screen (Q-19); it is not sent for a human opponent (`toSetupInput`).
 */
export interface SetupFormValues {
  playerFaction: FactionId;
  opponentType: OpponentType;
  aiDifficulty: AIDifficulty;
  ruleset: GameRuleset;
  gameMode: GameMode;
}

/**
 * PO defaults (AC-02): Rebels, AI, Normal, Base, Digital — re-export of the package's frozen
 * `REBELLION_SETUP_DEFAULTS` (AM-FE-6). The form copies it on every mount (D-SW4-2), never mutates it.
 */
export const DEFAULT_SETUP: Readonly<SetupFormValues> = REBELLION_SETUP_DEFAULTS;

/** A fresh, mutable copy of the defaults for one opening of the form. */
export function initialSetupForm(): SetupFormValues {
  return { ...DEFAULT_SETUP };
}

/**
 * Opponent change (SWR-010 §7, AC-22): a mode that is not available for the new opponent (`physical_companion`
 * with a second player) falls back to `digital`; `modeReset` tells the screen to announce it (no form error).
 */
export function withOpponentType(
  form: SetupFormValues,
  opponentType: OpponentType,
): { form: SetupFormValues; modeReset: boolean } {
  if (form.opponentType === opponentType) return { form, modeReset: false };
  const modeReset = !isSupportedGameModeFor(form.gameMode, opponentType);
  return {
    form: { ...form, opponentType, ...(modeReset ? { gameMode: 'digital' as const } : {}) },
    modeReset,
  };
}
