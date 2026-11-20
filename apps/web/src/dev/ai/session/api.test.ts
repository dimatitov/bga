import { describe, expect, it } from 'vitest';
import { isApiError } from '@/shared/api/errors';
import { mockFetch } from '@/shared/test';
import { devAiSessionDecisionsPath, fetchSessionDecisions } from './api';
import { makeDecision, makeDecisionsResponse } from './testFixtures';

const PATH = 'GET /api/dev/ai/sessions/s1/decisions';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

describe('dev decisions API client (SWR-008 plan-frontend §2.3, D-6)', () => {
  it('path: /dev/ai/sessions/<encoded id>/decisions', () => {
    expect(devAiSessionDecisionsPath('s1')).toBe('/dev/ai/sessions/s1/decisions');
    expect(devAiSessionDecisionsPath('a/b c')).toBe('/dev/ai/sessions/a%2Fb%20c/decisions');
  });

  it('GET without body; a valid answer is parsed by the strict platform schema', async () => {
    const body = makeDecisionsResponse([makeDecision()]);
    const { requests } = mockFetch({ [PATH]: { status: 200, body } });
    await expect(fetchSessionDecisions('s1')).resolves.toEqual(body);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', body: undefined });
  });

  it.each([
    [
      'decision.reason',
      (b: Record<string, unknown>) => {
        (b.decisions as Record<string, unknown>[])[0]!.reason = 'Model reason text';
      },
    ],
    [
      'decision.prompt',
      (b: Record<string, unknown>) => {
        (b.decisions as Record<string, unknown>[])[0]!.prompt = 'Prompt text';
      },
    ],
    [
      'top-level budgetKey',
      (b: Record<string, unknown>) => {
        b.budgetKey = 's1';
      },
    ],
    [
      'top-level sessionId',
      (b: Record<string, unknown>) => {
        b.sessionId = 's1';
      },
    ],
    [
      'rules.text',
      (b: Record<string, unknown>) => {
        ((b.decisions as Record<string, unknown>[])[0]!.rules as Record<string, unknown>).text =
          'rule text';
      },
    ],
    [
      'negative cost',
      (b: Record<string, unknown>) => {
        (b.decisions as Record<string, unknown>[])[0]!.costMicroUsd = -1;
      },
    ],
    [
      '> 50 decisions',
      (b: Record<string, unknown>) => {
        b.decisions = Array.from({ length: 51 }, () => makeDecision());
      },
    ],
  ])('extra / invalid field (%s) → ApiError INVALID_RESPONSE', async (_label, mutate) => {
    const body = structuredClone(makeDecisionsResponse([makeDecision()])) as unknown as Record<
      string,
      unknown
    >;
    mutate(body);
    mockFetch({ [PATH]: { status: 200, body } });
    const error = await rejection(fetchSessionDecisions('s1'));
    expect(isApiError(error) && error.code).toBe('INVALID_RESPONSE');
  });

  it('404 / 403 → ApiError with the status', async () => {
    mockFetch({
      [PATH]: {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' } },
      },
      'GET /api/dev/ai/sessions/s2/decisions': {
        status: 403,
        body: {
          ok: false,
          error: { code: 'AI_DEV_FORBIDDEN', messageKey: 'errors.aiDevForbidden' },
        },
      },
    });
    const notFound = await rejection(fetchSessionDecisions('s1'));
    expect(isApiError(notFound) && notFound.status).toBe(404);
    const forbidden = await rejection(fetchSessionDecisions('s2'));
    expect(isApiError(forbidden) && forbidden.status).toBe(403);
  });
});
