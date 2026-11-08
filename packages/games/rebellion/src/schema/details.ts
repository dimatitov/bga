import { z } from 'zod';
import {
  AIDifficultySchema,
  FactionIdSchema,
  GameModeSchema,
  GameRulesetSchema,
  OpponentTypeSchema,
  PhaseSchema,
  RulesEngineSchema,
} from './enums';

/**
 * `SessionSummary.details` of a Rebellion session (SWR-004, Q-20): flat public settings + progress.
 * `aiDifficulty` is `null` for a human opponent. Never anything about hidden objects or the rebel base.
 * SWR-005 (AM-BE-8, AM-FE-7): + `rulesEngine`; `winner` (`null` until the game is over, always `null` for
 * mock-v1); `reputation` (`null` for mock-v1). `round` is the time marker in core-v1.
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
  rulesEngine: RulesEngineSchema,
  winner: FactionIdSchema.nullable(),
  reputation: z.int().positive().nullable(),
});
export type RebellionSessionDetails = z.infer<typeof RebellionSessionDetailsSchema>;
