// SWR-010 TC-DECK-12 (AC-5, AC-8, AC-9): the visibility projector. Matrix zone policy × viewer; the order of an
// ordered non-public zone is never projected (not even to its owner); unordered listings are sorted by id.
import { describe, expect, it } from 'vitest';
import {
  CardZoneViewSchema,
  createPile,
  drawCards,
  moveCard,
  projectZones,
  type CardEngineContext,
  type CardPile,
  type CardZoneView,
} from '../../src/cards';
import {
  ALL_INSTANCES,
  CTX,
  LAYOUT,
  ORDERS,
  SCOUTS,
  authority,
  basePile,
  deepFreeze,
  expectOk,
} from './fixture';

/** draw: d, j (hidden, ordered); hand-alpha: c, a, b in stored order; secret: e; discard: f, g; table: h; box: i. */
function table(): CardPile {
  let pile = expectOk(
    drawCards(basePile({ secret: 'physical' }), CTX, {
      from: 'draw',
      to: 'hand-alpha',
      count: 3,
      allowShort: false,
    }),
  );
  pile = expectOk(
    moveCard(pile, CTX, { instanceId: 'card-c#1', from: 'hand-alpha', to: 'hand-beta' }),
  );
  pile = expectOk(
    moveCard(pile, CTX, { instanceId: 'card-c#1', from: 'hand-beta', to: 'hand-alpha' }),
  );
  // hand-alpha stored order is now a, b, c → force c first to check sorting
  pile = {
    ...pile,
    zones: pile.zones.map((z) =>
      z.id === 'hand-alpha' ? { ...z, cards: ['card-c#1', 'card-a#1', 'card-b#1'] } : z,
    ),
  };
  pile = expectOk(moveCard(pile, CTX, { instanceId: 'card-e#1', from: 'draw', to: 'secret' }));
  pile = expectOk(moveCard(pile, CTX, { instanceId: 'card-g#1', from: 'draw', to: 'discard' }));
  pile = expectOk(
    moveCard(pile, CTX, { instanceId: 'card-f#1', from: 'draw', to: 'discard', position: 'top' }),
  );
  pile = expectOk(moveCard(pile, CTX, { instanceId: 'card-h#1', from: 'draw', to: 'table' }));
  pile = expectOk(moveCard(pile, CTX, { instanceId: 'card-i#1', from: 'draw', to: 'box' }));
  return deepFreeze(pile);
}

function ids(view: CardZoneView | undefined): string[] | null {
  if (view === undefined) throw new Error('zone missing');
  return view.cards === null ? null : view.cards.map((c) => c.instanceId);
}

function zoneOf(views: CardZoneView[], id: string): CardZoneView | undefined {
  return views.find((v) => v.id === id);
}

describe('TC-DECK-12: projectZones matrix', () => {
  const pile = table();
  const viewers = ['alpha', 'beta', null] as const;

  it.each(viewers)(
    'viewer %s: every layout zone, in layout order, with counts; views satisfy the view schema',
    (viewer) => {
      const views = projectZones(pile, CTX, viewer);
      expect(views.map((v) => v.id)).toEqual(LAYOUT.map((z) => z.id));
      expect(views.map((v) => v.count)).toEqual(
        LAYOUT.map((z) => pile.zones.find((s) => s.id === z.id)?.cards.length),
      );
      for (const v of views) expect(CardZoneViewSchema.safeParse(v).success).toBe(true);
      expect(zoneOf(views, 'secret')?.authority).toBe('physical');
    },
  );

  it.each<[string, string | null, Record<string, string[] | null>]>([
    [
      'owner alpha',
      'alpha',
      {
        draw: null,
        'hand-alpha': ['card-a#1', 'card-b#1', 'card-c#1'],
        'hand-beta': null,
        discard: ['card-f#1', 'card-g#1'],
        table: ['card-h#1'],
        secret: ['card-e#1'],
        box: null,
        orders: null,
      },
    ],
    [
      'opponent beta',
      'beta',
      {
        draw: null,
        'hand-alpha': null,
        'hand-beta': [],
        discard: ['card-f#1', 'card-g#1'],
        table: ['card-h#1'],
        secret: null,
        box: null,
        orders: ORDERS.map((o) => o.id),
      },
    ],
    [
      'public (null)',
      null,
      {
        draw: null,
        'hand-alpha': null,
        'hand-beta': null,
        discard: ['card-f#1', 'card-g#1'],
        table: ['card-h#1'],
        secret: null,
        box: null,
        orders: null,
      },
    ],
  ])('%s', (_name, viewer, expected) => {
    const views = projectZones(pile, CTX, viewer);
    for (const [zoneId, cards] of Object.entries(expected))
      expect([zoneId, ids(zoneOf(views, zoneId))]).toEqual([zoneId, cards]);
  });

  it('a hidden deck: only the count, for everyone — its ids never appear in any projection', () => {
    const deck = pile.zones.find((z) => z.id === 'draw')?.cards ?? [];
    expect(deck).toEqual(['card-d#1', 'card-j#1']);
    for (const viewer of viewers) {
      const json = JSON.stringify(projectZones(pile, CTX, viewer, { revealZoneIds: ['draw'] }));
      for (const id of deck) expect(json).not.toContain(id);
      expect(zoneOf(projectZones(pile, CTX, viewer), 'draw')).toMatchObject({
        count: 2,
        cards: null,
      });
    }
  });

  it('a secret zone is shown to everyone once revealed (revealZoneIds), never before', () => {
    expect(ids(zoneOf(projectZones(pile, CTX, 'beta'), 'secret'))).toBeNull();
    expect(
      ids(zoneOf(projectZones(pile, CTX, 'beta', { revealZoneIds: ['secret'] }), 'secret')),
    ).toEqual(['card-e#1']);
    expect(
      ids(zoneOf(projectZones(pile, CTX, null, { revealZoneIds: ['secret', 'box'] }), 'box')),
    ).toEqual(['card-i#1']);
  });

  it('unordered listings are sorted by instance id (stored / draw order does not leak); ordered public keep order', () => {
    const views = projectZones(pile, CTX, 'alpha');
    expect(pile.zones.find((z) => z.id === 'hand-alpha')?.cards).toEqual([
      'card-c#1',
      'card-a#1',
      'card-b#1',
    ]);
    expect(ids(zoneOf(views, 'hand-alpha'))).toEqual(['card-a#1', 'card-b#1', 'card-c#1']);
    expect(ids(zoneOf(views, 'discard'))).toEqual(['card-f#1', 'card-g#1']);
    expect(zoneOf(views, 'hand-alpha')?.cards?.[0]).toEqual({
      instanceId: 'card-a#1',
      definitionId: 'card-a',
    });
  });

  it('an ordered owner zone is never listed, not even to its owner or when "revealed"', () => {
    const layout = LAYOUT.map((z) => (z.id === 'hand-alpha' ? { ...z, ordered: true } : z));
    const ctx: CardEngineContext = { ...CTX, layout };
    const ordered = expectOk(
      createPile(ctx, {
        instances: ALL_INSTANCES,
        placement: {
          draw: SCOUTS.slice(2).map((s) => s.id),
          'hand-alpha': ['card-b#1', 'card-a#1'],
          orders: ORDERS.map((o) => o.id),
        },
        authority: authority(),
      }),
    );
    for (const viewer of ['alpha', 'beta', null]) {
      const view = zoneOf(
        projectZones(ordered, ctx, viewer, { revealZoneIds: ['hand-alpha'] }),
        'hand-alpha',
      );
      expect(view).toMatchObject({ count: 2, cards: null, ordered: true, visibility: 'owner' });
    }
  });

  it('projection does not mutate the pile and is deterministic', () => {
    const before = JSON.stringify(pile);
    const a = JSON.stringify(projectZones(pile, CTX, 'alpha'));
    expect(JSON.stringify(projectZones(pile, CTX, 'alpha'))).toBe(a);
    expect(JSON.stringify(pile)).toBe(before);
  });
});
