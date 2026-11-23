/**
 * SWR-010 FE-A (plan-frontend §4.1, §10, §11.1): hand model classification, the card fixtures (schema + no opponent
 * cards in the JSON) and the Card Hand UI store.
 */
import {
  PlayerViewSchema,
  REBELLION_CARD_ZONES,
  type PlayerViewCore,
} from '@bga/game-rebellion/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cardsView,
  makeEmpireGameOverCardsView,
  makeEmpireRevealedView,
  makeEmpireWithProbesView,
  makeRebelsDigitalCardsView,
  makeRebelsPhysicalUnregisteredView,
} from '../../../test/cardFixtures';
import { CORE_HOT_SEAT, CORE_SESSION_ID, makeCoreView } from '../../../test/coreFixtures';
import { resetCardUiStore, useCardUiStore } from './cardUiStore';
import { handModel, visibleCards } from './handModel';

const FIXTURES: [string, () => PlayerViewCore][] = [
  ['rebels digital', () => makeRebelsDigitalCardsView()],
  ['empire with probes', () => makeEmpireWithProbesView()],
  ['empire revealed', () => makeEmpireRevealedView()],
  ['rebels physical unregistered', () => makeRebelsPhysicalUnregisteredView()],
  ['empire game over', () => makeEmpireGameOverCardsView()],
];

describe('card fixtures (plan-frontend §10)', () => {
  it.each(FIXTURES)('%s parses with PlayerViewSchema and lists every zone in order', (_, make) => {
    const view = make();
    const parsed = PlayerViewSchema.safeParse(view);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(view.cards?.zones.map((z) => z.id)).toEqual(REBELLION_CARD_ZONES.map((z) => z.id));
  });

  it('the opponent cards never appear in the JSON of a view (hidden zones are counts only)', () => {
    const rebels = JSON.stringify(makeRebelsDigitalCardsView().cards);
    expect(rebels).not.toContain('probe-hoth');
    expect(rebels).not.toContain('probe-endor');
    const empire = JSON.stringify(makeEmpireWithProbesView().cards);
    expect(empire).not.toContain('probe-yavin');
    for (const view of [makeRebelsDigitalCardsView(), makeEmpireWithProbesView()]) {
      expect(view.cards?.zones.find((z) => z.id === 'probe-deck')?.cards).toBeNull();
    }
  });
});

describe('handModel (plan-frontend §4.1)', () => {
  it('legacy game (cards: null) → tracked false, nothing else', () => {
    const m = handModel(makeCoreView());
    expect(m.tracked).toBe(false);
    expect(m.own).toEqual([]);
    expect(m.opponent).toEqual([]);
    expect(m.deck).toBeNull();
  });

  it('human Rebels: own Location (Yavin); Empire probes are a count; deck is a count; removed are public', () => {
    const m = handModel(makeRebelsDigitalCardsView());
    expect(m.tracked).toBe(true);
    expect(m.viewer).toBe('rebels');
    expect(m.own.map((z) => z.id)).toEqual(['rebels-location', 'rebels-base-revealed']);
    expect(m.own[0]?.cards?.map((c) => c.definitionId)).toEqual(['probe-yavin']);
    expect(m.opponent.map((z) => [z.id, z.count, z.cards])).toEqual([['empire-probes', 2, null]]);
    expect(m.deck?.cards).toBeNull();
    expect(m.deck?.count).toBe(31 - 5 - 1 - 2);
    expect(m.removed?.cards).toHaveLength(5);
    expect(m.locationState).toBe('registered');
    expect(m.deferredTypeIds).toHaveLength(5);
  });

  it('human Empire: own probes, the Location of the Rebels is a count only', () => {
    const m = handModel(makeEmpireWithProbesView(['hoth', 'endor']));
    expect(m.own.map((z) => z.id)).toEqual(['empire-probes']);
    expect(m.own[0]?.cards?.map((c) => c.definitionId)).toEqual(['probe-endor', 'probe-hoth']);
    const location = m.opponent.find((z) => z.id === 'rebels-location');
    expect(location?.count).toBe(1);
    expect(location?.cards).toBeNull();
    expect(m.locationState).toBe('none');
    expect(visibleCards(m).map((c) => c.definitionId)).not.toContain('probe-yavin');
  });

  it('human Empire after the reveal: the base card is visible in the public revealed zone', () => {
    const m = handModel(makeEmpireRevealedView());
    const revealed = m.opponent.find((z) => z.id === 'rebels-base-revealed');
    expect(revealed?.cards?.map((c) => c.definitionId)).toEqual(['probe-yavin']);
    expect(m.locationState).toBe('revealed');
  });

  it('physical, before the registration → notRegistered; the Location is empty and physical', () => {
    const m = handModel(makeRebelsPhysicalUnregisteredView());
    expect(m.locationState).toBe('notRegistered');
    const location = m.own.find((z) => z.id === 'rebels-location');
    expect(location?.count).toBe(0);
    expect(location?.authority).toBe('physical');
  });

  it('hot-seat: the viewer decides own / opponent', () => {
    const asEmpire = makeCoreView({
      settings: { ...CORE_HOT_SEAT },
      viewer: 'empire',
      cards: cardsView('empire', { empireProbes: ['hoth'] }),
    });
    expect(handModel(asEmpire).own.map((z) => z.id)).toEqual(['empire-probes']);
  });
});

describe('cardUiStore (plan-frontend §3.1)', () => {
  beforeEach(() => resetCardUiStore());

  it('a new session drops the selection; a still-visible card stays selected', () => {
    const view = makeRebelsDigitalCardsView();
    const store = useCardUiStore.getState();
    store.reconcile(view, CORE_SESSION_ID);
    store.select('probe-yavin', 'rebels-location');
    useCardUiStore.getState().reconcile(view, CORE_SESSION_ID);
    expect(useCardUiStore.getState().selected).toEqual({
      definitionId: 'probe-yavin',
      zoneId: 'rebels-location',
    });
    useCardUiStore.getState().reconcile(view, 'other-session');
    expect(useCardUiStore.getState().selected).toBeNull();
  });

  it('a card that moved (base revealed) or is no longer visible (viewer switch) is dropped', () => {
    useCardUiStore.getState().reconcile(makeRebelsDigitalCardsView(), CORE_SESSION_ID);
    useCardUiStore.getState().select('probe-yavin', 'rebels-location');
    useCardUiStore
      .getState()
      .reconcile(makeCoreView({ cards: cardsView('rebels', { revealed: true }) }), CORE_SESSION_ID);
    expect(useCardUiStore.getState().selected).toBeNull();
    useCardUiStore.getState().select('probe-yavin', 'rebels-location');
    useCardUiStore.getState().reconcile(makeEmpireWithProbesView(), CORE_SESSION_ID);
    expect(useCardUiStore.getState().selected).toBeNull();
  });
});
