/**
 * SWR-010 W3 — Refresh step 3: the Empire draws probe cards (plan-backend §3.5; D-7, AC-6, A-6, A-8, AC-16 R2;
 * TC-RF-01..05) + replay determinism (AC-17, TC-RP-02 at the rules level).
 */
import { describe, expect, it } from 'vitest';
import { checkCardInvariants } from '@bga/platform/cards';
import {
  CoreGameStateV3Schema,
  rebellionCardEngineContext,
  type CoreGameState,
} from '../../../src/schema';
import { toSideView } from '../../../src/rules';
import { drawProbeCards } from '../../../src/rules/core/cards';
import {
  DIG_EMP,
  DIG_REB,
  HOT_SEAT,
  definitionsIn,
  newGame,
  passRound,
  rounds,
  step,
  zone,
} from './cards-helpers';

function legacy(state: CoreGameState): CoreGameState {
  const { cards: _cards, table: _table, ...rest } = state;
  return rest;
}

describe('Refresh step 3 (AC-6)', () => {
  it('TC-RF-01: the two TOP deck cards go to the Empire; event between LEADERS_RETURNED and TIME_ADVANCED', () => {
    const before = newGame(DIG_REB, 'rf-1');
    const top2 = zone(before, 'probe-deck').slice(0, 2);
    const { state, events } = passRound(before);
    expect(zone(state, 'empire-probes')).toEqual(top2);
    expect(zone(state, 'probe-deck')).toEqual(zone(before, 'probe-deck').slice(2));
    expect(state.round).toBe(before.round + 1);
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'PASSED',
      'PASSED',
      'PHASE_STARTED',
      'LEADERS_RETURNED',
      'CARDS_DRAWN',
      'TIME_ADVANCED',
      'PHASE_STARTED',
      'PHASE_STARTED',
    ]);
    const drawn = events.find((e) => e.type === 'CARDS_DRAWN');
    expect(drawn).toMatchObject({
      actor: 'system',
      payload: {
        side: 'empire',
        fromZoneId: 'probe-deck',
        toZoneId: 'empire-probes',
        count: 2,
        definitionIds: definitionsIn(state, 'empire-probes'),
      },
    });
    expect(checkCardInvariants(state.cards!.pile, rebellionCardEngineContext)).toEqual([]);
    expect(CoreGameStateV3Schema.safeParse(state).success).toBe(true);
  });

  it('TC-RF-02: 3 Refreshes → hand 6, deck 19, draw order = deck order', () => {
    const before = newGame(DIG_EMP, 'rf-2');
    const after = rounds(before, 3);
    expect(zone(after, 'empire-probes')).toEqual(zone(before, 'probe-deck').slice(0, 6));
    expect(zone(after, 'probe-deck')).toHaveLength(19);
  });

  it('TC-RF-03 (A-8): 1 card left → draws 1; empty deck → draws 0, no event, no error', () => {
    const base = newGame(DIG_REB, 'rf-3');
    const deck = zone(base, 'probe-deck');
    const withDeck = (n: number): CoreGameState => ({
      ...base,
      cards: {
        ...base.cards!,
        pile: {
          ...base.cards!.pile,
          zones: base.cards!.pile.zones.map((z) =>
            z.id === 'probe-deck'
              ? { ...z, cards: deck.slice(0, n) }
              : z.id === 'empire-probes'
                ? { ...z, cards: deck.slice(n) }
                : z,
          ),
        },
      },
    });
    const one = passRound(withDeck(1));
    expect(zone(one.state, 'probe-deck')).toEqual([]);
    expect(zone(one.state, 'empire-probes')).toHaveLength(25);
    expect(one.events.find((e) => e.type === 'CARDS_DRAWN')).toMatchObject({
      payload: { count: 1, definitionIds: [definitionsIn(withDeck(1), 'probe-deck')[0]] },
    });
    const zero = passRound(withDeck(0));
    expect(zero.events.some((e) => e.type === 'CARDS_DRAWN')).toBe(false);
    expect(zero.state.cards).toEqual(withDeck(0).cards);
    expect(zero.events.map((e) => e.type)).toContain('TIME_ADVANCED');
  });

  it('TC-RF-04 / R2: a legacy state (no cards) draws nothing; the card field never appears', () => {
    const old = legacy(newGame(DIG_REB, 'rf-4'));
    const { state, events } = passRound(old);
    expect(events.some((e) => e.type === 'CARDS_DRAWN')).toBe(false);
    expect('cards' in state).toBe(false);
    expect('table' in state).toBe(false);
    expect(events.map((e) => e.type)).toEqual([
      'PASSED',
      'PASSED',
      'PHASE_STARTED',
      'LEADERS_RETURNED',
      'TIME_ADVANCED',
      'PHASE_STARTED',
      'PHASE_STARTED',
    ]);
    const view = toSideView(state, 'rebels');
    expect(view.kind === 'player' && view.cards).toBeNull();
    expect(view.kind === 'player' && view.table).toBeNull();
    // drawProbeCards itself: no-op without cards (same object)
    const t = { state: old, drafts: [] };
    expect(drawProbeCards(t)).toBe(t);
  });

  it('TC-RF-05: one pass is not a Refresh — nothing drawn', () => {
    const before = newGame(DIG_REB, 'rf-5');
    const { state, events } = step(before, { actor: 'rebels', command: { type: 'PASS' } });
    expect(events.some((e) => e.type === 'CARDS_DRAWN')).toBe(false);
    expect(state.cards).toEqual(before.cards);
  });

  it('the input state is never mutated by the draw', () => {
    const before = newGame(HOT_SEAT, 'rf-6');
    const frozen = JSON.stringify(before);
    drawProbeCards({ state: before, drafts: [] });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('determinism (AC-17): the same 13 rounds twice → byte-identical states and logs', () => {
    const a = rounds(newGame(DIG_REB, 'rp-1'), 13);
    const b = rounds(newGame(DIG_REB, 'rp-1'), 13);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    expect(zone(a, 'probe-deck')).toEqual([]);
    expect(zone(a, 'empire-probes')).toHaveLength(25);
  });
});
