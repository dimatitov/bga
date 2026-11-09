/**
 * Model pricing and cost ESTIMATES (SWR-005B, plan-backend §5.1–§5.2; Clarifications Q-15, Q-16; A-2).
 *
 * - All money is integer micro-USD; prices are integer micro-USD per 1M tokens, so the arithmetic is exact integer
 *   math (no float error). The final division rounds UP (a conservative estimate).
 * - Long context: total input (incl. cached) > 272 000 tokens → ×2 input/cached and ×1.5 output for the whole request;
 *   exactly 272 000 is still short context.
 * - Reasoning tokens are already inside `outputTokens` (A-2) and are never added a second time.
 * - Exact model id match only (no prefix matching): an unknown model has no price → the request is refused with
 *   `AI_NOT_CONFIGURED` / `errors.aiPricingUnknown` before any paid call.
 */
import { microUsdToUsd } from '@bga/platform';
import type { AIUsage } from './ai.types';

export const PRICING_VERSION = 'openai-2026-11-08';
/** Source of the tariffs (checked 2026-11-08, plus the model pages). */
export const PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const LONG_CONTEXT_THRESHOLD_TOKENS = 272_000;

export interface ModelPricing {
  /** Uncached input, micro-USD per 1M tokens. */
  readonly inputMicroUsdPerM: number;
  /** Cached input, micro-USD per 1M tokens. */
  readonly cachedInputMicroUsdPerM: number;
  /** Output (reasoning included), micro-USD per 1M tokens. */
  readonly outputMicroUsdPerM: number;
  /** Whether the model accepts `reasoning.effort: 'none'`. */
  readonly reasoningNone: boolean;
}

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze({
  // $2.00 / $0.10 cached / $10.00 per 1M tokens
  'gpt-6.1-sol': Object.freeze({
    inputMicroUsdPerM: 2_000_000,
    cachedInputMicroUsdPerM: 100_000,
    outputMicroUsdPerM: 10_000_000,
    reasoningNone: false,
  }),
  // $0.10 / $0.01 cached / $0.50 per 1M tokens
  'gpt-6-luna': Object.freeze({
    inputMicroUsdPerM: 100_000,
    cachedInputMicroUsdPerM: 10_000,
    outputMicroUsdPerM: 500_000,
    reasoningNone: true,
  }),
});

/** Pricing of the exact model id, or `null`. */
export function pricingFor(model: string): ModelPricing | null {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICING, model)
    ? (MODEL_PRICING[model] ?? null)
    : null;
}

export type CostUsage = Pick<AIUsage, 'inputTokens' | 'cachedInputTokens' | 'outputTokens'>;

function assertTokens(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

/** ceil(n / d) for non-negative safe integers, exact. */
function ceilDiv(n: number, d: number): number {
  const q = Math.floor(n / d);
  return q * d < n ? q + 1 : q;
}

/**
 * Estimated cost in integer micro-USD, or `null` for a model without pricing.
 * `cachedInputTokens` is a part of `inputTokens` (OpenAI usage semantics) and is clamped to it.
 */
export function estimateCostMicroUsd(model: string, usage: CostUsage): number | null {
  const p = pricingFor(model);
  if (!p) return null;
  assertTokens('inputTokens', usage.inputTokens);
  assertTokens('cachedInputTokens', usage.cachedInputTokens);
  assertTokens('outputTokens', usage.outputTokens);
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const uncached = usage.inputTokens - cached;
  const long = usage.inputTokens > LONG_CONTEXT_THRESHOLD_TOKENS;
  // Multipliers ×2 to stay integer: short (1, 1) → (2, 2); long (×2 input, ×1.5 output) → (4, 3).
  const inMul2 = long ? 4 : 2;
  const outMul2 = long ? 3 : 2;
  const numerator =
    (uncached * p.inputMicroUsdPerM + cached * p.cachedInputMicroUsdPerM) * inMul2 +
    usage.outputTokens * p.outputMicroUsdPerM * outMul2;
  return ceilDiv(numerator, 2 * 1_000_000);
}

/** Same estimate in USD (6 decimals), or `null`. */
export function estimateCostUsd(model: string, usage: CostUsage): number | null {
  const micro = estimateCostMicroUsd(model, usage);
  return micro === null ? null : microUsdToUsd(micro);
}

/** Worst case of ONE attempt: upper bound of input tokens (uncached) + the full output limit. */
export function perAttemptReserveMicroUsd(
  model: string,
  inputTokensUpperBound: number,
  maxOutputTokens: number,
): number | null {
  return estimateCostMicroUsd(model, {
    inputTokens: inputTokensUpperBound,
    cachedInputTokens: 0,
    outputTokens: maxOutputTokens,
  });
}

/** Budget reserve (plan §5.2): per-attempt worst case × (maxRetries + 1). */
export function worstCaseReserveMicroUsd(
  model: string,
  inputTokensUpperBound: number,
  maxOutputTokens: number,
  maxRetries: number,
): number | null {
  const perAttempt = perAttemptReserveMicroUsd(model, inputTokensUpperBound, maxOutputTokens);
  return perAttempt === null ? null : perAttempt * (maxRetries + 1);
}
