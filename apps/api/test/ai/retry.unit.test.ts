/**
 * SWR-005B W4 (plan-backend §5.4; AC-05; Q-11..Q-13): own retry loop — bounded attempts, backoff with seeded jitter,
 * Retry-After cap at 10 s, no retry of non-retryable failures.
 */
import { describe, expect, it } from 'vitest';
import { AiFailure } from '../../src/ai/ai.errors';
import {
  backoffMs,
  clampMaxRetries,
  parseRetryAfterMs,
  runWithRetries,
  willRetry,
} from '../../src/ai/retry';

function harness(randoms: number[] = [0.5]) {
  const sleeps: number[] = [];
  let i = 0;
  return {
    sleeps,
    policy: (maxRetries: number) => ({
      maxRetries,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      random: () => randoms[Math.min(i++, randoms.length - 1)] ?? 0.5,
    }),
  };
}

async function failing(failure: AiFailure, maxRetries: number, randoms?: number[]) {
  const h = harness(randoms);
  let calls = 0;
  const err = await runWithRetries(async () => {
    calls += 1;
    throw failure;
  }, h.policy(maxRetries)).catch((e: unknown) => e as AiFailure);
  return { err: err as AiFailure, calls, sleeps: h.sleeps };
}

describe('runWithRetries', () => {
  it('retryable failure → exactly maxRetries + 1 attempts for 0..5, attempts reported', async () => {
    for (let maxRetries = 0; maxRetries <= 5; maxRetries += 1) {
      const { err, calls, sleeps } = await failing(AiFailure.timeout(), maxRetries);
      expect(calls).toBe(maxRetries + 1);
      expect(sleeps).toHaveLength(maxRetries);
      expect(err.code).toBe('AI_TIMEOUT');
      expect(err.attempts).toBe(maxRetries + 1);
    }
  });

  it('maxRetries is clamped (no endless loop even for huge / invalid values)', async () => {
    expect((await failing(AiFailure.timeout(), 1000)).calls).toBe(6);
    expect((await failing(AiFailure.timeout(), -3)).calls).toBe(1);
    expect((await failing(AiFailure.timeout(), Number.NaN)).calls).toBe(1);
    expect(clampMaxRetries(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampMaxRetries(2.9)).toBe(2);
  });

  it('non-retryable failures run once (invalid decision, quota, key rejected, bad request)', async () => {
    for (const f of [
      AiFailure.invalidDecision('malformed'),
      AiFailure.providerError('quota'),
      AiFailure.keyRejected('tactical', 'm'),
      AiFailure.providerError('bad_request'),
    ]) {
      const { err, calls, sleeps } = await failing(f, 5);
      expect(calls).toBe(1);
      expect(sleeps).toEqual([]);
      expect(err.attempts).toBe(1);
    }
  });

  it('backoff: min(8000, 500·2^(n−1)) × (0.5 + random·0.5) with seeded random', async () => {
    const { sleeps } = await failing(
      AiFailure.providerError('upstream', {}, true),
      5,
      [0, 1, 0.5, 0.5, 0.5],
    );
    // before attempt 2: 500 × 0.5; 3: 1000 × 1; 4: 2000 × 0.75; 5: 4000 × 0.75; 6: 8000 × 0.75
    expect(sleeps).toEqual([250, 1000, 1500, 3000, 6000]);
    expect(backoffMs(10, () => 1)).toBe(8000);
    expect(backoffMs(2, () => 7)).toBe(500); // random clamped to 1
  });

  it('Retry-After ≤ 10 s is honoured as the delay', async () => {
    const { calls, sleeps, err } = await failing(
      AiFailure.rateLimited({ retryAfterMs: 10_000 }),
      2,
    );
    expect(calls).toBe(3);
    expect(sleeps).toEqual([10_000, 10_000]);
    expect(err.code).toBe('AI_RATE_LIMITED');
  });

  it('Retry-After > 10 s → no retry, immediate AI_RATE_LIMITED, non-retryable', async () => {
    const { calls, sleeps, err } = await failing(
      AiFailure.rateLimited({ retryAfterMs: 10_001 }),
      5,
    );
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
    expect(err.code).toBe('AI_RATE_LIMITED');
    expect(err.retryable).toBe(false);
    expect(err.retryAfterMs).toBe(10_001);
  });

  it('success after failures returns the value and the attempt count', async () => {
    const h = harness();
    let n = 0;
    const r = await runWithRetries(async () => {
      n += 1;
      if (n < 3) throw AiFailure.providerError('network', {}, true);
      return 'done';
    }, h.policy(2));
    expect(r).toEqual({ value: 'done', attempts: 3 });
  });

  it('a non-AiFailure error becomes a non-retryable AI_PROVIDER_ERROR (unknown)', async () => {
    const h = harness();
    let n = 0;
    const err = (await runWithRetries(async () => {
      n += 1;
      throw new Error('raw sk-test-SENTINEL');
    }, h.policy(3)).catch((e: unknown) => e)) as AiFailure;
    expect(n).toBe(1);
    expect(err).toBeInstanceOf(AiFailure);
    expect(err.code).toBe('AI_PROVIDER_ERROR');
    expect(err.reason).toBe('unknown');
    expect(err.message).not.toContain('SENTINEL');
  });

  it('willRetry', () => {
    expect(willRetry(AiFailure.timeout(), 1, 2)).toBe(true);
    expect(willRetry(AiFailure.timeout(), 3, 2)).toBe(false);
    expect(willRetry(AiFailure.invalidDecision('schema'), 1, 2)).toBe(false);
  });
});

describe('parseRetryAfterMs', () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name];
  it('retry-after-ms, seconds and HTTP-date; invalid → undefined', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(parseRetryAfterMs(headers({ 'retry-after-ms': '1500' }), now)).toBe(1500);
    expect(parseRetryAfterMs(headers({ 'retry-after': '2' }), now)).toBe(2000);
    expect(parseRetryAfterMs(headers({ 'retry-after': '0.5' }), now)).toBe(500);
    expect(
      parseRetryAfterMs(headers({ 'retry-after': 'Sun, 08 Nov 2026 12:00:30 GMT' }), now),
    ).toBe(30_000);
    expect(parseRetryAfterMs(headers({ 'retry-after': 'soon' }), now)).toBeUndefined();
    expect(parseRetryAfterMs(headers({}), now)).toBeUndefined();
    expect(parseRetryAfterMs(headers({ 'retry-after-ms': 'x', 'retry-after': '3' }), now)).toBe(
      3000,
    );
  });
});
