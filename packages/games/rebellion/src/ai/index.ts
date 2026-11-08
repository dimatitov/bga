/**
 * AI of Rebellion — server only, no OpenAI, never imported by web.
 * - Strategy Configuration (below) — DATA only; nothing executes it yet (the AI Commander arrives in stage F).
 * - `./auto-pass` — the deterministic automatic move of the `core-v1` slice (SWR-005 PO-3): pass.
 *
 * Invariant: difficulty never grants access to hidden information — the AI only ever receives its
 * own PlayerView (filtered on the server) and chooses among legal actions computed by the rules.
 */
import { z } from 'zod';
import { DifficultySchema } from '../schema';

export { AUTO_POLICY_ID, chooseAutoCommand, type AutoCommand, type AutoPolicy } from './auto-pass';

export const RebellionAiGoalSchema = z.enum([
  'locateRebelBase',
  'protectRebelBase',
  'expandControl',
  'preserveForces',
  'pressureObjectives',
]);
export type RebellionAiGoal = z.infer<typeof RebellionAiGoalSchema>;

export const AiDifficultyProfileSchema = z.strictObject({
  /** How many legal actions (computed by the rules) are short-listed for one decision step. */
  candidateActionLimit: z.int().min(1).max(50),
  /** 0 — always the best-rated action; 1 — uniform among the candidates. */
  exploration: z.number().min(0).max(1),
  /** Look-ahead depth over own moves (0 — greedy). */
  lookaheadDepth: z.int().min(0).max(2),
  /** Produce a human-readable explanation of a move (for the event log). */
  explainMoves: z.boolean(),
});
export type AiDifficultyProfile = z.infer<typeof AiDifficultyProfileSchema>;

export const FactionStrategySchema = z.strictObject({
  /** Goal weights 0..1; goals not listed for a faction are not used. */
  goalWeights: z.partialRecord(RebellionAiGoalSchema, z.number().min(0).max(1)),
});
export type FactionStrategy = z.infer<typeof FactionStrategySchema>;

export const RebellionAiStrategySchema = z.strictObject({
  configVersion: z.literal(1),
  /** Equals `REBELLION_SETUP_DEFAULTS.aiDifficulty` ('normal'); the session's own choice is `settings.aiDifficulty`. */
  defaultDifficulty: DifficultySchema,
  difficulties: z.strictObject({
    easy: AiDifficultyProfileSchema,
    normal: AiDifficultyProfileSchema,
    hard: AiDifficultyProfileSchema,
  }),
  factions: z.strictObject({
    empire: FactionStrategySchema,
    rebels: FactionStrategySchema,
  }),
});
export type RebellionAiStrategy = z.infer<typeof RebellionAiStrategySchema>;

/** Validated at module load: an invalid configuration fails fast. */
export const rebellionAiStrategy: RebellionAiStrategy = RebellionAiStrategySchema.parse({
  configVersion: 1,
  defaultDifficulty: 'normal',
  difficulties: {
    easy: { candidateActionLimit: 5, exploration: 0.6, lookaheadDepth: 0, explainMoves: true },
    normal: { candidateActionLimit: 10, exploration: 0.3, lookaheadDepth: 0, explainMoves: true },
    hard: { candidateActionLimit: 20, exploration: 0.1, lookaheadDepth: 1, explainMoves: true },
  },
  factions: {
    empire: { goalWeights: { locateRebelBase: 1, expandControl: 0.7, preserveForces: 0.4 } },
    rebels: {
      goalWeights: { protectRebelBase: 1, pressureObjectives: 0.6, preserveForces: 0.6 },
    },
  },
});
