/**
 * AI of Rebellion — server only, no OpenAI, never imported by web.
 * - Strategy Configuration (below) — DATA only; nothing executes it yet (the AI Commander arrives in stage F).
 * - `./auto-pass` — the deterministic automatic move of the `core-v1` slice (SWR-005 PO-3): pass (kept as a
 *   test / legacy policy, SWR-006 AM-BE-6).
 * - SWR-006 bot: `./decision` (`buildDecision`), `./candidates`, `./rank`, `./intel`, `./describe`,
 *   `./view-model`, `./random`, `./types`, the policies `./empire-policy`, `./rebel-policy` (weights
 *   `./profiles`) — pure, deterministic, input = the actor's own view only.
 *
 * Invariant: difficulty never grants access to hidden information — the AI only ever receives its
 * own PlayerView (filtered on the server) and chooses among legal actions computed by the rules.
 */
import { z } from 'zod';
import { DifficultySchema } from '../schema';

export { AUTO_POLICY_ID, chooseAutoCommand, type AutoCommand, type AutoPolicy } from './auto-pass';
// SWR-006: the deterministic bot (plan-backend §4). Input is only the actor's own CorePlayerView.
export type {
  BotCandidate,
  BotCommand,
  BotDecision,
  BotDecisionCandidate,
  BotDecisionPoint,
  BotKind,
  MoveVariant,
  PolicyContext,
  ScorePolicy,
  ScoredCandidate,
} from './types';
export { botSeed, gameCoin, hash32, seededRandom } from './random';
export {
  buildViewModel,
  type ForceSummary,
  type OwnActivation,
  type ViewModel,
} from './view-model';
export {
  HINT_WEIGHT,
  deriveBaseIntel,
  possibleBaseSystems,
  type BaseCandidateOptions,
  type BaseIntel,
} from './intel';
export {
  enumerateCandidates,
  isTerminating,
  moveSubsets,
  rebelSpareCapacity,
  sortByKey,
} from './candidates';
export {
  allowedCandidates,
  basePolicy,
  onePerSystem,
  policyContext,
  policyFor,
  rankCandidates,
  rankWith,
} from './rank';
// SWR-006 W6/W8: side × difficulty policies and their weights (DATA in `./profiles`).
export {
  EMPIRE_PROFILES,
  FINISH_DONE,
  FINISH_EARLY,
  REBEL_PROFILES,
  USEFUL_MOVE,
  finishScore,
  type EmpireProfile,
  type RebelProfile,
} from './profiles';
export { allowEmpire, empireKnowledge, scoreEmpire, type EmpireKnowledge } from './empire-policy';
export { allowRebels, rebelSituation, scoreRebels, type RebelSituation } from './rebel-policy';
export { DESCRIBE_LIMITS, clip, objectiveFor, situationFor, summaryFor } from './describe';
export {
  BOT_POLICY_ID,
  MAX_DECISION_CANDIDATES,
  buildDecision,
  selectTop,
  type BuildDecisionOptions,
} from './decision';

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
