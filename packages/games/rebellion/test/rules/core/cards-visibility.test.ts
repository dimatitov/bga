/**
 * SWR-010 W3 — card projections (plan-backend §4.2, §6, §10.1 "view" row; AC-7, AC-8, AC-9, AC-15;
 * TC-VIS-01..06, TC-VIS-09 at the rules level). Leak checks search the serialized JSON of the whole side view.
 */
import { describe, expect, it } from 'vitest';
import {
  CorePlayerViewSchema,
  eligibleRebelBaseSystemIds,
  type CoreGameState,
  type CorePlayerView,
  type Faction,
} from '../../../src/schema';
import { toSideView } from '../../../src/rules';
import { coreCardsView, corePublicCardsView, coreSideView } from '../../../src/rules/core';
import { coreDataBaseV1 } from '../../../src/scenario';
import {
  DIG_EMP,
  DIG_REB,
  HOT_SEAT,
  PHY_EMP,
  PHY_REB,
  containsToken,
  newGame,
  passRound,
  permuteDeck,
  relocateBase,
  rounds,
  secretTokens,
  step,
  swapHand,
} from './cards-helpers';

const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);

function board(state: CoreGameState, viewer: Faction): CorePlayerView {
  const view = toSideView(state, viewer);
  if (view.kind !== 'player' || view.rulesEngine !== 'core-v1') throw new Error('core board');
  return CorePlayerViewSchema.parse(view);
}

function zoneView(view: CorePlayerView, id: string) {
  const z = view.cards?.zones.find((x) => x.id === id);
  if (!z) throw new Error(`no zone ${id}`);
  return z;
}

function expectNoTokens(json: string, tokens: readonly string[], label: string): void {
  for (const t of tokens) expect(containsToken(json, t), `${label}: ${t}`).toBe(false);
}

describe('side views of the cards (AC-7, AC-8)', () => {
  const afterRefresh = passRound(newGame(DIG_REB, 'vis-1')).state;

  it('TC-VIS-01: the Empire sees its 2 probes, the deck and the Location as counts, the box publicly', () => {
    const view = board(afterRefresh, 'empire');
    expect(view.cards?.catalogId).toBe('rebellion-cards-v1');
    expect(view.cards?.zones.map((z) => z.id)).toEqual([
      'probe-deck',
      'probe-box',
      'rebels-location',
      'rebels-base-revealed',
      'empire-probes',
    ]);
    expect(zoneView(view, 'empire-probes').cards).toHaveLength(2);
    expect(zoneView(view, 'probe-deck')).toMatchObject({ count: 23, cards: null });
    expect(zoneView(view, 'rebels-location')).toMatchObject({ count: 1, cards: null });
    expect(zoneView(view, 'probe-box').cards).toHaveLength(5);
  });

  it('TC-VIS-02: the Rebels see their Location, the Empire hand and the deck as counts', () => {
    const view = board(afterRefresh, 'rebels');
    expect(zoneView(view, 'rebels-location').cards).toEqual([
      {
        instanceId: `probe-${afterRefresh.rebelBase.systemId}#1`,
        definitionId: `probe-${afterRefresh.rebelBase.systemId}`,
      },
    ]);
    expect(zoneView(view, 'empire-probes')).toMatchObject({ count: 2, cards: null });
    expect(zoneView(view, 'probe-deck')).toMatchObject({ count: 23, cards: null });
  });

  it('S2/S4/S1 tokens: none in the JSON of the side views (whole view: log, legal actions…)', () => {
    const rebels = JSON.stringify(board(afterRefresh, 'rebels'));
    const empire = JSON.stringify(board(afterRefresh, 'empire'));
    expectNoTokens(rebels, secretTokens(afterRefresh, 'empire-probes'), 'rebels/S2');
    expectNoTokens(rebels, secretTokens(afterRefresh, 'probe-deck'), 'rebels/S4');
    expectNoTokens(empire, secretTokens(afterRefresh, 'probe-deck'), 'empire/S4');
    expectNoTokens(empire, secretTokens(afterRefresh, 'rebels-location'), 'empire/S1');
    // positive controls: the search finds the owner's own cards
    for (const t of secretTokens(afterRefresh, 'empire-probes'))
      expect(containsToken(empire, t)).toBe(true);
    for (const t of secretTokens(afterRefresh, 'rebels-location'))
      expect(containsToken(rebels, t)).toBe(true);
  });

  it('TC-VIS-04 (AC-8): 10 deck permutations → identical views for both sides', () => {
    for (const s of [afterRefresh, rounds(newGame(DIG_EMP, 'vis-4'), 3)]) {
      const ref = {
        rebels: JSON.stringify(board(s, 'rebels')),
        empire: JSON.stringify(board(s, 'empire')),
      };
      for (let k = 1; k <= 10; k += 1) {
        const p = permuteDeck(s, k);
        expect(JSON.stringify(board(p, 'rebels')), `k=${k}`).toBe(ref.rebels);
        expect(JSON.stringify(board(p, 'empire')), `k=${k}`).toBe(ref.empire);
      }
    }
  });

  it('swapHand: the Rebels view does not depend on which probes the Empire holds (S2)', () => {
    const s = rounds(newGame(DIG_REB, 'vis-5'), 2);
    expect(JSON.stringify(board(swapHand(s), 'rebels'))).toBe(JSON.stringify(board(s, 'rebels')));
    // …while the Empire's own view changes (sanity: the transform is not trivial)
    expect(JSON.stringify(board(swapHand(s), 'empire'))).not.toBe(
      JSON.stringify(board(s, 'empire')),
    );
  });

  it('S1/AC-15: before the first Refresh the Empire view is invariant to the base (Location swapped with the deck)', () => {
    for (const settings of [DIG_EMP, DIG_REB, HOT_SEAT, PHY_EMP]) {
      const s = newGame(settings, 'vis-6');
      const ref = JSON.stringify(board(s, 'empire'));
      let compared = 0;
      for (const to of ELIGIBLE) {
        if (to === s.rebelBase.systemId) continue;
        expect(JSON.stringify(board(relocateBase(s, to), 'empire')), to).toBe(ref);
        compared += 1;
      }
      expect(compared).toBe(ELIGIBLE.length - 1);
    }
  });

  it('TC-VIS-05 (AC-9): the public projection lists only public zones and is contained in every side view', () => {
    const s = rounds(newGame(DIG_REB, 'vis-7'), 2);
    const pub = corePublicCardsView(s)!;
    for (const z of pub.zones) {
      if (z.visibility !== 'public') expect(z.cards, z.id).toBeNull();
    }
    for (const viewer of ['rebels', 'empire'] as const) {
      const side = coreCardsView(s, viewer)!;
      for (const [i, z] of pub.zones.entries()) {
        const own = side.zones[i]!;
        expect(own.id).toBe(z.id);
        expect(own.count).toBe(z.count);
        if (z.cards !== null) expect(own.cards).toEqual(z.cards);
      }
    }
  });

  it('the AI side view uses the same projection (other viewer); legacy / mini states → cards null', () => {
    const s = passRound(newGame(DIG_REB, 'vis-8')).state;
    expect(coreSideView(s, 'empire').cards).toEqual(coreCardsView(s, 'empire'));
    const { cards: _c, ...legacy } = s;
    expect(coreSideView(legacy, 'rebels').cards).toBeNull();
    expect(corePublicCardsView(legacy)).toBeNull();
  });

  it('physical games: the human view carries the card zones; the AI view has no table', () => {
    for (const settings of [PHY_REB, PHY_EMP]) {
      const s = newGame(settings, 'vis-9');
      const human = settings.playerFaction;
      const ai = settings.opponentFaction;
      expect(board(s, human).cards).not.toBeNull();
      expect(coreSideView(s, ai).table).toBeNull();
    }
    // pending registration: the AI Empire sees an empty Location and 26 cards in the deck
    const pending = coreCardsView(newGame(PHY_REB, 'vis-10'), 'empire')!;
    expect(pending.zones.find((z) => z.id === 'rebels-location')).toMatchObject({ count: 0 });
    expect(pending.zones.find((z) => z.id === 'probe-deck')).toMatchObject({
      count: 26,
      cards: null,
    });
  });

  it('TC-VIS-09 (rules level): over whole games no step leaks S2 to the Rebels, S4 to anybody, S1 to the Empire', () => {
    for (const [settings, id] of [
      [DIG_REB, 'vis-g1'],
      [DIG_EMP, 'vis-g2'],
      [HOT_SEAT, 'vis-g3'],
    ] as const) {
      let s = newGame(settings, id);
      while (s.outcome === null) {
        const rebels = JSON.stringify(board(s, 'rebels'));
        const empire = JSON.stringify(board(s, 'empire'));
        expectNoTokens(rebels, secretTokens(s, 'empire-probes'), `${id} r${s.round} rebels/S2`);
        expectNoTokens(rebels, secretTokens(s, 'probe-deck'), `${id} r${s.round} rebels/S4`);
        expectNoTokens(empire, secretTokens(s, 'probe-deck'), `${id} r${s.round} empire/S4`);
        expectNoTokens(empire, secretTokens(s, 'rebels-location'), `${id} r${s.round} empire/S1`);
        for (const v of [board(s, 'rebels'), board(s, 'empire')]) {
          expect(zoneView(v, 'probe-deck').cards).toBeNull();
        }
        s = settings === HOT_SEAT ? hotSeatRound(s) : passRound(s).state;
      }
    }
  });
});

/** Hot-seat round: pass, accept the handoff, pass (→ Refresh), accept the handoff back if pending. */
function hotSeatRound(state: CoreGameState): CoreGameState {
  let s = state;
  let passes = 0;
  while (passes < 2 && s.outcome === null) {
    const actor = s.activeSide;
    if (s.handoffPending) {
      s = applyOne(s, actor, { type: 'ACCEPT_HANDOFF' });
      continue;
    }
    s = applyOne(s, actor, { type: 'PASS' });
    passes += 1;
  }
  if (s.handoffPending && s.outcome === null)
    s = applyOne(s, s.activeSide, { type: 'ACCEPT_HANDOFF' });
  return s;
}

function applyOne(
  s: CoreGameState,
  actor: Faction,
  command: { type: 'PASS' } | { type: 'ACCEPT_HANDOFF' },
) {
  return step(s, { actor, command }).state;
}
