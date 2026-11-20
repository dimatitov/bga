/**
 * Seeded randomness of the bot (SWR-006 BD-4, A-3, AC-05): stable numbers, no host entropy.
 */
import { describe, expect, it } from 'vitest';
import { botSeed, gameCoin, hash32, seededRandom } from '../../src/ai';
import { fnv1a32 } from '../../src/rules/core';

describe('hash32 (FNV-1a 32)', () => {
  it('matches the published FNV-1a vectors and the engine hash', () => {
    expect(hash32('')).toBe(0x811c9dc5);
    expect(hash32('a')).toBe(0xe40c292c);
    expect(hash32('foobar')).toBe(0xbf9cf968);
    for (const text of ['', 'a', 'swr006-p01#1', 'session-x#coin#easy-expand', 'ünï']) {
      expect(hash32(text)).toBe(fnv1a32(text));
    }
  });
});

describe('seededRandom (mulberry32)', () => {
  it('snapshot: the same seed always yields the same sequence', () => {
    const r = seededRandom('swr006-p01#1');
    expect([r(), r(), r()]).toEqual([0.8767832505982369, 0.311014172853902, 0.8082974730059505]);
    const a = seededRandom('x');
    const b = seededRandom('x');
    for (let i = 0; i < 100; i += 1) expect(a()).toBe(b());
  });

  it('values are in [0, 1) and different seeds differ', () => {
    const r = seededRandom('range');
    for (let i = 0; i < 2000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRandom('s1')()).not.toBe(seededRandom('s2')());
  });
});

describe('botSeed / gameCoin', () => {
  it('botSeed = view.id#view.version (changes with every command)', () => {
    expect(botSeed({ id: 'game-1', version: 7 })).toBe('game-1#7');
    expect(botSeed({ id: 'game-1', version: 8 })).not.toBe(botSeed({ id: 'game-1', version: 7 }));
  });

  it('gameCoin is constant for the session, depends on the salt, in [0, 1)', () => {
    expect(gameCoin({ id: 'swr006-p01' }, 'easy-expand')).toBe(0.08475687308236957);
    expect(gameCoin({ id: 'swr006-p01' }, 'easy-expand')).toBe(
      gameCoin({ id: 'swr006-p01' }, 'easy-expand'),
    );
    expect(gameCoin({ id: 'swr006-p01' }, 'normal-evac')).not.toBe(
      gameCoin({ id: 'swr006-p01' }, 'easy-expand'),
    );
    const coins = Array.from({ length: 30 }, (_, i) => gameCoin({ id: `s-${i}` }, 'c'));
    for (const c of coins) expect(c >= 0 && c < 1).toBe(true);
    expect(new Set(coins).size).toBeGreaterThan(25);
  });
});
