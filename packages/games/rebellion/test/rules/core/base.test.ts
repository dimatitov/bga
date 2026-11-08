/** R-10, D-4 — deterministic base choice `chooseRebelBase` = FNV-1a 32 % n over sorted ids (TC-D-14, TC-D-16). */
import { describe, expect, it } from 'vitest';
import { chooseRebelBase } from '../../../src/rules';
import { fnv1a32 } from '../../../src/rules/core';

const CANDIDATES = ['bespin', 'dagobah', 'endor', 'hoth', 'tatooine', 'yavin'];

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors (ASCII)', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
});

describe('chooseRebelBase', () => {
  it('golden: sessionId → system pairs (changing the hash changes saved games: do not)', () => {
    const golden: [string, string][] = [
      ['session-1', 'hoth'],
      ['session-2', 'bespin'],
      ['session-4', 'endor'],
      ['session-5', 'dagobah'],
      ['8f14e45f-ceea-467a-9575-1e2b6a4b0a01', 'yavin'],
      ['session-6', 'tatooine'],
    ];
    expect(golden.map(([id]) => [id, chooseRebelBase(id, CANDIDATES)])).toEqual(golden);
    for (const [id, base] of golden) {
      expect(CANDIDATES[fnv1a32(id) % CANDIDATES.length]).toBe(base);
    }
  });

  it('is deterministic, independent of the input order and always returns a candidate', () => {
    const shuffled = [...CANDIDATES].reverse();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = `sid-${i}`;
      const base = chooseRebelBase(id, CANDIDATES);
      expect(chooseRebelBase(id, shuffled)).toBe(base);
      expect(chooseRebelBase(id, CANDIDATES)).toBe(base);
      expect(CANDIDATES).toContain(base);
      seen.add(base);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('handles long, unicode and near-identical ids (TC-D-16); an empty list throws', () => {
    for (const id of ['x'.repeat(10_000), 'база-повстанцев-🚀', 'abc1', 'abc2']) {
      expect(CANDIDATES).toContain(chooseRebelBase(id, CANDIDATES));
    }
    expect(() => chooseRebelBase('any', [])).toThrow();
  });
});
