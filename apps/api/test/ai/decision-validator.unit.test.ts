/**
 * SWR-005B W4 (plan-backend §5.6 step 6; AC-04; AM-BE-5, Q-8): the single acceptance point of a decision.
 */
import { describe, expect, it } from 'vitest';
import { normalizeReason, validateDecision } from '../../src/ai/decision-validator';

const IDS = ['action-1', 'action-2', 'action-3'];

describe('validateDecision', () => {
  it('accepts an id from the list', () => {
    expect(validateDecision({ selectedActionId: 'action-2', reason: ' Good. ' }, IDS)).toEqual({
      ok: true,
      decision: { selectedActionId: 'action-2', reason: 'Good.' },
    });
  });

  it('id outside the list → not_in_actions', () => {
    expect(validateDecision({ selectedActionId: 'action-9', reason: 'x' }, IDS)).toEqual({
      ok: false,
      reason: 'not_in_actions',
    });
    expect(validateDecision({ selectedActionId: '__not_in_list__', reason: 'x' }, IDS)).toEqual({
      ok: false,
      reason: 'not_in_actions',
    });
  });

  it('extra fields / wrong types / empty id / not an object → schema', () => {
    for (const raw of [
      { selectedActionId: 'action-1', reason: 'x', execute: true },
      { selectedActionId: '', reason: 'x' },
      { selectedActionId: 'action-1' },
      { selectedActionId: 1, reason: 'x' },
      { selectedActionId: 'a'.repeat(65), reason: 'x' },
      'action-1',
      null,
      ['action-1', 'x'],
    ]) {
      expect(validateDecision(raw, IDS)).toEqual({ ok: false, reason: 'schema' });
    }
  });

  it('empty reason after trim → schema (invalid)', () => {
    expect(validateDecision({ selectedActionId: 'action-1', reason: '   \n ' }, IDS)).toEqual({
      ok: false,
      reason: 'schema',
    });
  });

  it('long reason is trimmed and cut to 300 characters', () => {
    const r = validateDecision(
      { selectedActionId: 'action-1', reason: `  ${'b'.repeat(500)}  ` },
      IDS,
    );
    expect(r.ok && r.decision.reason).toBe('b'.repeat(300));
  });
});

describe('normalizeReason', () => {
  it('does not split a surrogate pair and drops trailing space after the cut', () => {
    const emoji = '\u{1F680}'; // 2 UTF-16 units
    const cut = normalizeReason(`${'a'.repeat(299)}${emoji}tail`);
    expect(cut).toBe('a'.repeat(299));
    expect(normalizeReason(`${'a'.repeat(298)} ${'c'.repeat(10)}`, 299)).toBe('a'.repeat(298));
    expect(normalizeReason('short')).toBe('short');
  });
});
