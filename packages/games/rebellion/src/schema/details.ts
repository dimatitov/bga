import { z } from 'zod';
import {
  AIDifficultySchema,
  FactionIdSchema,
  GameModeSchema,
  GameRulesetSchema,
  OpponentTypeSchema,
  PhaseSchema,
} from './enums';

/**
 * `SessionSummary.details` of a Rebellion session (SWR-004, Q-20): flat public settings + progress.
 * `aiDifficulty` is `null` for a human opponent. Never anything about hidden objects or the rebel base.
 */
export const RebellionSessionDetailsSchema = z.strictObject({
  playerFaction: FactionIdSchema,
  opponentFaction: FactionIdSchema,
  opponentType: OpponentTypeSchema,
  aiDifficulty: AIDifficultySchema.nullable(),
  ruleset: GameRulesetSchema,
  gameMode: GameModeSchema,
  round: z.int().positive(),
  phase: PhaseSchema,
});
export type RebellionSessionDetails = z.infer<typeof RebellionSessionDetailsSchema>;
