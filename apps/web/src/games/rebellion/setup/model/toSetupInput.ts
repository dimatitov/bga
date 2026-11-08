import { REBELLION_GAME_ID } from '@bga/game-rebellion/definition';
import {
  type RebellionSetupInput,
  RebellionSetupInputSchema,
  unsupportedSetupFields,
} from '@bga/game-rebellion/schema';
import type { SetupFormValues } from './setupForm';

/**
 * Form → `setup` of `POST /api/sessions` (`RebellionSetupInput`, SWR-004 plan-frontend §2.4). Pure.
 * Difficulty only for AI — a human opponent omits the field (the server stores `null`). `ruleset`/`gameMode`
 * are always sent (Q-7). NEVER `opponentFaction`/`aiFaction`: the server derives the opponent side.
 */
export function toSetupInput(v: SetupFormValues): RebellionSetupInput {
  return {
    playerFaction: v.playerFaction,
    opponentType: v.opponentType,
    ...(v.opponentType === 'ai' ? { aiDifficulty: v.aiDifficulty } : {}),
    ruleset: v.ruleset,
    gameMode: v.gameMode,
  };
}

/**
 * Whole request body (TR-12, TC-U-03/TC-C-07). The web app sends it through the platform
 * (`useCreateSession(gameId).submit(setup)` adds `gameId`); this mirrors that body for tests and docs.
 */
export function toCreateSessionRequest(v: SetupFormValues): {
  gameId: typeof REBELLION_GAME_ID;
  setup: RebellionSetupInput;
} {
  return { gameId: REBELLION_GAME_ID, setup: toSetupInput(v) };
}

export type SetupValidation =
  | { ok: true; setup: RebellionSetupInput }
  | { ok: false; reason: 'invalid' | 'rulesetUnavailable' | 'modeUnavailable' };

/**
 * Client-side second line of defence (AC-05; the UI already disables unavailable options): the game's Zod
 * schema + the package's "available now" lists. Ruleset is reported first (Q-8).
 */
export function validateSetup(v: SetupFormValues): SetupValidation {
  const parsed = RebellionSetupInputSchema.safeParse(toSetupInput(v));
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const [unsupported] = unsupportedSetupFields(parsed.data);
  if (unsupported === 'ruleset') return { ok: false, reason: 'rulesetUnavailable' };
  if (unsupported === 'gameMode') return { ok: false, reason: 'modeUnavailable' };
  return { ok: true, setup: parsed.data };
}
