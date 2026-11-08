import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@bga/platform';
import { idempotencyHash } from '../src/sessions/idempotency';

describe('idempotency body hash (Q-2, AM-BE-7)', () => {
  it('sorts object keys recursively and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, { z: 0, y: 'x' }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1,{"y":"x","z":0}]},"b":1}',
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('scalars and strings are JSON-encoded (no collisions between "1" and 1, escaping kept)', () => {
    expect(canonicalJson('1')).toBe('"1"');
    expect(canonicalJson(1)).toBe('1');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson({ 'a"b': 'c\nd' })).toBe('{"a\\"b":"c\\nd"}');
  });

  it('only key order is normalised: an omitted field, null and a default value differ', () => {
    const base = { gameId: 'g', setup: { opponentType: 'ai' } };
    const withNull = { gameId: 'g', setup: { opponentType: 'ai', aiDifficulty: null } };
    const withDefault = { gameId: 'g', setup: { opponentType: 'ai', aiDifficulty: 'normal' } };
    const hashes = new Set([base, withNull, withDefault].map(idempotencyHash));
    expect(hashes.size).toBe(3);
  });

  it('is stable: same body in another key order → same SHA-256 hex of the canonical JSON', () => {
    const a = idempotencyHash({ gameId: 'g', setup: { x: 1, y: [1, { b: 2, a: 1 }] } });
    const b = idempotencyHash({ setup: { y: [1, { a: 1, b: 2 }], x: 1 }, gameId: 'g' } as {
      gameId: string;
      setup: unknown;
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(
      createHash('sha256')
        .update('{"gameId":"g","setup":{"x":1,"y":[1,{"a":1,"b":2}]}}')
        .digest('hex'),
    );
  });

  it('gameId is part of the hash', () => {
    expect(idempotencyHash({ gameId: 'a', setup: {} })).not.toBe(
      idempotencyHash({ gameId: 'b', setup: {} }),
    );
  });
});
