/**
 * SWR-010 W3 — deck initialisation at creation (plan-backend §3.4, AC-4; TC-INIT-01..07).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCardInvariants } from '@bga/platform/cards';
import {
  CoreGameStateV3Schema,
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  PROBE_SYSTEM_IDS,
  eligibleRebelBaseSystemIds,
  probeInstanceId,
  rebellionCardEngineContext,
} from '../../../src/schema';
import { chooseRebelBase } from '../../../src/rules';
import { initCoreCards } from '../../../src/rules/core';
import { coreDataBaseV1 } from '../../../src/scenario';
import { newCore } from './helpers';
import { DIG_EMP, DIG_REB, HOT_SEAT, PHY_EMP, PHY_REB, newGame, zone } from './cards-helpers';

const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);
const BOX = FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS.map((id) => probeInstanceId(id));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initCoreCards in createCoreGame (AC-4)', () => {
  it.each([
    ['digital, Rebels vs AI', DIG_REB],
    ['digital, Empire vs AI', DIG_EMP],
    ['hot-seat', HOT_SEAT],
    ['physical, human Empire', PHY_EMP],
  ] as const)('TC-INIT-01 %s: box 5, Location = base card, deck 25, Empire hand 0', (_, s) => {
    const state = newGame(s, 'init-1');
    expect(state.cards?.catalogId).toBe('rebellion-cards-v1');
    expect(state.cards?.pile.instances).toHaveLength(31);
    expect([...zone(state, 'probe-box')].sort()).toEqual([...BOX].sort());
    expect(zone(state, 'rebels-location')).toEqual([probeInstanceId(state.rebelBase.systemId)]);
    expect(zone(state, 'probe-deck')).toHaveLength(25);
    expect(zone(state, 'empire-probes')).toEqual([]);
    expect(zone(state, 'rebels-base-revealed')).toEqual([]);
    expect(checkCardInvariants(state.cards!.pile, rebellionCardEngineContext)).toEqual([]);
    // every instance exactly once
    const all = state.cards!.pile.zones.flatMap((z) => z.cards);
    expect(new Set(all).size).toBe(31);
    expect(CoreGameStateV3Schema.safeParse(state).success).toBe(true);
  });

  it('zones keep the layout order; authority digital everywhere outside physical Rebels', () => {
    for (const s of [DIG_REB, DIG_EMP, HOT_SEAT, PHY_EMP]) {
      const state = newGame(s, 'init-auth');
      expect(state.cards!.pile.zones.map((z) => [z.id, z.authority])).toEqual([
        ['probe-deck', 'digital'],
        ['probe-box', 'digital'],
        ['rebels-location', 'digital'],
        ['rebels-base-revealed', 'digital'],
        ['empire-probes', 'digital'],
      ]);
    }
  });

  it('TC-INIT-07: physical_companion + human Rebels → Location empty and physical, deck 26 (base card inside)', () => {
    const state = newGame(PHY_REB, 'init-phy');
    expect(zone(state, 'rebels-location')).toEqual([]);
    const deck = zone(state, 'probe-deck');
    expect(deck).toHaveLength(26);
    expect(deck).toContain(probeInstanceId(state.rebelBase.systemId));
    expect(state.cards!.pile.zones.find((z) => z.id === 'rebels-location')?.authority).toBe(
      'physical',
    );
    expect(state.rebelBase.revealed).toBe(false);
    // the provisional base is the usual choice (AQ-4)
    expect(state.rebelBase.systemId).toBe(chooseRebelBase('init-phy', ELIGIBLE));
    // the creation log is unchanged (no card events)
    expect(state.log.map((e) => e.type)).toEqual([
      'GAME_CREATED',
      'PHASE_STARTED',
      'PHASE_STARTED',
    ]);
  });

  it('TC-INIT-02: the base is still chooseRebelBase(gameId, eligible) for 20 fixed ids', () => {
    for (let i = 0; i < 20; i += 1) {
      const id = `fixed-${i}`;
      const state = newGame(DIG_REB, id);
      expect(state.rebelBase.systemId, id).toBe(chooseRebelBase(id, ELIGIBLE));
      expect(zone(state, 'rebels-location')).toEqual([probeInstanceId(state.rebelBase.systemId)]);
    }
  });

  it('TC-INIT-03: same input → byte-identical state (deck order and instance ids included)', () => {
    expect(JSON.stringify(newGame(DIG_REB, 'det-1'))).toBe(
      JSON.stringify(newGame(DIG_REB, 'det-1')),
    );
    expect(JSON.stringify(newGame(PHY_REB, 'det-1'))).toBe(
      JSON.stringify(newGame(PHY_REB, 'det-1')),
    );
  });

  it('TC-INIT-04: no global RNG / clock is used', () => {
    const expected = JSON.stringify(newGame(DIG_EMP, 'det-2'));
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random used');
    });
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now used');
    });
    expect(JSON.stringify(newGame(DIG_EMP, 'det-2'))).toBe(expected);
  });

  it('TC-INIT-05: the deck order depends on the game id (50 ids → ≥ 45 orders), multiset = 31 − box − Location', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const state = newGame(DIG_REB, `order-${i}`);
      const deck = zone(state, 'probe-deck');
      orders.add(deck.join(','));
      const expected = PROBE_SYSTEM_IDS.map((id) => probeInstanceId(id)).filter(
        (id) => !BOX.includes(id) && id !== probeInstanceId(state.rebelBase.systemId),
      );
      expect([...deck].sort()).toEqual([...expected].sort());
    }
    expect(orders.size).toBeGreaterThanOrEqual(45);
  });

  it('the shuffle seed is `<gameId>|probe-deck|init` (initCoreCards = createCoreGame)', () => {
    const state = newGame(DIG_REB, 'seed-check');
    const direct = initCoreCards({
      gameId: 'seed-check',
      settings: DIG_REB,
      baseSystemId: state.rebelBase.systemId,
      registrationPending: false,
    });
    expect(direct).toEqual(state.cards);
  });

  it('initCoreCards rejects a base without a probe card / a first-game-removed base (programming error)', () => {
    const args = { gameId: 'x', settings: DIG_REB, registrationPending: false };
    expect(() => initCoreCards({ ...args, baseSystemId: 'coruscant' })).toThrow();
    expect(() => initCoreCards({ ...args, baseSystemId: 'corellia' })).toThrow();
  });

  it('TC-INIT-06: a map other than the base-game map tracks no cards (mini data: as before SWR-010)', () => {
    const state = newCore();
    expect('cards' in state).toBe(false);
    expect('table' in state).toBe(false);
  });
});
