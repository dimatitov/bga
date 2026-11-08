import { z } from 'zod';
import {
  AIDifficultySchema,
  FactionIdSchema,
  GameModeSchema,
  GameRulesetSchema,
  OpponentTypeSchema,
} from './enums';
import { opponentOf } from './factions';

/**
 * Versions of Rebellion's stored data are separate (SWR-005, AM-BE-9): the stored setup (`Session.setup`)
 * did not change in SWR-005 and stays `2`; the state snapshot is `3` (`rulesEngine` union, BD-1).
 */
export const REBELLION_SETUP_SCHEMA_VERSION = 2;
export const REBELLION_STATE_SCHEMA_VERSION = 3;

const settingsShape = {
  playerFaction: FactionIdSchema,
  opponentFaction: FactionIdSchema,
  opponentType: OpponentTypeSchema,
  /** `null` exactly when the opponent is a human. */
  aiDifficulty: AIDifficultySchema.nullable(),
  ruleset: GameRulesetSchema,
  gameMode: GameModeSchema,
};

const SettingsObjectSchema = z.strictObject(settingsShape);

function checkSettings(value: z.infer<typeof SettingsObjectSchema>, ctx: z.RefinementCtx): void {
  if (value.opponentFaction !== opponentOf(value.playerFaction)) {
    ctx.addIssue({
      code: 'custom',
      path: ['opponentFaction'],
      message: 'opponentFaction must be the other side',
    });
  }
  if ((value.aiDifficulty === null) !== (value.opponentType === 'human')) {
    ctx.addIssue({
      code: 'custom',
      path: ['aiDifficulty'],
      message: 'aiDifficulty is null exactly when the opponent is human',
    });
  }
}

/** Settings of one Rebellion session (SWR-004 data model; public, Q-24). */
export const RebellionSettingsSchema = SettingsObjectSchema.superRefine(checkSettings);
export type RebellionSettings = z.infer<typeof RebellionSettingsSchema>;

/** Content of the `Session.setup` column (Q-16: `schemaVersion` lives in the settings too). */
export const StoredRebellionSetupSchema = z
  .strictObject({ schemaVersion: z.literal(REBELLION_SETUP_SCHEMA_VERSION), ...settingsShape })
  .superRefine(checkSettings);
export type StoredRebellionSetup = z.infer<typeof StoredRebellionSetupSchema>;

export function toStoredSetup(settings: RebellionSettings): StoredRebellionSetup {
  return StoredRebellionSetupSchema.parse({
    schemaVersion: REBELLION_SETUP_SCHEMA_VERSION,
    ...settings,
  });
}

export function settingsOfStoredSetup(stored: StoredRebellionSetup): RebellionSettings {
  const { schemaVersion: _version, ...settings } = stored;
  return RebellionSettingsSchema.parse(settings);
}
