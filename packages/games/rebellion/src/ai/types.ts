/**
 * Types of the Rebellion bot (SWR-006 plan-backend §4.1). Pure data shapes; nothing here touches a game state:
 * the bot only ever sees the `CorePlayerView` of its own side.
 */
import type {
  ActivateSystemCommand,
  CorePlayerView,
  Difficulty,
  Faction,
  FinishActivationCommand,
  MovePiecesCommand,
  PassCommand,
} from '../schema';
import type { BaseIntel } from './intel';
import type { ViewModel } from './view-model';

/** Commands the bot can produce (never `ACCEPT_HANDOFF`: AI games have no handoff). */
export type BotCommand =
  ActivateSystemCommand | MovePiecesCommand | FinishActivationCommand | PassCommand;

export type BotKind = 'activate' | 'move' | 'finish' | 'pass';

/**
 * How a `MOVE_PIECES` subset was built (plan-backend §4.2). Several variants may produce the same set of
 * pieces; the candidate keeps all of them (sorted) so policies can score by intent.
 */
export type MoveVariant = 'all-fit' | 'ground-strike' | 'ships-only' | 'one-carrier' | 'spare-load';

export interface BotCandidate {
  /**
   * Canonical key (deterministic sort / dedup): `A|<leader>|<system>`, `M|<from>><to>|<id,id,…>` (ids sorted),
   * `F`, `P`. Internal only: it never reaches a prompt (candidate ids are opaque `c1..c10`, D-PO-2).
   */
  readonly key: string;
  readonly kind: BotKind;
  readonly command: BotCommand;
  /** Activation target / move destination (from the actor's own view); `null` for FINISH / PASS. */
  readonly systemId: string | null;
  /** Only for `move`: every variant that produced this subset (sorted, unique). */
  readonly variants?: readonly MoveVariant[];
}

export interface ScoredCandidate extends BotCandidate {
  readonly score: number;
}

/** One candidate as the decision point shows it (structurally `AutomationCandidate` of `@bga/platform`). */
export interface BotDecisionCandidate {
  id: string;
  type: string;
  target?: string;
  summary: string;
}

/**
 * Structurally equal to `AutomationDecisionPoint` of `@bga/platform` (D-PO-1: + `situation`). `src/ai` never
 * imports the platform (TC-AI-14); the server module validates the point with the platform schema anyway.
 */
export interface BotDecisionPoint {
  actor: Faction;
  phase: string;
  objective: string;
  situation: string;
  candidates: BotDecisionCandidate[];
  fallbackCandidateId: string;
  policyId: string;
}

export interface BotDecision {
  point: BotDecisionPoint;
  /** Candidate id → the concrete command (the server applies it through the engine with origin 'auto'). */
  commands: ReadonlyMap<string, BotCommand>;
}

/** Everything a scoring policy may use: the actor's own view and values derived from it, nothing else. */
export interface PolicyContext {
  readonly view: CorePlayerView;
  readonly model: ViewModel;
  readonly difficulty: Difficulty;
  /** Seeded generator (`seededRandom(seed)`); the only source of randomness. */
  readonly rng: () => number;
  /** Empire only (`deriveBaseIntel`); `null` for the Rebels. */
  readonly intel: BaseIntel | null;
}

/** Scores in the order of `candidates`; higher is better. Must be deterministic for a given context. */
export type ScorePolicy = (candidates: readonly BotCandidate[], ctx: PolicyContext) => number[];
