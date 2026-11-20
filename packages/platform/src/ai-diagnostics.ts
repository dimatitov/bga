import { z } from 'zod';
import { AIProviderIdSchema } from './ai-dev';

/**
 * Dev-only AI decision diagnostics (SWR-008 AC-13, plan-backend §6):
 * `GET /api/dev/ai/sessions/:sessionId/decisions` → `AiSessionDecisionsResponseSchema`. The route exists only
 * outside production and answers only loopback clients. Strict schemas: never the budget key / session id, the
 * model's reason, prompt or rules text, the prompt upper bound or the pricing version. Rule ids are public.
 */

const count = z.int().nonnegative();

/** One `AiUsage` row (one model request of the session), as shown in the dev panel. */
export const AiDecisionDiagnosticSchema = z.strictObject({
  at: z.iso.datetime(),
  provider: AIProviderIdSchema,
  model: z.string().min(1).max(200),
  /** AiUsage status ('ok' | 'invalid_decision' | 'timeout' | ...); fallback = status !== 'ok'. */
  status: z.string().min(1).max(32),
  fallback: z.boolean(),
  errorCode: z.string().min(1).max(64).nullable(),
  attempts: count,
  inputTokens: count,
  cachedInputTokens: count,
  outputTokens: count,
  costMicroUsd: count,
  durationMs: count,
  rules: z.strictObject({
    enabled: z.boolean(),
    rulesVersion: z.string().max(96).nullable(),
    count,
    ids: z.array(z.string().min(1).max(128)).max(64),
    chars: count,
    tokensEstimate: count,
    truncated: z.boolean(),
    dropped: z.boolean(),
  }),
});
export type AiDecisionDiagnostic = z.infer<typeof AiDecisionDiagnosticSchema>;

/** Cost aggregate of a group of decisions (with rules / without rules / total). */
export const AiCostGroupSchema = z.strictObject({
  decisions: count,
  costMicroUsd: count,
  inputTokens: count,
  outputTokens: count,
  /** `null` for a group without decisions. */
  meanCostMicroUsd: z.number().nonnegative().nullable(),
});
export type AiCostGroup = z.infer<typeof AiCostGroupSchema>;

/** Last ≤ 50 decisions of the session (time ascending) + aggregates over ALL its decisions. */
export const AiSessionDecisionsResponseSchema = z.strictObject({
  decisions: z.array(AiDecisionDiagnosticSchema).max(50),
  totals: z.strictObject({
    withRules: AiCostGroupSchema,
    withoutRules: AiCostGroupSchema,
    total: AiCostGroupSchema,
  }),
});
export type AiSessionDecisionsResponse = z.infer<typeof AiSessionDecisionsResponseSchema>;
