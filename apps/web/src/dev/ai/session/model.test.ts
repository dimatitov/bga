import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import {
  costGroupView,
  decisionDataAttrs,
  decisionRowsNewestFirst,
  fallbackCode,
  formatInt,
  formatMicroUsd,
  formatTime,
  panelErrorReason,
  ruleIdsText,
  totalsDataAttrs,
} from './model';
import { makeCostGroup, makeDecision, makeDecisionsResponse } from './testFixtures';

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('decision panel view model (SWR-008 plan-frontend §2.4–§2.5, D-12)', () => {
  it('micro-dollars → USD by language; 0 → $0.00; null / NaN → null', () => {
    expect(formatMicroUsd(113, 'en')).toBe('$0.000113');
    expect(formatMicroUsd(1_250_000, 'en')).toBe('$1.25');
    expect(formatMicroUsd(0, 'en')).toBe('$0.00');
    expect(nbsp(formatMicroUsd(113, 'ru') ?? '')).toBe('0,000113 $');
    expect(formatMicroUsd(null, 'en')).toBeNull();
    expect(formatMicroUsd(Number.NaN, 'en')).toBeNull();
    expect(formatMicroUsd(undefined, 'en')).toBeNull();
  });

  it('integers with group separators; null / NaN → null', () => {
    expect(formatInt(12345, 'en')).toBe('12,345');
    expect(nbsp(formatInt(12345, 'ru') ?? '')).toBe('12 345');
    expect(formatInt(0, 'en')).toBe('0');
    expect(formatInt(null, 'en')).toBeNull();
    expect(formatInt(Number.POSITIVE_INFINITY, 'en')).toBeNull();
  });

  it('time HH:mm:ss (24 h); unparsable → null', () => {
    expect(formatTime('2026-11-20T10:15:30.000Z', 'ru')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatTime('2026-11-20T10:15:30.000Z', 'en')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatTime('not a date', 'en')).toBeNull();
  });

  it('rows newest first, `index` = the response index (0 = oldest)', () => {
    const a = makeDecision({ at: '2026-11-20T10:00:00.000Z' });
    const b = makeDecision({ at: '2026-11-20T10:01:00.000Z' });
    const c = makeDecision({ at: '2026-11-20T10:02:00.000Z' });
    expect(decisionRowsNewestFirst([a, b, c])).toEqual([
      { index: 2, decision: c },
      { index: 1, decision: b },
      { index: 0, decision: a },
    ]);
    expect(decisionRowsNewestFirst([])).toEqual([]);
  });

  it('fallback code: errorCode, else status; none without fallback', () => {
    expect(fallbackCode(makeDecision())).toBeNull();
    expect(
      fallbackCode(makeDecision({ fallback: true, status: 'timeout', errorCode: 'AI_TIMEOUT' })),
    ).toBe('AI_TIMEOUT');
    expect(fallbackCode(makeDecision({ fallback: true, status: 'invalid_decision' }))).toBe(
      'invalid_decision',
    );
  });

  it('rule ids: joined, empty → null', () => {
    expect(ruleIdsText(['a', 'b'])).toBe('a, b');
    expect(ruleIdsText([])).toBeNull();
  });

  it('data-* of a decision row and of the totals (plan-frontend §2.5)', () => {
    const d = makeDecision({
      fallback: true,
      status: 'timeout',
      errorCode: 'AI_TIMEOUT',
      rules: { count: 2, ids: ['x:1', 'x:2'], truncated: true, dropped: false },
    });
    expect(decisionDataAttrs(d)).toEqual({
      'data-status': 'timeout',
      'data-fallback': 'true',
      'data-error-code': 'AI_TIMEOUT',
      'data-rules-enabled': 'true',
      'data-rules-count': '2',
      'data-rules-ids': 'x:1,x:2',
      'data-rules-tokens': '412',
      'data-rules-chars': '1648',
      'data-rules-truncated': 'true',
      'data-rules-dropped': 'false',
      'data-input-tokens': '1812',
      'data-output-tokens': '64',
      'data-cost-micro-usd': '113',
    });
    expect(decisionDataAttrs(makeDecision())).toMatchObject({
      'data-error-code': '',
      'data-fallback': 'false',
    });
    const totals = makeDecisionsResponse([
      makeDecision({ costMicroUsd: 100 }),
      makeDecision({ costMicroUsd: 50, rules: { enabled: false, count: 0, ids: [] } }),
    ]).totals;
    expect(totalsDataAttrs(totals)).toEqual({
      'data-with-rules-decisions': '1',
      'data-with-rules-cost': '100',
      'data-without-rules-decisions': '1',
      'data-without-rules-cost': '50',
      'data-total-cost': '150',
    });
  });

  it('cost group: mean null → null (shown as «—»), empty group → 0 / $0.00', () => {
    expect(costGroupView(makeCostGroup(), 'en')).toEqual({
      decisions: '0',
      cost: '$0.00',
      mean: null,
    });
    expect(
      costGroupView(
        makeCostGroup({ decisions: 2, costMicroUsd: 300, meanCostMicroUsd: 150 }),
        'en',
      ),
    ).toEqual({ decisions: '2', cost: '$0.0003', mean: '$0.00015' });
  });

  it('error reason: 404 → unavailable, 403 → forbidden, else error', () => {
    expect(panelErrorReason(new ApiError({ status: 404, code: 'NOT_FOUND' }))).toBe('unavailable');
    expect(panelErrorReason(new ApiError({ status: 403, code: 'AI_DEV_FORBIDDEN' }))).toBe(
      'forbidden',
    );
    expect(panelErrorReason(new ApiError({ status: 500, code: 'INTERNAL' }))).toBe('error');
    expect(panelErrorReason(new ApiError({ status: null, code: 'NETWORK' }))).toBe('error');
    expect(panelErrorReason(new Error('x'))).toBe('error');
  });
});
