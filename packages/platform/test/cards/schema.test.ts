// SWR-010 TC-REG-01 / TC-REG-02 (AC-2): the card contracts of plan-backend §11.1 accept valid data and reject
// each broken input with an issue.
import { describe, expect, it } from 'vitest';
import {
  CardCatalogSchema,
  CardDefinitionSchema,
  CardEffectSchema,
  CardInstanceIdSchema,
  CardInstanceSchema,
  CardPileSchema,
  CardTypeDefinitionSchema,
  CardZonePolicySchema,
  CardZoneViewSchema,
  type CardCatalog,
  type CardDefinition,
  type CardTypeDefinition,
} from '../../src/cards';
import { LAYOUT, basePile } from './fixture';

const TYPE: CardTypeDefinition = {
  id: 'scout',
  gameId: 'demo',
  editionId: 'demo-v1',
  nameKey: 'demo.cardType.scout',
  descriptionKey: 'demo.cardType.scoutDescription',
  scope: 'alpha',
  catalogStatus: 'tracked',
  verification: 'verified',
  sources: [{ kind: 'kb', id: 'demo:cards.scout' }],
};

const DEFERRED_TYPE: CardTypeDefinition = {
  ...TYPE,
  id: 'mission',
  scope: 'shared',
  catalogStatus: 'deferred',
};

const EFFECT = {
  id: 'no-play',
  status: 'none',
  mechanicId: null,
  summaryKey: 'demo.effect.noPlay',
} as const;

const CARD: CardDefinition = {
  id: 'scout-north',
  gameId: 'demo',
  editionId: 'demo-v1',
  typeId: 'scout',
  scope: 'alpha',
  nameKey: 'demo.card.scoutNorth',
  params: { system: 'north', strength: 2, unique: true, note: null },
  usageKeys: ['demo.usage.drawInRefresh'],
  sources: [
    { kind: 'book', sourceId: 'rules-ref', page: 12, section: 'Cards' },
    { kind: 'kb', id: 'demo:cards.scout' },
  ],
  verification: 'verified',
  effectId: 'no-play',
};

const CATALOG: CardCatalog = {
  id: 'demo-cards-v1',
  gameId: 'demo',
  editionId: 'demo-v1',
  types: [TYPE, DEFERRED_TYPE],
  effects: [EFFECT],
  cards: [CARD, { ...CARD, id: 'scout-south', nameKey: 'demo.card.scoutSouth' }],
};

function without<T extends object>(obj: T, key: keyof T): Omit<T, typeof key> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('TC-REG-01: valid card contracts parse', () => {
  it('card definition carries every AC-2 field', () => {
    const parsed = CardDefinitionSchema.parse(CARD);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'effectId',
        'gameId',
        'id',
        'nameKey',
        'params',
        'editionId',
        'scope',
        'sources',
        'typeId',
        'usageKeys',
        'verification',
      ].sort(),
    );
  });

  it('type definition, effect (none / not-implemented / implemented), instance, zone policy, pile, catalog', () => {
    expect(CardTypeDefinitionSchema.safeParse(TYPE).success).toBe(true);
    expect(CardEffectSchema.safeParse(EFFECT).success).toBe(true);
    expect(CardEffectSchema.safeParse({ ...EFFECT, status: 'not-implemented' }).success).toBe(true);
    expect(
      CardEffectSchema.safeParse({ ...EFFECT, status: 'implemented', mechanicId: 'draw-two' })
        .success,
    ).toBe(true);
    expect(
      CardInstanceSchema.safeParse({ id: 'scout-north#1', definitionId: 'scout-north' }).success,
    ).toBe(true);
    for (const policy of LAYOUT) expect(CardZonePolicySchema.safeParse(policy).success).toBe(true);
    expect(CardPileSchema.safeParse(basePile()).success).toBe(true);
    expect(CardCatalogSchema.safeParse(CATALOG).success).toBe(true);
  });

  it('instance ids: <card id>#<1..999>', () => {
    for (const ok of ['a#1', 'scout-north#12', 'x#999'])
      expect(CardInstanceIdSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['a', 'a#0', 'a#1000', 'A#1', '#1', 'a#01', '-a#1'])
      expect(CardInstanceIdSchema.safeParse(bad).success).toBe(false);
  });
});

describe('TC-REG-02: broken inputs are rejected', () => {
  const cases: [string, unknown][] = [
    ['no id', without(CARD, 'id')],
    ['no sources', without(CARD, 'sources')],
    ['empty sources', { ...CARD, sources: [] }],
    ['no verification status', without(CARD, 'verification')],
    ['unknown verification status', { ...CARD, verification: 'maybe' }],
    ['extra field (strict)', { ...CARD, text: 'printed card text' }],
    ['empty name key', { ...CARD, nameKey: '' }],
    ['name key without a namespace', { ...CARD, nameKey: 'scout' }],
    ['upper-case id', { ...CARD, id: 'Scout' }],
    ['non-primitive param', { ...CARD, params: { list: [1, 2] } }],
    ['book source with page 0', { ...CARD, sources: [{ kind: 'book', sourceId: 'r', page: 0 }] }],
  ];
  it.each(cases)('card definition: %s', (_name, input) => {
    expect(CardDefinitionSchema.safeParse(input).success).toBe(false);
  });

  it('effect: mechanicId iff implemented', () => {
    expect(CardEffectSchema.safeParse({ ...EFFECT, mechanicId: 'draw-two' }).success).toBe(false);
    expect(CardEffectSchema.safeParse({ ...EFFECT, status: 'implemented' }).success).toBe(false);
  });

  it('zone policy: owner visibility needs an owner; a deck is ordered', () => {
    const hand = LAYOUT[1];
    const deck = LAYOUT[0];
    expect(CardZonePolicySchema.safeParse({ ...hand, owner: null }).success).toBe(false);
    expect(CardZonePolicySchema.safeParse({ ...deck, ordered: false }).success).toBe(false);
    expect(CardZonePolicySchema.safeParse({ ...deck, acceptsTypeIds: [] }).success).toBe(false);
  });

  function catalogMessages(input: unknown): string[] {
    const result = CardCatalogSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  }

  it('catalog: duplicate card / type / effect ids', () => {
    expect(catalogMessages({ ...CATALOG, cards: [CARD, CARD] })).toContain(
      'duplicate id "scout-north"',
    );
    expect(catalogMessages({ ...CATALOG, types: [TYPE, TYPE, DEFERRED_TYPE] })).toContain(
      'duplicate id "scout"',
    );
    expect(catalogMessages({ ...CATALOG, effects: [EFFECT, EFFECT] })).toContain(
      'duplicate id "no-play"',
    );
  });

  it('catalog: unresolved type / effect, foreign game or edition, cards of a deferred type', () => {
    expect(catalogMessages({ ...CATALOG, cards: [{ ...CARD, typeId: 'ghost' }] })).toContain(
      'unknown type "ghost"',
    );
    expect(catalogMessages({ ...CATALOG, cards: [{ ...CARD, effectId: 'ghost' }] })).toContain(
      'unknown effect "ghost"',
    );
    expect(catalogMessages({ ...CATALOG, cards: [{ ...CARD, gameId: 'other' }] })).toContain(
      'gameId differs from the catalog',
    );
    expect(
      catalogMessages({ ...CATALOG, cards: [{ ...CARD, editionId: 'demo-v2' }] }),
    ).toHaveLength(1);
    expect(catalogMessages({ ...CATALOG, cards: [{ ...CARD, typeId: 'mission' }] })).toContain(
      'type "mission" is deferred and has no cards',
    );
    expect(CardCatalogSchema.safeParse({ ...CATALOG, types: [] }).success).toBe(false);
  });

  it('zone view: cards length must equal count; an ordered non-public zone never lists cards', () => {
    const view = {
      id: 'draw',
      kind: 'deck',
      owner: null,
      visibility: 'hidden',
      ordered: true,
      authority: 'digital',
      count: 1,
      cards: null,
    } as const;
    expect(CardZoneViewSchema.safeParse(view).success).toBe(true);
    const listed = { ...view, cards: [{ instanceId: 'card-a#1', definitionId: 'card-a' }] };
    expect(CardZoneViewSchema.safeParse(listed).success).toBe(false);
    expect(
      CardZoneViewSchema.safeParse({ ...listed, visibility: 'public', count: 2 }).success,
    ).toBe(false);
    expect(CardZoneViewSchema.safeParse({ ...listed, visibility: 'public' }).success).toBe(true);
  });
});
