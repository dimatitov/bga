/**
 * SWR-010 FE-A (plan-frontend §4.1, §6): read-only lookups into the public card catalog of Rebellion
 * (`REBELLION_CARD_CATALOG` from `@bga/game-rebellion/schema`, web-safe data). The catalog is the only source of
 * names, types, effects, usage conditions, rule sources and verification statuses of a card; the view only says
 * which card (`definitionId`) lies in which zone. Names / texts are i18n keys of `rebellion.data`.
 */
import {
  REBELLION_CARD_CATALOG,
  REBELLION_CARD_ZONES,
  probeSystemOf,
} from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';

export const CARD_DATA_NS = 'rebellion.data';

export type CardDefinition = (typeof REBELLION_CARD_CATALOG.cards)[number];
export type CardTypeDefinition = (typeof REBELLION_CARD_CATALOG.types)[number];
export type CardEffect = (typeof REBELLION_CARD_CATALOG.effects)[number];
export type CardSourceRef = CardDefinition['sources'][number];
export type CardVerification = CardDefinition['verification'];
export type CardZonePolicy = (typeof REBELLION_CARD_ZONES)[number];

const DEFINITIONS: ReadonlyMap<string, CardDefinition> = new Map(
  REBELLION_CARD_CATALOG.cards.map((c) => [c.id, c]),
);
const TYPES: ReadonlyMap<string, CardTypeDefinition> = new Map(
  REBELLION_CARD_CATALOG.types.map((c) => [c.id, c]),
);
const EFFECTS: ReadonlyMap<string, CardEffect> = new Map(
  REBELLION_CARD_CATALOG.effects.map((c) => [c.id, c]),
);

export function cardDefinition(definitionId: string): CardDefinition | undefined {
  return DEFINITIONS.get(definitionId);
}

export function cardType(typeId: string): CardTypeDefinition | undefined {
  return TYPES.get(typeId);
}

export function cardEffect(effectId: string): CardEffect | undefined {
  return EFFECTS.get(effectId);
}

/** Types of the catalog that exist only as a type (no cards yet): «пока не отслеживаются». */
export function deferredCardTypes(): CardTypeDefinition[] {
  return REBELLION_CARD_CATALOG.types.filter((t) => t.catalogStatus === 'deferred');
}

/** The system named by a probe card (`null` for any other card). */
export function systemOfCard(definitionId: string): string | null {
  return probeSystemOf(definitionId);
}

/** Localized card name (`definition.nameKey`); an unknown id is shown as is. */
export function cardName(t: TFunction, definitionId: string): string {
  const def = cardDefinition(definitionId);
  if (!def) return definitionId;
  return t(def.nameKey, { ns: CARD_DATA_NS, defaultValue: definitionId });
}

/** Localized card type name (`cards.types.<typeId>`). */
export function cardTypeName(t: TFunction, typeId: string): string {
  const type = cardType(typeId);
  return t(type?.nameKey ?? `cards.types.${typeId}`, { ns: CARD_DATA_NS, defaultValue: typeId });
}

/** Localized zone name (`cards.zones.<zoneId>`). */
export function cardZoneName(t: TFunction, zoneId: string): string {
  return t(`cards.zones.${zoneId}`, { ns: CARD_DATA_NS, defaultValue: zoneId });
}

/** Every i18n key of `rebellion.data` the catalog and the zone layout refer to (for the locale tests). */
export function catalogI18nKeys(): string[] {
  const keys = new Set<string>();
  for (const type of REBELLION_CARD_CATALOG.types) {
    keys.add(type.nameKey);
    keys.add(type.descriptionKey);
  }
  for (const effect of REBELLION_CARD_CATALOG.effects) keys.add(effect.summaryKey);
  for (const card of REBELLION_CARD_CATALOG.cards) {
    keys.add(card.nameKey);
    for (const k of card.usageKeys) keys.add(k);
  }
  for (const zone of REBELLION_CARD_ZONES) keys.add(`cards.zones.${zone.id}`);
  return [...keys];
}
