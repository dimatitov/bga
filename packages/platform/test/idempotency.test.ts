import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_HEADER_LC,
  IDEMPOTENCY_KEY_ISSUE_PATH,
  IDEMPOTENT_REPLAY_HEADER,
  IdempotencyKeySchema,
  canonicalJson,
  parseIdempotencyKeyHeader,
} from '../src';

const KEY = '3f2c8a4e-9b1d-4c6e-8a7f-2d5b9e0c1a34';

describe('Idempotency-Key (SWR-004, Q-2)', () => {
  it('header names', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
    expect(IDEMPOTENCY_KEY_HEADER_LC).toBe(IDEMPOTENCY_KEY_HEADER.toLowerCase());
    expect(IDEMPOTENT_REPLAY_HEADER).toBe('Idempotent-Replay');
    expect(IDEMPOTENCY_KEY_ISSUE_PATH).toEqual(['headers', 'idempotency-key']);
  });

  it('IdempotencyKeySchema accepts UUIDs (crypto.randomUUID, upper case)', () => {
    expect(IdempotencyKeySchema.safeParse(KEY).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse(KEY.toUpperCase()).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  it.each([
    '',
    ' ',
    'not-a-uuid',
    `${KEY} `,
    `{${KEY}}`,
    `${KEY}0`,
    KEY.replace(/-/g, ''),
    `${KEY}, ${KEY}`,
    'x'.repeat(37),
    'g'.repeat(8) + KEY.slice(8),
  ])('IdempotencyKeySchema rejects %j', (key) => {
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(false);
  });

  it('parseIdempotencyKeyHeader: absent → no key; valid → the key as sent', () => {
    expect(parseIdempotencyKeyHeader(undefined)).toEqual({ ok: true, key: null });
    expect(parseIdempotencyKeyHeader(KEY)).toEqual({ ok: true, key: KEY });
    expect(parseIdempotencyKeyHeader(KEY.toUpperCase())).toEqual({
      ok: true,
      key: KEY.toUpperCase(),
    });
  });

  it.each([[''], ['abc'], [`${KEY}, ${KEY}`], [[KEY, KEY]], [[KEY]], [null], [42]])(
    'parseIdempotencyKeyHeader rejects %j with issues under headers.idempotency-key',
    (raw) => {
      const result = parseIdempotencyKeyHeader(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(issue.path).toEqual(['headers', 'idempotency-key']);
        expect(typeof issue.code).toBe('string');
      }
    },
  );
});

describe('canonicalJson (review #3: one implementation for web and api)', () => {
  it('sorts object keys recursively, keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, { z: 0, y: 'x' }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1,{"y":"x","z":0}]},"b":1}',
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it('scalars are JSON-encoded; escaping kept', () => {
    expect(canonicalJson('1')).toBe('"1"');
    expect(canonicalJson(1)).toBe('1');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson({ 'a"b': 'c\nd' })).toBe('{"a\\"b":"c\\nd"}');
  });

  it('undefined behaves like JSON.stringify: dropped in objects, null in arrays, top level → "null"', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('only key order is normalised: omitted ≠ null ≠ default', () => {
    const omitted = canonicalJson({ opponentType: 'ai' });
    const withNull = canonicalJson({ opponentType: 'ai', aiDifficulty: null });
    const withDefault = canonicalJson({ opponentType: 'ai', aiDifficulty: 'normal' });
    expect(new Set([omitted, withNull, withDefault]).size).toBe(3);
  });

  it('equals JSON.stringify for an already sorted, undefined-free value', () => {
    const value = { a: [1, 'x', { b: false, c: null }], d: { e: 1.5 } };
    expect(canonicalJson(value)).toBe(JSON.stringify(value));
  });
});
