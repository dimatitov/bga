/** SWR-010 FE-A (plan-frontend §11.1): catalog lookups; every catalog i18n key has ru and en text. */
import { REBELLION_CARD_CATALOG } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import {
  CARD_DATA_NS,
  cardDefinition,
  cardEffect,
  cardName,
  cardType,
  cardTypeName,
  cardZoneName,
  catalogI18nKeys,
  deferredCardTypes,
  systemOfCard,
} from './catalog';

const ru = i18n.getFixedT('ru');
const en = i18n.getFixedT('en');

describe('card catalog lookups (SWR-010 FE-A)', () => {
  it('indexes every card, type and effect of the catalog', () => {
    for (const card of REBELLION_CARD_CATALOG.cards) expect(cardDefinition(card.id)).toBe(card);
    for (const type of REBELLION_CARD_CATALOG.types) expect(cardType(type.id)).toBe(type);
    for (const effect of REBELLION_CARD_CATALOG.effects) expect(cardEffect(effect.id)).toBe(effect);
    expect(cardDefinition('nope')).toBeUndefined();
  });

  it('probe cards name their system; other ids → null', () => {
    expect(systemOfCard('probe-hoth')).toBe('hoth');
    expect(systemOfCard('probe-yavin')).toBe('yavin');
    expect(systemOfCard('hoth')).toBeNull();
  });

  it('deferred types have no cards; probe is tracked', () => {
    const deferred = deferredCardTypes().map((t) => t.id);
    expect(deferred).toEqual(['mission', 'project', 'action', 'objective', 'tactic']);
    for (const id of deferred)
      expect(REBELLION_CARD_CATALOG.cards.some((c) => c.typeId === id)).toBe(false);
  });

  it('every catalog / zone i18n key has a non-empty ru and en text in rebellion.data', () => {
    const keys = catalogI18nKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        'cards.types.probe',
        'cards.typeInfo.probe',
        'cards.effects.no-play',
        'cards.usage.probe-refresh-draw',
        'cards.usage.probe-base-location',
        'cards.zones.probe-deck',
        'systems.hoth',
      ]),
    );
    for (const key of keys) {
      for (const lng of ['ru', 'en'] as const) {
        const v = i18n.getResource(lng, CARD_DATA_NS, key) as unknown;
        expect(typeof v, `${lng} ${key}`).toBe('string');
        expect(v, `${lng} ${key}`).not.toBe('');
      }
    }
  });

  it('names: card = system name, type and zone names localized; unknown ids fall back to the id', () => {
    expect(cardName(ru, 'probe-hoth')).toBe('Хот');
    expect(cardName(en, 'probe-hoth')).toBe('Hoth');
    expect(cardTypeName(ru, 'probe')).toBe('Зонд');
    expect(cardTypeName(en, 'tactic')).toBe('Tactic');
    expect(cardZoneName(ru, 'probe-deck')).toBe('Колода зондов');
    expect(cardZoneName(en, 'empire-probes')).toBe('Imperial probes');
    expect(cardName(ru, 'unknown-card')).toBe('unknown-card');
  });
});
