import { z } from 'zod';
import {
  AIDifficultySchema,
  FactionIdSchema,
  GameModeSchema,
  GameRulesetSchema,
  OpponentTypeSchema,
  type GameMode,
  type GameRuleset,
} from './enums';
import { opponentOf } from './factions';
import { RebellionSettingsSchema, type RebellionSettings } from './settings';

/**
 * Client input of `POST /api/sessions` (`setup`), SWR-004. Strict: extra fields (`aiFaction`,
 * `opponentFaction`, legacy `humanFaction`/`opponent`) → 400. `ruleset` and `gameMode` are required (Q-7).
 * `aiDifficulty`: optional for AI (default 'normal'), `null` only for a human opponent (Q-6);
 * a human opponent with a difficulty → issue at `['aiDifficulty']`.
 * Values of the right type but not available yet (`rise-of-the-empire`, `physical_companion`) pass
 * the schema; `unsupportedSetupFields` reports them (→ 422 SETUP_UNSUPPORTED).
 */
export const RebellionSetupInputSchema = z
  .strictObject({
    playerFaction: FactionIdSchema,
    opponentType: OpponentTypeSchema,
    aiDifficulty: AIDifficultySchema.nullable().optional(),
    ruleset: GameRulesetSchema,
    gameMode: GameModeSchema,
  })
  .superRefine((value, ctx) => {
    if (value.opponentType === 'ai' && value.aiDifficulty === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['aiDifficulty'],
        message: 'aiDifficulty cannot be null for an AI opponent',
      });
    }
    if (
      value.opponentType === 'human' &&
      value.aiDifficulty !== undefined &&
      value.aiDifficulty !== null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['aiDifficulty'],
        message: 'aiDifficulty must be absent or null for a human opponent',
      });
    }
  });
export type RebellionSetupInput = z.infer<typeof RebellionSetupInputSchema>;

/** Defaults of the new-game form (AC-02, AM-FE-6). Frozen: every form opening starts from it. */
export const REBELLION_SETUP_DEFAULTS = Object.freeze({
  playerFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
} as const satisfies RebellionSetupInput);

/** Rulesets / modes that can be played now; the others are rejected with 422 SETUP_UNSUPPORTED. */
export const SUPPORTED_RULESETS = Object.freeze(['base'] as const satisfies readonly GameRuleset[]);
export const SUPPORTED_GAME_MODES = Object.freeze([
  'digital',
] as const satisfies readonly GameMode[]);

export function isSupportedRuleset(ruleset: GameRuleset): boolean {
  return (SUPPORTED_RULESETS as readonly GameRuleset[]).includes(ruleset);
}

export function isSupportedGameMode(mode: GameMode): boolean {
  return (SUPPORTED_GAME_MODES as readonly GameMode[]).includes(mode);
}

export type UnsupportedSetupField = 'ruleset' | 'gameMode';

/** Fields of a schema-valid input that are not available yet, in check order (Q-8: ruleset first). */
export function unsupportedSetupFields(
  input: Pick<RebellionSetupInput, 'ruleset' | 'gameMode'>,
): UnsupportedSetupField[] {
  const fields: UnsupportedSetupField[] = [];
  if (!isSupportedRuleset(input.ruleset)) fields.push('ruleset');
  if (!isSupportedGameMode(input.gameMode)) fields.push('gameMode');
  return fields;
}

/**
 * Schema-valid input → settings: the server derives `opponentFaction = opponentOf(playerFaction)`;
 * AI difficulty defaults to 'normal', a human opponent stores `null`.
 */
export function settingsFromSetupInput(input: RebellionSetupInput): RebellionSettings {
  return RebellionSettingsSchema.parse({
    playerFaction: input.playerFaction,
    opponentFaction: opponentOf(input.playerFaction),
    opponentType: input.opponentType,
    aiDifficulty:
      input.opponentType === 'ai'
        ? (input.aiDifficulty ?? REBELLION_SETUP_DEFAULTS.aiDifficulty)
        : null,
    ruleset: input.ruleset,
    gameMode: input.gameMode,
  });
}
