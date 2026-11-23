// SWR-010 TC-DECK-10 (AC-4, AC-5, AC-17) and plan-backend §2.3: the deterministic shuffle is frozen by test vectors.
import { describe, expect, it } from 'vitest';
import { seedFromString, seededShuffle, shuffleZone } from '../../src/cards';
import { CTX, basePile, cardsOf, deepFreeze, expectOk } from './fixture';

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;

describe('seedFromString: FNV-1a 32 over UTF-16 code units', () => {
  it('matches the published FNV-1a 32 vectors', () => {
    expect(seedFromString('')).toBe(0x811c9dc5);
    expect(seedFromString('a')).toBe(0xe40c292c);
    expect(seedFromString('foobar')).toBe(0xbf9cf968);
  });

  it('hashes code units (not bytes) and stays unsigned', () => {
    expect(seedFromString('x')).toBe(4245442695);
    expect(seedFromString('game-1')).toBe(1546084093);
    const astral = seedFromString('\u{1F0A1}');
    expect(astral).toBeGreaterThanOrEqual(0);
    expect(astral).toBeLessThan(2 ** 32);
  });
});

describe('TC-DECK-10: seededShuffle', () => {
  it('frozen test vector (changing it breaks the replay of saved game creation)', () => {
    expect(seededShuffle(LETTERS, 'x')).toEqual(['j', 'i', 'd', 'c', 'f', 'h', 'b', 'g', 'a', 'e']);
    expect(seededShuffle([1, 2, 3, 4, 5], 'game-1')).toEqual([2, 1, 4, 3, 5]);
  });

  it('same seed → same order; result is a permutation; input untouched', () => {
    const input = deepFreeze([...LETTERS]);
    const first = seededShuffle(input, 'seed');
    expect(seededShuffle(input, 'seed')).toEqual(first);
    expect([...first].sort()).toEqual([...LETTERS]);
    expect(first).not.toBe(input);
    expect(seededShuffle([], 'x')).toEqual([]);
    expect(seededShuffle(['only'], 'x')).toEqual(['only']);
  });

  it('100 seeds give ≥ 95 different orders of 10 cards', () => {
    const orders = new Set(
      Array.from({ length: 100 }, (_, i) => seededShuffle(LETTERS, `seed-${i}`).join('')),
    );
    expect(orders.size).toBeGreaterThanOrEqual(95);
  });

  it('shuffleZone = seededShuffle of the stored order', () => {
    const pile = basePile();
    const shuffled = expectOk(shuffleZone(pile, CTX, 'draw', 'x'));
    expect(cardsOf(shuffled, 'draw')).toEqual(seededShuffle(cardsOf(pile, 'draw'), 'x'));
    expect(JSON.stringify(expectOk(shuffleZone(pile, CTX, 'draw', 'x')))).toBe(
      JSON.stringify(shuffled),
    );
  });
});
