// SWR-010 TC-DECK-09 (AC-5): 1000 seeded random sequences of 20 operations. After every successful operation the
// invariants hold and the multiset of instances is unchanged; every failed operation leaves its input untouched.
import { describe, expect, it } from 'vitest';
import {
  checkCardInvariants,
  discardCard,
  drawCards,
  moveCard,
  playCard,
  registerCard,
  returnCard,
  revealCard,
  seedFromString,
  shuffleZone,
  type CardPile,
  type CardResult,
} from '../../src/cards';
import { ALL_INSTANCES, CTX, LAYOUT, basePile, deepFreeze, placedIds } from './fixture';

const SEQUENCES = 1000;
const STEPS = 20;
const ZONES = [...LAYOUT.map((z) => z.id), 'void'];
const INSTANCES = [...ALL_INSTANCES.map((i) => i.id), 'ghost#1'];
const DEFINITIONS = [...new Set(ALL_INSTANCES.map((i) => i.definitionId)), 'ghost'];

/** Test-local generator (independent of the engine's shuffle). */
function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** Biased towards legal moves: half the time the instance is taken from the chosen source zone. */
function randomOp(
  rng: () => number,
  pile: CardPile,
): { label: string; run: (p: CardPile) => CardResult } {
  const from = pick(rng, ZONES);
  const to = pick(rng, ZONES);
  const inSource = pile.zones.find((z) => z.id === from)?.cards ?? [];
  const instanceId =
    inSource.length > 0 && rng() < 0.5 ? pick(rng, inSource) : pick(rng, INSTANCES);
  const position = pick(rng, ['top', 'bottom', undefined] as const);
  const move = { instanceId, from, to, ...(position === undefined ? {} : { position }) };
  const kind = Math.floor(rng() * 8);
  switch (kind) {
    case 0: {
      const count = Math.floor(rng() * 6) - 1;
      const allowShort = rng() < 0.5;
      return {
        label: `draw ${JSON.stringify({ from, to, count, allowShort })}`,
        run: (p) => drawCards(p, CTX, { from, to, count, allowShort }),
      };
    }
    case 1:
      return { label: `move ${JSON.stringify(move)}`, run: (p) => moveCard(p, CTX, move) };
    case 2:
      return { label: `play ${JSON.stringify(move)}`, run: (p) => playCard(p, CTX, move) };
    case 3:
      return { label: `discard ${JSON.stringify(move)}`, run: (p) => discardCard(p, CTX, move) };
    case 4:
      return { label: `reveal ${JSON.stringify(move)}`, run: (p) => revealCard(p, CTX, move) };
    case 5:
      return { label: `return ${JSON.stringify(move)}`, run: (p) => returnCard(p, CTX, move) };
    case 6: {
      const seed = `s-${Math.floor(rng() * 1000)}`;
      return { label: `shuffle ${from} ${seed}`, run: (p) => shuffleZone(p, CTX, from, seed) };
    }
    default: {
      const definitionId = pick(rng, DEFINITIONS);
      return {
        label: `register ${JSON.stringify({ definitionId, from, to })}`,
        run: (p) => registerCard(p, CTX, { definitionId, from, to }),
      };
    }
  }
}

describe('TC-DECK-09: seeded random operation sequences keep the invariants', () => {
  it(`${SEQUENCES} sequences × ${STEPS} operations`, () => {
    const baseSeed = seedFromString('swr-010-deck-09');
    let ok = 0;
    let failed = 0;
    for (let n = 0; n < SEQUENCES; n += 1) {
      const rng = rngOf(baseSeed + n);
      let pile = deepFreeze(basePile({ secret: rng() < 0.5 ? 'physical' : 'digital' }));
      const multiset = placedIds(pile);
      for (let step = 0; step < STEPS; step += 1) {
        const op = randomOp(rng, pile);
        const where = `sequence ${n} (seed ${baseSeed + n}) step ${step}: ${op.label}`;
        const before = JSON.stringify(pile);
        const result = op.run(pile);
        expect(JSON.stringify(pile), where).toBe(before);
        if (result.ok) {
          ok += 1;
          expect(checkCardInvariants(result.pile, CTX), where).toEqual([]);
          expect(placedIds(result.pile), where).toEqual(multiset);
          pile = deepFreeze(result.pile);
        } else {
          failed += 1;
        }
      }
    }
    // The generator exercises both branches substantially.
    expect(ok).toBeGreaterThan(SEQUENCES);
    expect(failed).toBeGreaterThan(SEQUENCES * 2);
  });
});
