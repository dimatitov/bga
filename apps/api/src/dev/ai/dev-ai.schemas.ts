/**
 * Wire schemas of the dev AI diagnostics (SWR-005B, plan-backend §10; spec «Decisions during IMPLEMENTATION» W2).
 * The platform request schema is game-agnostic; the dev scenario's side field `faction` (test data of the
 * diagnostics, not game rules — AM-BE-1) is declared here via the platform factory and mapped to the AI layer's
 * opaque `side`. Responses are re-parsed with the strict platform schemas before they leave the server.
 */
import {
  AI_DEV_BUDGET_KEY,
  AiDevStatusSchema,
  AiTestDecisionResponseSchema,
  createAiTestDecisionRequestSchema,
  microUsdToUsd,
  type AiBudgetSnapshot,
  type AiDevStatus,
  type AiTestDecisionResponse,
} from '@bga/platform';
import { z } from 'zod';
import type { AiDecisionOutcome } from '../../ai/ai-decision.service';
import type { AiStatus } from '../../ai/ai-status.service';
import type { AIDecisionContext } from '../../ai/ai.types';
import type { BudgetSnapshot } from '../../ai/budget.service';

/** Sides of the dev test scenario (test data, A-1). */
export const DevAiFactionSchema = z.enum(['rebels', 'empire']);

/** Strict `POST /api/dev/ai/test-decision` body (unknown fields → 400; `budgetKey` only `dev-diagnostics`). */
export const DevAiTestDecisionRequestSchema = createAiTestDecisionRequestSchema({
  faction: DevAiFactionSchema,
});
export type DevAiTestDecisionRequest = z.output<typeof DevAiTestDecisionRequestSchema>;

/** Wire request → AI layer context (`faction` → opaque `side`). */
export function toDecisionContext(body: DevAiTestDecisionRequest): AIDecisionContext {
  const { scenario } = body;
  return {
    budgetKey: body.budgetKey,
    role: body.role,
    side: scenario.faction,
    phase: scenario.phase,
    objective: scenario.objective,
    availableActions: scenario.availableActions.map((a) =>
      a.target === undefined
        ? { id: a.id, type: a.type }
        : { id: a.id, type: a.type, target: a.target },
    ),
  };
}

export function toWireBudget(b: BudgetSnapshot): AiBudgetSnapshot {
  return {
    budgetKey: AI_DEV_BUDGET_KEY,
    spentUsd: microUsdToUsd(b.spentMicroUsd),
    spentMicroUsd: b.spentMicroUsd,
    limitUsd: b.limitMicroUsd === null ? null : microUsdToUsd(b.limitMicroUsd),
    limitMicroUsd: b.limitMicroUsd,
    remainingUsd: b.remainingMicroUsd === null ? null : microUsdToUsd(b.remainingMicroUsd),
    remainingMicroUsd: b.remainingMicroUsd,
  };
}

export function toWireStatus(s: AiStatus): AiDevStatus {
  return AiDevStatusSchema.parse({
    openaiEnabled: s.openaiEnabled,
    provider: s.provider,
    keyConfigured: s.keyConfigured,
    models: s.models,
    budget: toWireBudget(s.budget),
  });
}

export function toWireDecision(o: AiDecisionOutcome): AiTestDecisionResponse {
  const d = o.decision;
  return AiTestDecisionResponseSchema.parse({
    decision: {
      selectedActionId: d.selectedActionId,
      reason: d.reason,
      provider: d.provider,
      model: d.model,
      durationMs: Math.max(0, Math.round(d.durationMs)),
      attempts: d.attempts,
      usage: d.usage,
      estimatedCostUsd: microUsdToUsd(d.estimatedCostMicroUsd),
      estimatedCostMicroUsd: d.estimatedCostMicroUsd,
      pricingVersion: d.pricingVersion,
    },
    budget: toWireBudget(o.budget),
  });
}
