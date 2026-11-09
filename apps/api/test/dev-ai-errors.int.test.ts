/**
 * SWR-005B W6 — failure paths through the HTTP endpoint on the mock provider's test-only script (plan-backend §5.8,
 * §6; AC-04, AC-05; TC-RT-16/18). Every outcome writes one `AiUsage` row and uses the unified error envelope with the
 * allow-listed `details` only.
 */
import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import type { MockStep } from '../src/ai/ai.types';
import { expectError } from './support/fixtures';
import { postDecision, rowsOf, startAiApp, type AiApp } from './support/ai-fakes';

describe('POST /api/dev/ai/test-decision — failures on the mock script (SWR-005B W6)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  async function run(script: MockStep[]) {
    ctx = await startAiApp({ mockScript: script });
    const res = await postDecision(ctx.app);
    return { res, rows: await rowsOf(ctx.app) };
  }

  it('invalid-action → 502 AI_INVALID_DECISION not_in_actions (rejected by the service), row invalid_decision', async () => {
    const { res, rows } = await run(['invalid-action']);
    const body = expectError(res, 502, 'AI_INVALID_DECISION', ERROR_MESSAGE_KEYS.aiInvalidDecision);
    expect(body.error.details).toEqual({
      attempts: 1,
      reason: 'not_in_actions',
      estimatedCostUsd: 0,
      estimatedCostMicroUsd: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'invalid_decision',
      errorCode: 'AI_INVALID_DECISION',
      attempts: 1,
      provider: 'mock',
    });
  });

  it('malformed → 502 AI_INVALID_DECISION malformed, not retried', async () => {
    const { res, rows } = await run(['malformed', 'ok']);
    const body = expectError(res, 502, 'AI_INVALID_DECISION');
    expect(body.error.details).toMatchObject({ attempts: 1, reason: 'malformed' });
    expect(rows[0]).toMatchObject({ status: 'invalid_decision', attempts: 1 });
  });

  it('timeout ×3 → 504 AI_TIMEOUT attempts:3 (maxRetries 2), backoff sleeps between attempts', async () => {
    const { res, rows } = await run(['timeout']);
    const body = expectError(res, 504, 'AI_TIMEOUT', ERROR_MESSAGE_KEYS.aiTimeout);
    expect(body.error.details).toEqual({ attempts: 3 });
    expect(rows[0]).toMatchObject({ status: 'timeout', attempts: 3, errorCode: 'AI_TIMEOUT' });
    expect(ctx?.delays).toHaveLength(2);
  });

  it('rate-limit → 429 AI_RATE_LIMITED (upstream key, not the dev limit), no Retry-After when unknown', async () => {
    const { res, rows } = await run(['rate-limit']);
    const body = expectError(res, 429, 'AI_RATE_LIMITED', ERROR_MESSAGE_KEYS.aiRateLimited);
    expect(body.error.details).toEqual({ attempts: 3 });
    expect(res.headers['retry-after']).toBeUndefined();
    expect(rows[0]).toMatchObject({ status: 'rate_limited', attempts: 3 });
  });

  it.each([
    ['network', 'network'],
    ['server-error', 'upstream'],
  ] as const)('%s → 502 AI_PROVIDER_ERROR reason %s after 3 attempts', async (step, reason) => {
    const { res, rows } = await run([step]);
    const body = expectError(res, 502, 'AI_PROVIDER_ERROR', ERROR_MESSAGE_KEYS.aiProviderError);
    expect(body.error.details).toEqual({ attempts: 3, reason });
    expect(rows[0]).toMatchObject({ status: 'provider_error', attempts: 3 });
  });

  it('timeout, ok → 200 attempts:2 (one retry), row ok attempts 2', async () => {
    const { res, rows } = await run(['timeout', 'ok']);
    expect(res.status).toBe(200);
    expect(res.body.decision).toMatchObject({ attempts: 2, selectedActionId: 'action-1' });
    expect(rows[0]).toMatchObject({ status: 'ok', attempts: 2 });
  });

  it('error bodies never carry the objective or the reason text', async () => {
    const { res } = await run(['invalid-action']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('OBJECTIVE-MARKER');
    expect(text).not.toContain('Mock provider');
  });
});
