/**
 * SWR-010 W5 (plan-backend §8.1, AQ-5; AC-18, D-9): card lines of the AI situation. Only from the actor's own
 * `view.cards` (own cards + public counts), printed only when a count is > 0 — round 1 and legacy games keep the
 * SWR-008 text byte for byte (R6). The opponent's cards and the deck never reach the text (S2/S3/S4).
 */
import { describe, expect, it } from 'vitest';
import { DESCRIBE_LIMITS, deriveBaseIntel, situationFor } from '../../src/ai';
import { toSideView } from '../../src/rules';
import {
  probeSystemOf,
  type CoreGameState,
  type CorePlayerView,
  type Faction,
} from '../../src/schema';
import {
  DIG_EMP,
  DIG_REB,
  definitionsIn,
  newGame,
  permuteDeck,
  rounds,
  swapHand,
  zone,
} from '../rules/core/cards-helpers';

function view(state: CoreGameState, side: Faction): CorePlayerView {
  const v = toSideView(state, side);
  if (v.kind !== 'player' || v.rulesEngine !== 'core-v1')
    throw new Error('expected a core-v1 view');
  return v;
}

function situation(state: CoreGameState, side: Faction): string {
  const v = view(state, side);
  return situationFor(v, side === 'empire' ? deriveBaseIntel(v) : null);
}

function legacyOf(state: CoreGameState): CoreGameState {
  const { cards: _cards, table: _table, ...legacy } = state;
  return legacy;
}

/** The situation line about probe cards (the only line naming them), or `undefined`. */
function probeLine(text: string): string | undefined {
  return text.split('\n').find((line) => /probe/i.test(line));
}

const SIDES: Faction[] = ['empire', 'rebels'];

describe('round 1 and legacy games: byte-identical SWR-008 situation (R6)', () => {
  it.each([
    ['AI Empire', DIG_REB],
    ['AI Rebels', DIG_EMP],
  ] as const)('%s game at creation: no card line; equal to the same game without cards', (_, s) => {
    const state = newGame(s, 'w5-desc-r1');
    expect(state.cards).toBeDefined();
    for (const side of SIDES) {
      const text = situation(state, side);
      expect(probeLine(text), side).toBeUndefined();
      expect(text, side).toBe(situation(legacyOf(state), side));
    }
  });

  it('a legacy game after Refreshes (cards: null) never prints a card line', () => {
    const legacy = rounds(legacyOf(newGame(DIG_REB, 'w5-desc-legacy')), 3);
    expect(legacy.cards).toBeUndefined();
    for (const side of SIDES) {
      expect(view(legacy, side).cards).toBeNull();
      expect(probeLine(situation(legacy, side)), side).toBeUndefined();
    }
  });
});

describe('after a Refresh', () => {
  const state = rounds(newGame(DIG_REB, 'w5-desc-refresh'), 2);
  const hand = definitionsIn(state, 'empire-probes');
  const deckCount = zone(state, 'probe-deck').length;

  it('the Empire sees its own probe systems and the deck count', () => {
    expect(hand.length).toBe(4);
    const line = probeLine(situation(state, 'empire'));
    // The view lists an unordered zone sorted (platform `projectZones`): the line follows it.
    const systems = [...hand].sort().map((id) => probeSystemOf(id));
    expect(line).toBe(
      `Your probe cards (the Rebel base is NOT in these systems): ${systems.join(', ')}. ` +
        `Probe deck: ${deckCount} cards left.`,
    );
    // Only the Empire's own cards: no system of a deck card appears on the line.
    for (const id of definitionsIn(state, 'probe-deck')) {
      const system = probeSystemOf(id);
      expect(line?.split(/[ ,:.]+/), id).not.toContain(system);
    }
  });

  it('the Rebels see only the public counts, never the Empire’s systems', () => {
    const line = probeLine(situation(state, 'rebels'));
    expect(line).toBe(
      `The Empire holds 4 probe cards (each names a system that is not your base); probe deck: ${deckCount} cards left.`,
    );
  });

  it('S2/S3: the Rebel situation is invariant to the Empire’s hand (same counts, other cards)', () => {
    const swapped = swapHand(state);
    expect(definitionsIn(swapped, 'empire-probes')).not.toEqual(hand);
    expect(situation(swapped, 'rebels')).toBe(situation(state, 'rebels'));
  });

  it('S4: both situations are invariant to the deck order', () => {
    for (const k of [1, 2, 5]) {
      const permuted = permuteDeck(state, k);
      for (const side of SIDES)
        expect(situation(permuted, side), `${side} π${k}`).toBe(situation(state, side));
    }
  });

  it('every text stays ASCII and within the section / total limits on the largest hand (RK-7)', () => {
    // All deck cards in the Empire's hand: a list of 25+ systems is cut with "(+N more)".
    const cards = state.cards;
    if (cards === undefined) throw new Error('cards expected');
    const all = [...zone(state, 'empire-probes'), ...zone(state, 'probe-deck')];
    const big: CoreGameState = {
      ...state,
      cards: {
        ...cards,
        pile: {
          ...cards.pile,
          zones: cards.pile.zones.map((z) =>
            z.id === 'empire-probes'
              ? { ...z, cards: all }
              : z.id === 'probe-deck'
                ? { ...z, cards: [] }
                : z,
          ),
        },
      },
    };
    const text = situation(big, 'empire');
    const line = probeLine(text) ?? '';
    expect(line).toMatch(/\(\+\d+ more\)\. Probe deck: 0 cards left\.$/);
    expect(line.length).toBeLessThanOrEqual(600);
    expect(text.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.situation);
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
  });
});
