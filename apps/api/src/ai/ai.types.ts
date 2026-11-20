/**
 * Internal contract of the AI layer (SWR-005B, plan-backend §3). Framework-free and game-agnostic (AM-BE-1):
 * the layer knows only an opaque `side` string, a phase, an objective and the list of legal actions computed by the
 * game rules. The model only CHOOSES one of those actions; nothing here executes anything.
 *
 * Wire-level shapes (`AIAction`, `AIUsage`, roles, provider ids) come from `@bga/platform` (one source of truth).
 */
import type { AIAction, AIModelRole, AIProviderId, AIUsage } from '@bga/platform';

export type { AIAction, AIModelRole, AIProviderId, AIUsage };

/**
 * A legal action as the AI layer sees it (SWR-006 plan-backend §8.1). `summary` (≤ 160 chars, English) is a short
 * human-readable description of the candidate, produced by the game from the acting side's view; sent only by the
 * `commander` prompt variant.
 */
export interface AIDecisionAction extends AIAction {
  readonly summary?: string;
}

/** Prompt variant: the SWR-005B dev endpoint (default, byte-identical prompt) or the in-game commander (SWR-006). */
export type AIDecisionPurpose = 'dev-test' | 'commander';

/** What the AI layer sees of a decision point. No game state, no session ids, no secrets. */
export interface AIDecisionContext {
  /** Budget key (`dev-diagnostics` for the dev endpoint, a session id later). Never sent to the model. */
  readonly budgetKey: string;
  readonly role: AIModelRole;
  /** Opaque side identifier of the acting player (AM-BE-1). */
  readonly side: string;
  readonly phase: string;
  readonly objective: string;
  /** 2..10 legal actions with unique ids (validated by the caller's DTO and again by the service). */
  readonly availableActions: readonly AIDecisionAction[];
  /** Prompt variant; absent = `'dev-test'` (SWR-005B dev endpoint, unchanged prompt). */
  readonly purpose?: AIDecisionPurpose;
  /** `commander` only: the position as the acting side sees it (≤ 4000 chars, English). Ignored for `dev-test`. */
  readonly situation?: string;
  /**
   * SWR-008 (C-9), `commander` only: the rules block SENT to the model. Absent → the prompt is byte-identical to
   * SWR-006. Set only by `fitCommanderPrompt`. Ignored for `dev-test`.
   */
  readonly rules?: AIRulesBlock;
  /** SWR-008 (C-9): never sent; written to `AiUsage` (AC-12). Absent → "rules off" columns. */
  readonly rulesAccounting?: AIRulesAccounting;
}

/** Rules block of a commander prompt (SWR-008 C-9): public rule lines `[<id>] ...`, one per id, in order. */
export interface AIRulesBlock {
  /** 1..12000 chars, one line per rule id (`RulesContextResult.text`). */
  readonly text: string;
  readonly ruleIds: readonly string[];
  readonly rulesVersion: string;
  /** Cut by the selector's `maxChars` or reduced by the prompt-size limit. */
  readonly truncated: boolean;
}

/** What `AiUsage` records about the rules of one request (SWR-008 C-9, AC-12, QD-9). Never sent to a model. */
export interface AIRulesAccounting {
  /** `AI_COMMANDER_RULES_CONTEXT=on`. */
  readonly enabled: boolean;
  /** `null`: off, or the game has no rules. */
  readonly rulesVersion: string | null;
  /** What was SENT (`[]` when dropped / empty / off). */
  readonly ruleIds: readonly string[];
  /** Length of the rules text sent. */
  readonly chars: number;
  /** Selector cut by `maxChars` OR reduced by the prompt-size limit. */
  readonly truncated: boolean;
  /** Removed entirely by the prompt-size limit (QD-9). */
  readonly dropped: boolean;
}

/**
 * A provider answer. `selectedActionId` / `reason` are what the model returned (shape-checked only); the service
 * always runs `validateDecision` (membership in `availableActions`, reason normalisation) before accepting it.
 */
export interface AIDecisionResult {
  selectedActionId: string;
  reason: string;
  provider: AIProviderId;
  /** Actual model snapshot (`response.model`) for OpenAI; `mock-deterministic-v1` for the mock. */
  model: string;
  /** Sum of the attempt durations (backoff sleeps excluded), ms. */
  durationMs: number;
  attempts: number;
  /** Summed over all attempts. */
  usage: AIUsage;
  /** Estimated cost, integer micro-USD (Q-15), summed over all attempts. */
  estimatedCostMicroUsd: number;
  /** `estimatedCostMicroUsd` in USD, 6 decimals. */
  estimatedCostUsd: number;
  pricingVersion: string;
}

export interface AIProvider {
  readonly id: AIProviderId;
  /** Resolves with a shape-checked decision or rejects with an `AiFailure` (never a raw SDK error). */
  makeDecision(ctx: AIDecisionContext): Promise<AIDecisionResult>;
}

/** One allow-listed log line (see ai-log.ts). */
export type AiLogSink = (line: string) => void;

/** Test-only scripted behaviour of the mock provider: one step per attempt, the last step repeats (plan §5.8). */
export type MockStep =
  'ok' | 'invalid-action' | 'malformed' | 'timeout' | 'rate-limit' | 'network' | 'server-error';

export const MOCK_STEPS: readonly MockStep[] = [
  'ok',
  'invalid-action',
  'malformed',
  'timeout',
  'rate-limit',
  'network',
  'server-error',
];

/**
 * Test-only overrides (plan §5.9). Set only from test code via `createApp({ ai })`; `createApp` throws for any of
 * them when `nodeEnv === 'production'` (W6). There is no request field or environment variable for them.
 */
export interface AiTestOverrides {
  /** Fake fetch handed to the real OpenAI SDK — the only way an enabled OpenAI config may run under `nodeEnv: 'test'`. */
  openaiFetch?: typeof fetch;
  mockScript?: readonly MockStep[];
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  monotonicNow?: () => number;
  logSink?: AiLogSink;
  devRateLimit?: { paidPerMinute: number; totalPerMinute: number };
}

/** Clock/random/sleep used by the retry loop and providers (injectable for tests). */
export interface AiRuntime {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  monotonicNow: () => number;
  logSink: AiLogSink;
}

export const DEFAULT_AI_RUNTIME: AiRuntime = Object.freeze({
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
  monotonicNow: () => performance.now(),
  logSink: () => undefined,
});

/** Runtime from defaults + test overrides. */
export function aiRuntime(overrides: AiTestOverrides = {}, logSink?: AiLogSink): AiRuntime {
  return {
    sleep: overrides.sleep ?? DEFAULT_AI_RUNTIME.sleep,
    random: overrides.random ?? DEFAULT_AI_RUNTIME.random,
    monotonicNow: overrides.monotonicNow ?? DEFAULT_AI_RUNTIME.monotonicNow,
    logSink: overrides.logSink ?? logSink ?? DEFAULT_AI_RUNTIME.logSink,
  };
}

/** Zero usage. */
export function emptyUsage(): AIUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: null,
    totalTokens: 0,
  };
}

/** Sum of two usages; `reasoningTokens` stays `null` only while both are `null`. */
export function addUsage(a: AIUsage, b: AIUsage): AIUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens:
      a.reasoningTokens === null && b.reasoningTokens === null
        ? null
        : (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
