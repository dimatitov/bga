/**
 * Own retry loop (SWR-005B, plan-backend §5.4; Clarifications Q-11..Q-13). The SDK runs with `maxRetries: 0`.
 * - at most `maxRetries + 1` attempts (`maxRetries` is clamped to 0..5 — no endless loop is possible);
 * - only `retryable` failures are repeated (timeout, network, 408, 429 except quota, 5xx); an invalid decision never;
 * - delay: the server's Retry-After when ≤ 10 s; when it is larger the request is NOT repeated (immediate
 *   AI_RATE_LIMITED with `retryAfterSeconds`); otherwise exponential backoff with jitter
 *   `min(8000, 500·2^(n−1)) × (0.5 + random·0.5)`.
 * `sleep` and `random` are injected (tests never wait).
 */
import { AiFailure } from './ai.errors';

export const MAX_RETRIES_CAP = 5;
export const RETRY_AFTER_CAP_MS = 10_000;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 8_000;

export interface RetryPolicy {
  maxRetries: number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

/** Clamp to an integer 0..5. */
export function clampMaxRetries(maxRetries: number): number {
  if (!Number.isFinite(maxRetries)) return 0;
  return Math.min(MAX_RETRIES_CAP, Math.max(0, Math.trunc(maxRetries)));
}

/** Backoff before attempt `nextAttempt` (≥ 2), ms. */
export function backoffMs(nextAttempt: number, random: () => number): number {
  const n = Math.max(1, nextAttempt - 1);
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(base * (0.5 + r * 0.5));
}

/** True when a failure after `attempt` (1-based) will be retried under `maxRetries`. */
export function willRetry(failure: AiFailure, attempt: number, maxRetries: number): boolean {
  if (!failure.retryable) return false;
  if (attempt >= clampMaxRetries(maxRetries) + 1) return false;
  if (failure.retryAfterMs !== undefined && failure.retryAfterMs > RETRY_AFTER_CAP_MS) return false;
  return true;
}

/**
 * Parses `retry-after-ms` (ms) or `retry-after` (seconds or HTTP-date) into ms; `undefined` when absent/invalid.
 */
export function parseRetryAfterMs(
  get: (name: string) => string | null | undefined,
  nowMs: number,
): number | undefined {
  const ms = get('retry-after-ms');
  if (ms != null && ms.trim() !== '') {
    const v = Number(ms);
    if (Number.isFinite(v) && v >= 0) return Math.ceil(v);
  }
  const ra = get('retry-after');
  if (ra == null || ra.trim() === '') return undefined;
  const seconds = Number(ra);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
  const date = Date.parse(ra);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - nowMs);
}

/**
 * Runs `attemptFn(attempt)` until it resolves or a non-retried failure. Non-`AiFailure` errors are converted to a
 * non-retryable `AI_PROVIDER_ERROR` (`unknown`). The rejected failure carries the final `attempts`; a Retry-After over
 * the cap is surfaced as non-retryable.
 */
export async function runWithRetries<T>(
  attemptFn: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
): Promise<{ value: T; attempts: number }> {
  const maxAttempts = clampMaxRetries(policy.maxRetries) + 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const value = await attemptFn(attempt);
      return { value, attempts: attempt };
    } catch (err) {
      const failure =
        err instanceof AiFailure
          ? err
          : AiFailure.providerError('unknown', { sdkErrorName: 'UnknownError' });
      if (!willRetry(failure, attempt, policy.maxRetries) || attempt >= maxAttempts) {
        const overCap =
          failure.retryAfterMs !== undefined && failure.retryAfterMs > RETRY_AFTER_CAP_MS;
        throw failure.with({ attempts: attempt, retryable: failure.retryable && !overCap });
      }
      const delay =
        failure.retryAfterMs !== undefined
          ? failure.retryAfterMs
          : backoffMs(attempt + 1, policy.random);
      await policy.sleep(delay);
    }
  }
}
