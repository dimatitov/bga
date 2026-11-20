import { z } from 'zod';
import type {
  ApplyCommandContext,
  ApplyCommandResult,
  SessionEventRecord,
} from './server-game-module';

/**
 * Game-agnostic automation contract (SWR-006, specification Contract §1 + D-PO-1/2/3, plan-backend §2).
 * A game that has an automated participant exposes `GameAutomation` through `ServerGameModule.automation`;
 * the server runs it step by step through the same command pipeline a human uses. The platform never
 * interprets game data: actors, phases, candidate types and texts are opaque strings.
 */

export const AUTOMATION_LIMITS = {
  maxCandidates: 10,
  idPattern: /^[a-z0-9-]{1,32}$/,
  typeMax: 64,
  targetMax: 64,
  summaryMax: 160,
  objectiveMax: 300,
  situationMax: 4000,
  actorMax: 64,
  phaseMax: 64,
  policyIdMax: 64,
} as const;

/** `policyId`, e.g. `'some-bot-v1:normal'`: lowercase, starts with a letter/digit, ≤ 64 chars. */
export const AUTOMATION_POLICY_ID_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

/** True when `text` has no control characters except `\n` (same predicate as the dev AI contract). */
function hasNoControlCharsExceptNewline(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c < 0x20 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f)) return false;
  }
  return true;
}

/** Non-empty text ≤ `max`, no control characters except `\n`. */
const text = (max: number) =>
  z.string().min(1).max(max).refine(hasNoControlCharsExceptNewline, {
    message: 'control characters are not allowed (except \\n)',
  });

const candidateId = z.string().regex(AUTOMATION_LIMITS.idPattern);

/** One concrete move offered to the automated participant (built by the game from the actor's view only). */
export const AutomationCandidateSchema = z.strictObject({
  /** Opaque id, unique in its decision point; carries no game data (D-PO-2). */
  id: candidateId,
  /** Command type of the game (opaque to the platform). */
  type: text(AUTOMATION_LIMITS.typeMax),
  target: text(AUTOMATION_LIMITS.targetMax).optional(),
  /** English, from the actor's view only (goes into the model prompt). */
  summary: text(AUTOMATION_LIMITS.summaryMax),
});
export type AutomationCandidate = z.infer<typeof AutomationCandidateSchema>;

/**
 * Everything a strategy may see at one automated step (Q-9: validated by the server before use; an
 * invalid decision point is a program error and is never sent to a model).
 */
export const AutomationDecisionPointSchema = z
  .strictObject({
    /** Opaque side of the automated participant. */
    actor: text(AUTOMATION_LIMITS.actorMax),
    phase: text(AUTOMATION_LIMITS.phaseMax),
    /** English, from the actor's view only. */
    objective: text(AUTOMATION_LIMITS.objectiveMax),
    /** D-PO-1: compact English description of the game from the actor's point of view only. */
    situation: text(AUTOMATION_LIMITS.situationMax),
    /** 1..10; order = the bot's ranking. */
    candidates: z.array(AutomationCandidateSchema).min(1).max(AUTOMATION_LIMITS.maxCandidates),
    /** The bot's choice; must be one of `candidates`. */
    fallbackCandidateId: candidateId,
    policyId: z.string().regex(AUTOMATION_POLICY_ID_PATTERN),
  })
  .superRefine((point, ctx) => {
    const ids = point.candidates.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['candidates'],
        message: 'candidate ids must be unique',
      });
    }
    if (!ids.includes(point.fallbackCandidateId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackCandidateId'],
        message: 'fallbackCandidateId must be one of the candidate ids',
      });
    }
  });
export type AutomationDecisionPoint = z.infer<typeof AutomationDecisionPointSchema>;

/**
 * Automation of one game, as seen by the game-independent server runner.
 * METHOD syntax on purpose (parameter bivariance, like `ServerGameModule`).
 */
export interface GameAutomation<
  State = unknown,
  Event extends SessionEventRecord = SessionEventRecord,
> {
  /**
   * AM-BE-1: whether this session has an automated participant at all (`strategy: null` otherwise, e.g. a
   * local multi-player session or a session of another engine). Pure.
   */
  isAutomated(state: State): boolean;
  /** The side whose automated move is expected, or null (not automated / a human's turn / game over). */
  pendingActor(state: State): string | null;
  /**
   * Built ONLY from the actor's own view; deterministic. Called only when `pendingActor(state) !== null`
   * (otherwise it throws).
   */
  decisionPoint(state: State): AutomationDecisionPoint;
  /**
   * candidateId → command → the game's full command pipeline (automatic origin,
   * expectedVersion = version(state)). Unknown id / not the actor's turn → `ok: false`.
   */
  applyCandidate(
    state: State,
    candidateId: string,
    ctx: ApplyCommandContext,
  ): ApplyCommandResult<State, Event>;
}

// ---- wire (the web client reads the same schemas) ----

/** Configured strategy of the automated participant. */
export const AutomationStrategyIdSchema = z.enum(['bot', 'openai']);
export type AutomationStrategyId = z.infer<typeof AutomationStrategyIdSchema>;

/**
 * Why an automation run stopped: `humanTurn` / `gameOver` after ≥ 1 step; `none` when no step was made;
 * `stepLimit` | `conflict` | `error` may leave `pending: true`.
 */
export const AutomationStopReasonSchema = z.enum([
  'humanTurn',
  'gameOver',
  'none',
  'stepLimit',
  'conflict',
  'error',
]);
export type AutomationStopReason = z.infer<typeof AutomationStopReasonSchema>;

/**
 * D-PO-3: why a step fell back to the bot. Codes are not secret. `AI_DEADLINE` exists only here (it is not an
 * AI-layer error code); any other failure is reported as `AI_PROVIDER_ERROR` (Q-23).
 */
export const AutomationFallbackCodeSchema = z.enum([
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_DECISION',
  'AI_NOT_CONFIGURED',
  'AI_BUDGET_EXCEEDED',
  'AI_DEADLINE',
]);
export type AutomationFallbackCode = z.infer<typeof AutomationFallbackCodeSchema>;

/** `SessionResponse.automation`: `strategy: null` — the session has no automated participant. */
export const SessionAutomationSchema = z.strictObject({
  pending: z.boolean(),
  strategy: AutomationStrategyIdSchema.nullable(),
});
export type SessionAutomation = z.infer<typeof SessionAutomationSchema>;

/**
 * `SessionCommandOk.automation`: aggregates only (no candidates, prompts, model reasons or budget sums).
 * `fallbackReasons` — unique codes in order of first appearance.
 */
export const AutomationRunSummarySchema = z
  .strictObject({
    steps: z.int().nonnegative(),
    pending: z.boolean(),
    strategy: AutomationStrategyIdSchema.nullable(),
    fallbacks: z.int().nonnegative(),
    fallbackReasons: z.array(AutomationFallbackCodeSchema),
    stopReason: AutomationStopReasonSchema,
  })
  .superRefine((summary, ctx) => {
    if (new Set(summary.fallbackReasons).size !== summary.fallbackReasons.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackReasons'],
        message: 'fallback reasons must be unique',
      });
    }
    if (summary.fallbacks < summary.fallbackReasons.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbacks'],
        message: 'fallbacks must be ≥ the number of fallback reasons',
      });
    }
    if (summary.fallbacks > summary.steps) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbacks'],
        message: 'fallbacks must be ≤ steps',
      });
    }
    if (summary.strategy === null && summary.steps !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: 'a session without a strategy makes no automated steps',
      });
    }
  });
export type AutomationRunSummary = z.infer<typeof AutomationRunSummarySchema>;

/** Body of `POST /api/sessions/:id/automation/run`: empty or `{}` (anything else → 400 VALIDATION, Q-10). */
export const RunAutomationRequestSchema = z.strictObject({});
export type RunAutomationRequest = z.infer<typeof RunAutomationRequestSchema>;
