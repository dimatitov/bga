/**
 * Per-role request parameters (SWR-005B, plan-backend §4.2).
 * - tactical (default): the cheap model, no reasoning (`'none'` when the model supports it, else `'low'`), 400 tokens.
 * - strategy: the stronger model, `'low'` reasoning, 1600 tokens (reasoning tokens count against the output limit).
 */
import type { OpenAIConfig } from '../config/env';
import type { AIModelRole } from './ai.types';
import { pricingFor } from './pricing';

export type RoleReasoningEffort = 'none' | 'low';

export interface RoleDefaults {
  readonly maxOutputTokens: number;
  /** Preferred effort; `'none'` falls back to `'low'` for a model that does not support it. */
  readonly effort: RoleReasoningEffort;
}

export const ROLE_DEFAULTS: Readonly<Record<AIModelRole, RoleDefaults>> = Object.freeze({
  tactical: Object.freeze({ maxOutputTokens: 400, effort: 'none' }),
  strategy: Object.freeze({ maxOutputTokens: 1600, effort: 'low' }),
});

export interface RoleRequestParams {
  readonly role: AIModelRole;
  /** Configured model id (pricing is looked up by it, not by the snapshot in the response). */
  readonly model: string;
  readonly effort: RoleReasoningEffort;
  readonly maxOutputTokens: number;
}

/** The configured model id of a role, or `null` when not configured. */
export function modelForRole(
  role: AIModelRole,
  openai: Pick<OpenAIConfig, 'strategyModel' | 'tacticalModel'>,
): string | null {
  return role === 'strategy' ? openai.strategyModel : openai.tacticalModel;
}

/** Effort for a role on a model: `'none'` only when the pricing table says the model supports it. */
export function effortFor(role: AIModelRole, model: string): RoleReasoningEffort {
  const preferred = ROLE_DEFAULTS[role].effort;
  if (preferred === 'none' && pricingFor(model)?.reasoningNone !== true) return 'low';
  return preferred;
}

export function requestParamsForRole(role: AIModelRole, model: string): RoleRequestParams {
  return {
    role,
    model,
    effort: effortFor(role, model),
    maxOutputTokens: ROLE_DEFAULTS[role].maxOutputTokens,
  };
}
