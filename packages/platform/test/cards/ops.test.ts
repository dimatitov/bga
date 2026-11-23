// SWR-010 TC-DECK-01..08, TC-DECK-11, TC-DECK-13 (AC-5, AC-17): deck engine operations are pure, check zone
// mechanics and return typed errors without touching the input.
import { describe, expect, it } from 'vitest';
import {
  checkCardInvariants,
  createPile,
  discardCard,
  drawCards,
  moveCard,
  playCard,
  registerCard,
  restorePile,
  returnCard,
  revealCard,
  shuffleZone,
  type CardEngineContext,
  type CardPile,
  type CardResult,
  type MoveCardArgs,
} from '../../src/cards';
import {
  ALL_INSTANCES,
  CTX,
  LAYOUT,
  ORDERS,
  SCOUTS,
  authority,
  basePile,
  cardsOf,
  deepFreeze,
  expectOk,
  placedIds,
} from './fixture';

/** Runs `op` on a deep-frozen copy and checks that the input is unchanged (same JSON) afterwards. */
function pure(pile: CardPile, op: (p: CardPile) => CardResult): CardResult {
  const frozen = deepFreeze(structuredClone(pile));
  const before = JSON.stringify(frozen);
  const result = op(frozen);
  expect(JSON.stringify(frozen)).toBe(before);
  if (result.ok) {
    expect(result.pile).not.toBe(frozen);
    expect(checkCardInvariants(result.pile, CTX)).toEqual([]);
    expect(placedIds(result.pile)).toEqual(placedIds(pile));
  }
  return result;
}

function errorOf(result: CardResult): unknown {
  return result.ok ? { ok: true } : result.error;
}

describe('TC-DECK-01: create → shuffle → draw 3 → discard 1', () => {
  it('moves the top 3 in order, keeps invariants', () => {
    const created = basePile();
    expect(cardsOf(created, 'draw')).toEqual(SCOUTS.map((s) => s.id));
    expect(created.zones.map((z) => z.id)).toEqual(LAYOUT.map((z) => z.id));
    const shuffled = expectOk(pure(created, (p) => shuffleZone(p, CTX, 'draw', 'seed-1')));
    const deck = cardsOf(shuffled, 'draw');
    expect([...deck].sort()).toEqual(SCOUTS.map((s) => s.id).sort());

    const draw = pure(shuffled, (p) =>
      drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 3, allowShort: false }),
    );
    const drawn = expectOk(draw);
    expect(draw.ok && draw.moved).toEqual(deck.slice(0, 3));
    expect(cardsOf(drawn, 'draw')).toEqual(deck.slice(3));
    expect(cardsOf(drawn, 'hand-alpha')).toEqual(deck.slice(0, 3));

    const discarded = expectOk(
      pure(drawn, (p) =>
        discardCard(p, CTX, { instanceId: deck[1] as string, from: 'hand-alpha', to: 'discard' }),
      ),
    );
    expect(cardsOf(discarded, 'draw')).toHaveLength(7);
    expect(cardsOf(discarded, 'hand-alpha')).toEqual([deck[0], deck[2]]);
    expect(cardsOf(discarded, 'discard')).toEqual([deck[1]]);
    expect(checkCardInvariants(discarded, CTX)).toEqual([]);
  });
});

describe('TC-DECK-02: move / play / reveal / return move exactly one instance to the expected position', () => {
  const start = expectOk(
    drawCards(basePile(), CTX, { from: 'draw', to: 'hand-alpha', count: 3, allowShort: false }),
  );
  // draw: d..j; hand-alpha: a, b, c

  it('moveCard appends to an unordered zone', () => {
    const r = pure(start, (p) =>
      moveCard(p, CTX, { instanceId: 'card-b#1', from: 'hand-alpha', to: 'hand-beta' }),
    );
    const pile = expectOk(r);
    expect(r.ok && r.moved).toEqual(['card-b#1']);
    expect(cardsOf(pile, 'hand-alpha')).toEqual(['card-a#1', 'card-c#1']);
    expect(cardsOf(pile, 'hand-beta')).toEqual(['card-b#1']);
  });

  it("'top' is honoured only by an ordered destination", () => {
    const onUnordered = expectOk(
      pure(start, (p) =>
        moveCard(p, CTX, {
          instanceId: 'card-d#1',
          from: 'draw',
          to: 'hand-alpha',
          position: 'top',
        }),
      ),
    );
    expect(cardsOf(onUnordered, 'hand-alpha')).toEqual([
      'card-a#1',
      'card-b#1',
      'card-c#1',
      'card-d#1',
    ]);
  });

  it('playCard → inPlay, revealCard → revealed, discardCard → discard', () => {
    const played = expectOk(
      pure(start, (p) =>
        playCard(p, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'table' }),
      ),
    );
    expect(cardsOf(played, 'table')).toEqual(['card-a#1']);
    const shown = expectOk(
      pure(played, (p) =>
        revealCard(p, CTX, { instanceId: 'card-b#1', from: 'hand-alpha', to: 'shown' }),
      ),
    );
    expect(cardsOf(shown, 'shown')).toEqual(['card-b#1']);
    const binned = expectOk(
      pure(shown, (p) =>
        discardCard(p, CTX, { instanceId: 'card-a#1', from: 'table', to: 'discard' }),
      ),
    );
    expect(cardsOf(binned, 'discard')).toEqual(['card-a#1']);
    expect(cardsOf(binned, 'table')).toEqual([]);
  });

  it('returnCard to the top / bottom (default) of a deck; a reshuffle is a separate shuffleZone', () => {
    const top = expectOk(
      pure(start, (p) =>
        returnCard(p, CTX, {
          instanceId: 'card-c#1',
          from: 'hand-alpha',
          to: 'draw',
          position: 'top',
        }),
      ),
    );
    expect(cardsOf(top, 'draw')[0]).toBe('card-c#1');
    const bottom = expectOk(
      pure(start, (p) =>
        returnCard(p, CTX, { instanceId: 'card-c#1', from: 'hand-alpha', to: 'draw' }),
      ),
    );
    expect(cardsOf(bottom, 'draw').at(-1)).toBe('card-c#1');
    const reshuffled = expectOk(pure(bottom, (p) => shuffleZone(p, CTX, 'draw', 'again')));
    expect([...cardsOf(reshuffled, 'draw')].sort()).toEqual([...cardsOf(bottom, 'draw')].sort());
  });

  it('drawCards with count 0 is a no-op result (new value)', () => {
    const r = pure(start, (p) =>
      drawCards(p, CTX, { from: 'draw', to: 'hand-beta', count: 0, allowShort: false }),
    );
    expect(r.ok && r.moved).toEqual([]);
    expect(expectOk(r)).toEqual(start);
  });

  it('registerCard takes the instance of a definition from any position into a physical zone', () => {
    const physical = basePile({ secret: 'physical' });
    const r = pure(physical, (p) =>
      registerCard(p, CTX, { definitionId: 'card-f', from: 'draw', to: 'secret' }),
    );
    const pile = expectOk(r);
    expect(r.ok && r.moved).toEqual(['card-f#1']);
    expect(cardsOf(pile, 'secret')).toEqual(['card-f#1']);
    expect(cardsOf(pile, 'draw')).not.toContain('card-f#1');
    expect(cardsOf(pile, 'draw')).toHaveLength(9);
  });
});

describe('TC-DECK-03: drawing from a short or empty deck', () => {
  const empty = expectOk(
    drawCards(basePile(), CTX, { from: 'draw', to: 'box', count: 10, allowShort: false }),
  );

  it('insufficientCards unless allowShort; allowShort takes what is there', () => {
    expect(
      errorOf(
        pure(basePile(), (p) =>
          drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 11, allowShort: false }),
        ),
      ),
    ).toEqual({
      code: 'insufficientCards',
      zoneId: 'draw',
    });
    expect(
      errorOf(
        pure(empty, (p) =>
          drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 1, allowShort: false }),
        ),
      ),
    ).toEqual({
      code: 'insufficientCards',
      zoneId: 'draw',
    });
    const short = pure(empty, (p) =>
      drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 2, allowShort: true }),
    );
    expect(short.ok && short.moved).toEqual([]);
    const partial = pure(basePile(), (p) =>
      drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 12, allowShort: true }),
    );
    expect(partial.ok && partial.moved).toHaveLength(10);
  });

  it.each([
    [
      { from: 'draw', to: 'hand-alpha', count: -1, allowShort: true },
      { code: 'invalidCount', zoneId: 'draw' },
    ],
    [
      { from: 'draw', to: 'hand-alpha', count: 1.5, allowShort: true },
      { code: 'invalidCount', zoneId: 'draw' },
    ],
    [
      { from: 'draw', to: 'draw', count: 1, allowShort: false },
      { code: 'sameZone', zoneId: 'draw' },
    ],
    [
      { from: 'hand-alpha', to: 'hand-beta', count: 1, allowShort: true },
      { code: 'zoneNotOrdered', zoneId: 'hand-alpha' },
    ],
    [
      { from: 'nowhere', to: 'hand-beta', count: 1, allowShort: true },
      { code: 'unknownZone', zoneId: 'nowhere' },
    ],
    [
      { from: 'draw', to: 'nowhere', count: 1, allowShort: true },
      { code: 'unknownZone', zoneId: 'nowhere' },
    ],
    [
      { from: 'draw', to: 'orders', count: 1, allowShort: false },
      { code: 'typeNotAccepted', zoneId: 'orders', instanceId: 'card-a#1', definitionId: 'card-a' },
    ],
    [
      { from: 'draw', to: 'secret', count: 2, allowShort: false },
      { code: 'zoneFull', zoneId: 'secret' },
    ],
  ])('drawCards %j → %j', (args, error) => {
    expect(errorOf(pure(basePile(), (p) => drawCards(p, CTX, args)))).toEqual(error);
  });
});

describe('TC-DECK-04 / 05 / 06: illegal single-card transitions', () => {
  const pile = expectOk(
    drawCards(basePile(), CTX, { from: 'draw', to: 'hand-alpha', count: 2, allowShort: false }),
  );
  const withSecret = expectOk(
    moveCard(pile, CTX, { instanceId: 'card-c#1', from: 'draw', to: 'secret' }),
  );
  const shown = expectOk(
    revealCard(pile, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'shown' }),
  );

  const cases: [string, CardPile, (p: CardPile) => CardResult, object][] = [
    [
      'DECK-04 card not in the source zone',
      pile,
      (p) => moveCard(p, CTX, { instanceId: 'card-j#1', from: 'hand-alpha', to: 'table' }),
      { code: 'cardNotInZone', zoneId: 'hand-alpha', instanceId: 'card-j#1' },
    ],
    [
      'DECK-04 unknown instance',
      pile,
      (p) => playCard(p, CTX, { instanceId: 'ghost#1', from: 'hand-alpha', to: 'table' }),
      { code: 'unknownCard', instanceId: 'ghost#1' },
    ],
    [
      'DECK-04 discard of a card that is not in hand',
      pile,
      (p) => discardCard(p, CTX, { instanceId: 'card-d#1', from: 'hand-alpha', to: 'discard' }),
      { code: 'cardNotInZone', zoneId: 'hand-alpha', instanceId: 'card-d#1' },
    ],
    [
      'DECK-04 unknown source zone',
      pile,
      (p) => moveCard(p, CTX, { instanceId: 'card-a#1', from: 'void', to: 'table' }),
      { code: 'unknownZone', zoneId: 'void' },
    ],
    [
      'DECK-05 capacity 1',
      withSecret,
      (p) => moveCard(p, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'secret' }),
      { code: 'zoneFull', zoneId: 'secret' },
    ],
    [
      'DECK-05 type not accepted',
      pile,
      (p) => moveCard(p, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'orders' }),
      { code: 'typeNotAccepted', zoneId: 'orders', instanceId: 'card-a#1', definitionId: 'card-a' },
    ],
    [
      'DECK-05 order card into a scout-only hand',
      pile,
      (p) => moveCard(p, CTX, { instanceId: 'card-x#1', from: 'orders', to: 'hand-beta' }),
      {
        code: 'typeNotAccepted',
        zoneId: 'hand-beta',
        instanceId: 'card-x#1',
        definitionId: 'card-x',
      },
    ],
    [
      'DECK-06 reveal of an already revealed card',
      shown,
      (p) => revealCard(p, CTX, { instanceId: 'card-a#1', from: 'shown', to: 'shown' }),
      { code: 'sameZone', zoneId: 'shown' },
    ],
    [
      'DECK-06 return into a non-deck zone',
      pile,
      (p) => returnCard(p, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'discard' }),
      { code: 'wrongZoneKind', zoneId: 'discard' },
    ],
    [
      'DECK-06 play into a hand',
      pile,
      (p) => playCard(p, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'hand-beta' }),
      { code: 'wrongZoneKind', zoneId: 'hand-beta' },
    ],
    [
      'shuffle of an unordered zone',
      pile,
      (p) => shuffleZone(p, CTX, 'hand-alpha', 's'),
      { code: 'zoneNotOrdered', zoneId: 'hand-alpha' },
    ],
    [
      'shuffle of an unknown zone',
      pile,
      (p) => shuffleZone(p, CTX, 'void', 's'),
      { code: 'unknownZone', zoneId: 'void' },
    ],
    [
      'register into a digital zone',
      pile,
      (p) => registerCard(p, CTX, { definitionId: 'card-c', from: 'draw', to: 'secret' }),
      { code: 'notPhysicalZone', zoneId: 'secret' },
    ],
    [
      'register of a definition not in the source',
      basePile({ secret: 'physical' }),
      (p) => registerCard(p, CTX, { definitionId: 'card-x', from: 'draw', to: 'secret' }),
      { code: 'cardNotInZone', zoneId: 'draw', definitionId: 'card-x' },
    ],
    [
      'register into an unknown zone',
      pile,
      (p) => registerCard(p, CTX, { definitionId: 'card-c', from: 'draw', to: 'void' }),
      { code: 'unknownZone', zoneId: 'void' },
    ],
  ];

  it.each(cases)('%s', (_name, input, op, error) => {
    expect(errorOf(pure(input, op))).toEqual(error);
  });

  it('a zone only in the layout (not stored) is unknown', () => {
    const missing: CardPile = { ...pile, zones: pile.zones.filter((z) => z.id !== 'table') };
    expect(
      errorOf(
        pure(missing, (p) =>
          playCard(p, CTX, { instanceId: 'card-a#1', from: 'hand-alpha', to: 'table' }),
        ),
      ),
    ).toEqual({
      code: 'unknownZone',
      zoneId: 'table',
    });
  });
});

describe('TC-DECK-07: createPile rejects broken setups', () => {
  const ok = {
    instances: ALL_INSTANCES,
    placement: { draw: SCOUTS.map((s) => s.id), orders: ORDERS.map((o) => o.id) },
    authority: authority(),
  };
  const deck = SCOUTS.map((s) => s.id);
  const cases: [string, Parameters<typeof createPile>[1], object][] = [
    [
      'duplicate instance id',
      { ...ok, instances: [...ALL_INSTANCES, SCOUTS[0] as (typeof SCOUTS)[0]] },
      { code: 'duplicateInstance', instanceId: 'card-a#1' },
    ],
    [
      'unknown definition',
      { ...ok, instances: [...ALL_INSTANCES, { id: 'ghost#1', definitionId: 'ghost' }] },
      { code: 'unknownCard', instanceId: 'ghost#1', definitionId: 'ghost' },
    ],
    [
      'one instance in two zones',
      { ...ok, placement: { ...ok.placement, box: ['card-a#1'] } },
      { code: 'duplicateInstance', zoneId: 'box', instanceId: 'card-a#1' },
    ],
    [
      'one instance twice in a zone',
      { ...ok, placement: { ...ok.placement, draw: [...deck, 'card-a#1'] } },
      { code: 'duplicateInstance', zoneId: 'draw', instanceId: 'card-a#1' },
    ],
    [
      'placed instance not declared',
      { ...ok, placement: { ...ok.placement, box: ['ghost#1'] } },
      { code: 'unknownCard', zoneId: 'box', instanceId: 'ghost#1' },
    ],
    [
      'declared instance not placed',
      { ...ok, placement: { ...ok.placement, draw: deck.slice(1) } },
      { code: 'cardLost', instanceId: 'card-a#1' },
    ],
    [
      'unknown zone in placement',
      { ...ok, placement: { ...ok.placement, void: [] } },
      { code: 'unknownZone', zoneId: 'void' },
    ],
    [
      'no authority for a layout zone',
      { ...ok, authority: { ...authority(), box: undefined } as never },
      { code: 'unknownZone', zoneId: 'box' },
    ],
    [
      'type not accepted',
      { ...ok, placement: { draw: [...deck, 'card-x#1'], orders: ['card-x#2'] } },
      { code: 'typeNotAccepted', zoneId: 'draw', instanceId: 'card-x#1', definitionId: 'card-x' },
    ],
    [
      'capacity exceeded',
      { ...ok, placement: { ...ok.placement, draw: deck.slice(2), secret: deck.slice(0, 2) } },
      { code: 'zoneFull', zoneId: 'secret' },
    ],
  ];

  it.each(cases)('%s', (_name, input, error) => {
    const frozen = deepFreeze(structuredClone(input));
    expect(errorOf(createPile(CTX, frozen))).toEqual(error);
  });

  it('a valid setup: zones in layout order, authority per zone, input arrays not shared', () => {
    const input = deepFreeze(
      structuredClone({ ...ok, authority: authority({ secret: 'physical' }) }),
    );
    const pile = expectOk(createPile(CTX, input));
    expect(pile.zones.map((z) => [z.id, z.authority])).toEqual(
      LAYOUT.map((z) => [z.id, z.id === 'secret' ? 'physical' : 'digital']),
    );
    expect(cardsOf(pile, 'draw')).not.toBe(input.placement.draw);
    expect(checkCardInvariants(pile, CTX)).toEqual([]);
  });
});

describe('TC-DECK-08: invariants detect each hand-made corruption separately', () => {
  const good = basePile();
  function corrupt(mutate: (p: CardPile) => void): CardPile {
    const copy = structuredClone(good);
    mutate(copy);
    return copy;
  }
  const zone = (p: CardPile, id: string) =>
    p.zones.find((z) => z.id === id) as CardPile['zones'][0];

  it.each<[string, CardPile, object[]]>([
    [
      'instance placed twice',
      corrupt((p) => zone(p, 'box').cards.push('card-a#1')),
      [{ code: 'duplicateInstance', zoneId: 'box', instanceId: 'card-a#1' }],
    ],
    [
      'instance lost',
      corrupt((p) => zone(p, 'draw').cards.shift()),
      [{ code: 'cardLost', instanceId: 'card-a#1' }],
    ],
    [
      'unknown instance placed',
      corrupt((p) => zone(p, 'box').cards.push('ghost#1')),
      [{ code: 'unknownCard', zoneId: 'box', instanceId: 'ghost#1' }],
    ],
    [
      'instance with an unknown definition',
      corrupt((p) => {
        (p.instances[0] as { definitionId: string }).definitionId = 'ghost';
      }),
      [{ code: 'unknownCard', instanceId: 'card-a#1' }],
    ],
    [
      'duplicate declared instance id',
      corrupt((p) => p.instances.push({ id: 'card-a#1', definitionId: 'card-a' })),
      [{ code: 'duplicateInstance', instanceId: 'card-a#1' }],
    ],
    [
      'type not accepted',
      corrupt((p) => {
        zone(p, 'orders').cards.shift();
        zone(p, 'draw').cards.push('card-x#1');
      }),
      [{ code: 'typeNotAccepted', zoneId: 'draw', instanceId: 'card-x#1' }],
    ],
    [
      'over capacity',
      corrupt((p) => {
        zone(p, 'secret').cards.push(...zone(p, 'draw').cards.splice(0, 2));
      }),
      [{ code: 'zoneFull', zoneId: 'secret' }],
    ],
    [
      'missing zone',
      corrupt((p) => {
        p.zones = p.zones.filter((z) => z.id !== 'table');
      }),
      [{ code: 'missingZone', zoneId: 'table' }],
    ],
    [
      'extra zone',
      corrupt((p) => p.zones.push({ id: 'void', authority: 'digital', cards: [] })),
      [{ code: 'extraZone', zoneId: 'void' }],
    ],
    [
      'zone stored twice',
      corrupt((p) => p.zones.push({ id: 'table', authority: 'digital', cards: [] })),
      [{ code: 'extraZone', zoneId: 'table' }],
    ],
  ])('%s', (_name, pile, issues) => {
    expect(checkCardInvariants(good, CTX)).toEqual([]);
    expect(checkCardInvariants(pile, CTX)).toEqual(issues);
  });
});

describe('TC-DECK-11: transition table — wrapper × destination kind (every source/destination pair)', () => {
  const wrappers: [
    string,
    (p: CardPile, c: CardEngineContext, a: MoveCardArgs) => CardResult,
    string | null,
  ][] = [
    ['moveCard', moveCard, null],
    ['playCard', playCard, 'inPlay'],
    ['discardCard', discardCard, 'discard'],
    ['revealCard', revealCard, 'revealed'],
    ['returnCard', returnCard, 'deck'],
  ];
  const sources = LAYOUT.filter((z) => z.acceptsTypeIds.includes('scout'));

  /** The plan's table (§2.2): kind first, then same zone, then the destination policy. */
  function expected(kind: string | null, from: string, to: (typeof LAYOUT)[number]): string {
    if (kind !== null && to.kind !== kind) return 'wrongZoneKind';
    if (from === to.id) return 'sameZone';
    if (!to.acceptsTypeIds.includes('scout')) return 'typeNotAccepted';
    return 'ok';
  }

  for (const [name, op, kind] of wrappers) {
    it(name, () => {
      let allowed = 0;
      for (const from of sources) {
        const rest = SCOUTS.slice(1).map((s) => s.id);
        const placement: Record<string, string[]> = { draw: rest, orders: ORDERS.map((o) => o.id) };
        placement[from.id] = from.id === 'draw' ? ['card-a#1', ...rest] : ['card-a#1'];
        const pile = expectOk(
          createPile(CTX, { instances: ALL_INSTANCES, placement, authority: authority() }),
        );
        for (const to of LAYOUT) {
          const result = pure(pile, (p) =>
            op(p, CTX, { instanceId: 'card-a#1', from: from.id, to: to.id }),
          );
          const got = result.ok ? 'ok' : result.error.code;
          expect([name, from.id, to.id, got]).toEqual([
            name,
            from.id,
            to.id,
            expected(kind, from.id, to),
          ]);
          if (result.ok) {
            allowed += 1;
            expect(cardsOf(result.pile, to.id)).toContain('card-a#1');
            expect(cardsOf(result.pile, from.id)).not.toContain('card-a#1');
          }
        }
      }
      expect(allowed).toBeGreaterThan(0);
    });
  }
});

describe('TC-DECK-13 (AC-17): restore from JSON and continue = continuous run', () => {
  type Step = (p: CardPile) => CardResult;
  const steps: Step[] = [
    (p) => shuffleZone(p, CTX, 'draw', 'g-1'),
    (p) => drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 3, allowShort: false }),
    (p) => drawCards(p, CTX, { from: 'draw', to: 'hand-beta', count: 2, allowShort: false }),
    (p) =>
      moveCard(p, CTX, {
        instanceId: cardsOf(p, 'hand-alpha')[0] as string,
        from: 'hand-alpha',
        to: 'secret',
      }),
    (p) =>
      playCard(p, CTX, {
        instanceId: cardsOf(p, 'hand-beta')[0] as string,
        from: 'hand-beta',
        to: 'table',
      }),
    (p) =>
      discardCard(p, CTX, {
        instanceId: cardsOf(p, 'table')[0] as string,
        from: 'table',
        to: 'discard',
      }),
    (p) => drawCards(p, CTX, { from: 'draw', to: 'box', count: 1, allowShort: false }),
    (p) =>
      returnCard(p, CTX, {
        instanceId: cardsOf(p, 'hand-alpha')[0] as string,
        from: 'hand-alpha',
        to: 'draw',
        position: 'top',
      }),
    (p) => shuffleZone(p, CTX, 'draw', 'g-2'),
    (p) =>
      revealCard(p, CTX, {
        instanceId: cardsOf(p, 'hand-beta')[0] as string,
        from: 'hand-beta',
        to: 'shown',
      }),
    // after the restore point (index 10)
    (p) => drawCards(p, CTX, { from: 'draw', to: 'hand-alpha', count: 2, allowShort: false }),
    (p) => moveCard(p, CTX, { instanceId: 'card-x#2', from: 'orders', to: 'table' }),
    (p) => shuffleZone(p, CTX, 'draw', 'g-3'),
    (p) => drawCards(p, CTX, { from: 'draw', to: 'hand-beta', count: 9, allowShort: true }),
  ];

  it('restorePile(JSON) resumes byte-identically', () => {
    const continuous = steps.reduce((p, step) => expectOk(step(p)), basePile());
    const head = steps.slice(0, 10).reduce((p, step) => expectOk(step(p)), basePile());
    const restored = restorePile(JSON.parse(JSON.stringify(head)), CTX);
    if (!restored.ok) throw new Error(JSON.stringify(restored.issues));
    const resumed = steps.slice(10).reduce((p, step) => expectOk(step(p)), restored.pile);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(continuous));
  });

  it('restorePile rejects schema and invariant violations as issues (never throws)', () => {
    const good = basePile();
    expect(restorePile(null, CTX)).toEqual({ ok: false, issues: [{ code: 'missingZone' }] });
    const badZone = restorePile(
      { ...good, zones: [...good.zones, { id: 'BAD', authority: 'digital', cards: [] }] },
      CTX,
    );
    expect(badZone).toEqual({ ok: false, issues: [{ code: 'unknownZone' }] });
    const badInstance = restorePile(
      { ...good, instances: [{ id: 'x', definitionId: 'card-a' }] },
      CTX,
    );
    expect(badInstance).toEqual({ ok: false, issues: [{ code: 'unknownCard' }] });
    const extra = restorePile({ ...good, extra: true }, CTX);
    expect(extra.ok).toBe(false);
    const lost = structuredClone(good);
    lost.zones[0]?.cards.pop();
    expect(restorePile(lost, CTX)).toEqual({
      ok: false,
      issues: [{ code: 'cardLost', instanceId: 'card-j#1' }],
    });
  });
});
