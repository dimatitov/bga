import { z } from 'zod';

/**
 * Dev-only AI diagnostics wire contract (SWR-005B, plan-backend §10, Clarification Q-FE-1): one source of truth for
 * `apps/api` (dev module) and `apps/web` (dev page). Game-agnostic (AM-BE-1): the platform knows only an opaque
 * `side` string; a game-specific scenario field is added by the consumer via `createAiTestDecisionRequestSchema`.
 * No dependency on the OpenAI SDK — these are plain contract shapes.
 */

/** The only budget key the dev endpoint accepts (AM-BE-6, A-3). */
export const AI_DEV_BUDGET_KEY = 'dev-diagnostics' as const;

/** Max length of `reason` returned by the server (trimmed and truncated, AM-BE-5). */
export const AI_REASON_MAX_LENGTH = 300;

/** Bounds of the dev scenario (plan-backend §10.2). */
export const AI_DEV_LIMITS = {
  minActions: 2,
  maxActions: 10,
  phaseMax: 64,
  objectiveMax: 500,
  actionFieldMax: 64,
  /** Max request body size in bytes (enforced by the API, not by Zod). */
  bodyMaxBytes: 8 * 1024,
} as const;

const MICRO_PER_USD = 1_000_000;

/** USD → integer micro-USD (Q-15). */
export function usdToMicroUsd(usd: number): number {
  return Math.round(usd * MICRO_PER_USD);
}

/** Integer micro-USD → USD rounded to 6 decimals (Q-15). */
export function microUsdToUsd(microUsd: number): number {
  return Math.round(microUsd) / MICRO_PER_USD;
}

export const AIModelRoleSchema = z.enum(['strategy', 'tactical']);
export type AIModelRole = z.infer<typeof AIModelRoleSchema>;

/** The provider that actually answered. */
export const AIProviderIdSchema = z.enum(['openai', 'mock']);
export type AIProviderId = z.infer<typeof AIProviderIdSchema>;

/** Provider requested by the client: `auto` resolves by configuration (`OPENAI_ENABLED`). */
export const AiRequestedProviderSchema = z.enum(['auto', 'mock']);
export type AiRequestedProvider = z.infer<typeof AiRequestedProviderSchema>;

/** Action id: `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$` (plan-backend §10.2). */
export const AI_ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

const shortText = (max: number) => z.string().trim().min(1).max(max);

/** True when `text` has no control characters except `\n`. */
function hasNoControlCharsExceptNewline(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c < 0x20 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f)) return false;
  }
  return true;
}

/** One legal action offered to the AI (computed by the game rules, never by the model). */
export const AIActionSchema = z.strictObject({
  id: z.string().regex(AI_ACTION_ID_PATTERN),
  type: shortText(AI_DEV_LIMITS.actionFieldMax),
  target: shortText(AI_DEV_LIMITS.actionFieldMax).optional(),
});
export type AIAction = z.infer<typeof AIActionSchema>;

/** 2..10 actions with unique ids. */
export const AIActionListSchema = z
  .array(AIActionSchema)
  .min(AI_DEV_LIMITS.minActions)
  .max(AI_DEV_LIMITS.maxActions)
  .refine((actions) => new Set(actions.map((a) => a.id)).size === actions.length, {
    message: 'action ids must be unique',
  });

/** Game-agnostic part of the dev scenario (phase, objective, legal actions). */
export const AiTestScenarioBaseSchema = z.strictObject({
  phase: shortText(AI_DEV_LIMITS.phaseMax),
  objective: shortText(AI_DEV_LIMITS.objectiveMax).refine(hasNoControlCharsExceptNewline, {
    message: 'control characters are not allowed (except \\n)',
  }),
  availableActions: AIActionListSchema,
});

/** Opaque side identifier (AM-BE-1): the platform does not know the game's sides. */
export const AiSideSchema = shortText(AI_DEV_LIMITS.actionFieldMax);

/**
 * Builds the strict `POST /api/dev/ai/test-decision` body schema with a consumer-supplied side field
 * (the dev module of a game passes e.g. its own enum under its own field name; plan-backend §10.2).
 */
export function createAiTestDecisionRequestSchema<const S extends z.ZodRawShape>(sideShape: S) {
  return z.strictObject({
    scenario: AiTestScenarioBaseSchema.extend(sideShape),
    role: AIModelRoleSchema.default('tactical'),
    provider: AiRequestedProviderSchema.default('auto'),
    budgetKey: z.literal(AI_DEV_BUDGET_KEY).default(AI_DEV_BUDGET_KEY),
  });
}

/** Generic request schema: scenario side is `side: string` (AM-BE-1). */
export const AiTestDecisionRequestSchema = createAiTestDecisionRequestSchema({
  side: AiSideSchema,
});
/** Parsed (defaults applied) request. */
export type AiTestDecisionRequest = z.output<typeof AiTestDecisionRequestSchema>;
/** Request as sent by a client (defaults optional). */
export type AiTestDecisionRequestInput = z.input<typeof AiTestDecisionRequestSchema>;

const tokenCount = z.number().int().nonnegative();

export const AIUsageSchema = z.strictObject({
  inputTokens: tokenCount,
  cachedInputTokens: tokenCount,
  outputTokens: tokenCount,
  reasoningTokens: tokenCount.nullable(),
  totalTokens: tokenCount,
});
export type AIUsage = z.infer<typeof AIUsageSchema>;

const usd = z.number().nonnegative().finite();
const microUsd = z.number().int().nonnegative();

/** AI decision as returned to the client (the id is already validated against the legal list). */
export const AIDecisionResultSchema = z.strictObject({
  selectedActionId: z.string().regex(AI_ACTION_ID_PATTERN),
  reason: z.string().min(1).max(AI_REASON_MAX_LENGTH),
  provider: AIProviderIdSchema,
  /** Actual model snapshot (`response.model`), `mock` model id for the mock provider. */
  model: z.string().min(1),
  /** Total over all attempts (Q-11..Q-13). */
  durationMs: z.number().int().nonnegative(),
  attempts: z.number().int().min(1),
  usage: AIUsageSchema,
  /** Estimate, rounded to 1e-6 USD (Q-15). */
  estimatedCostUsd: usd,
  /** The same estimate in integer micro-USD (Q-15). */
  estimatedCostMicroUsd: microUsd,
  pricingVersion: z.string().min(1),
});
export type AIDecisionResult = z.infer<typeof AIDecisionResultSchema>;

/** Budget snapshot; `limit*`/`remaining*` are `null` when OpenAI is disabled (AM-BE-9). */
export const AiBudgetSnapshotSchema = z.strictObject({
  budgetKey: z.literal(AI_DEV_BUDGET_KEY),
  spentUsd: usd,
  spentMicroUsd: microUsd,
  limitUsd: usd.nullable(),
  limitMicroUsd: microUsd.nullable(),
  remainingUsd: usd.nullable(),
  remainingMicroUsd: microUsd.nullable(),
});
export type AiBudgetSnapshot = z.infer<typeof AiBudgetSnapshotSchema>;

/** `id: null` — not configured (OpenAI off); `available: null` — not checked / unknown (AM-BE-9, W-2). */
export const AiDevModelStatusSchema = z.strictObject({
  id: z.string().min(1).nullable(),
  available: z.boolean().nullable(),
});
export type AiDevModelStatus = z.infer<typeof AiDevModelStatusSchema>;

/** `GET /api/dev/ai/status` → 200. Never carries the key, only the fact it is configured. */
export const AiDevStatusSchema = z.strictObject({
  openaiEnabled: z.boolean(),
  /** What `provider: 'auto'` resolves to. */
  provider: AIProviderIdSchema,
  keyConfigured: z.boolean(),
  models: z.strictObject({
    strategy: AiDevModelStatusSchema,
    tactical: AiDevModelStatusSchema,
  }),
  budget: AiBudgetSnapshotSchema,
});
export type AiDevStatus = z.infer<typeof AiDevStatusSchema>;

/** `POST /api/dev/ai/test-decision` → 200. */
export const AiTestDecisionResponseSchema = z.strictObject({
  decision: AIDecisionResultSchema,
  budget: AiBudgetSnapshotSchema,
});
export type AiTestDecisionResponse = z.infer<typeof AiTestDecisionResponseSchema>;
