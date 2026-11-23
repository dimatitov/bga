// Shared fixture of the cards tests: a small abstract game (two opaque sides, two card types, eight zones).
import {
  createPile,
  type CardAuthority,
  type CardEngineContext,
  type CardInstance,
  type CardPile,
  type CardResult,
  type CardZonePolicy,
} from '../../src/cards';

export const SCOUT_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((x) => `card-${x}`);
export const ORDER_IDS = ['card-x'];

export const LAYOUT: readonly CardZonePolicy[] = [
  {
    id: 'draw',
    kind: 'deck',
    owner: null,
    visibility: 'hidden',
    ordered: true,
    acceptsTypeIds: ['scout'],
    maxCards: null,
  },
  {
    id: 'hand-alpha',
    kind: 'hand',
    owner: 'alpha',
    visibility: 'owner',
    ordered: false,
    acceptsTypeIds: ['scout'],
    maxCards: null,
  },
  {
    id: 'hand-beta',
    kind: 'hand',
    owner: 'beta',
    visibility: 'owner',
    ordered: false,
    acceptsTypeIds: ['scout'],
    maxCards: null,
  },
  {
    id: 'discard',
    kind: 'discard',
    owner: null,
    visibility: 'public',
    ordered: true,
    acceptsTypeIds: ['scout'],
    maxCards: null,
  },
  {
    id: 'table',
    kind: 'inPlay',
    owner: null,
    visibility: 'public',
    ordered: false,
    acceptsTypeIds: ['scout', 'order'],
    maxCards: null,
  },
  {
    id: 'shown',
    kind: 'revealed',
    owner: null,
    visibility: 'public',
    ordered: false,
    acceptsTypeIds: ['scout'],
    maxCards: null,
  },
  {
    id: 'secret',
    kind: 'special',
    owner: 'alpha',
    visibility: 'owner',
    ordered: false,
    acceptsTypeIds: ['scout'],
    maxCards: 1,
  },
  {
    id: 'box',
    kind: 'removed',
    owner: null,
    visibility: 'hidden',
    ordered: false,
    acceptsTypeIds: ['scout'],
    maxCards: null,
  },
  {
    id: 'orders',
    kind: 'hand',
    owner: 'beta',
    visibility: 'owner',
    ordered: false,
    acceptsTypeIds: ['order'],
    maxCards: 2,
  },
];

const TYPE_OF: ReadonlyMap<string, string> = new Map([
  ...SCOUT_IDS.map((id): [string, string] => [id, 'scout']),
  ...ORDER_IDS.map((id): [string, string] => [id, 'order']),
]);

export const CTX: CardEngineContext = {
  layout: LAYOUT,
  typeOfDefinition: (definitionId) => TYPE_OF.get(definitionId),
};

export const SCOUTS: CardInstance[] = SCOUT_IDS.map((definitionId) => ({
  id: `${definitionId}#1`,
  definitionId,
}));
export const ORDERS: CardInstance[] = [
  { id: 'card-x#1', definitionId: 'card-x' },
  { id: 'card-x#2', definitionId: 'card-x' },
];
export const ALL_INSTANCES: CardInstance[] = [...SCOUTS, ...ORDERS];

export function authority(
  overrides: Partial<Record<string, CardAuthority>> = {},
): Record<string, CardAuthority> {
  return Object.fromEntries(LAYOUT.map((z) => [z.id, overrides[z.id] ?? 'digital']));
}

/** 10 scouts in `draw` (a..j, a on top), 2 orders in `orders`; every other zone empty. */
export function basePile(overrides: Partial<Record<string, CardAuthority>> = {}): CardPile {
  return expectOk(
    createPile(CTX, {
      instances: ALL_INSTANCES,
      placement: { draw: SCOUTS.map((s) => s.id), orders: ORDERS.map((o) => o.id) },
      authority: authority(overrides),
    }),
  );
}

export function expectOk(result: CardResult): CardPile {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.pile;
}

export function cardsOf(pile: CardPile, zoneId: string): string[] {
  const zone = pile.zones.find((z) => z.id === zoneId);
  if (zone === undefined) throw new Error(`no zone ${zoneId}`);
  return zone.cards;
}

/** Recursively freezes a value (a mutation attempt then throws in strict mode). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** Multiset of instance ids over all zones (sorted). */
export function placedIds(pile: CardPile): string[] {
  return pile.zones.flatMap((z) => z.cards).sort();
}
