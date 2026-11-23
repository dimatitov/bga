import { z } from 'zod';
import {
  CardPileSchema,
  CardZonePolicySchema,
  CardZoneViewSchema,
  type CardEngineContext,
  type CardZonePolicy,
} from '@bga/platform/cards';
import { REBELLION_CARD_CATALOG, REBELLION_CARD_CATALOG_ID } from './card-catalog';

/**
 * SWR-010 (plan-backend §3.3, §11.2): Rebellion card zones, stored card state and its view. Zone ids are kebab
 * (usable as an i18n segment: `cards.zones.<zoneId>`). Authority is per game and lives in the stored zone state.
 */

export const REBELLION_CARD_ZONE_IDS = [
  'probe-deck',
  'probe-box',
  'rebels-location',
  'rebels-base-revealed',
  'empire-probes',
] as const;
export type RebellionCardZoneId = (typeof REBELLION_CARD_ZONE_IDS)[number];

/** Static zone policies (plan-backend §3.3), in `REBELLION_CARD_ZONE_IDS` order. Parsed at load. */
export const REBELLION_CARD_ZONES: readonly CardZonePolicy[] = Object.freeze(
  z.array(CardZonePolicySchema).parse([
    {
      id: 'probe-deck',
      kind: 'deck',
      owner: null,
      visibility: 'hidden',
      ordered: true,
      acceptsTypeIds: ['probe'],
      maxCards: null,
    },
    {
      id: 'probe-box',
      kind: 'removed',
      owner: null,
      visibility: 'public',
      ordered: false,
      acceptsTypeIds: ['probe'],
      maxCards: null,
    },
    {
      id: 'rebels-location',
      kind: 'special',
      owner: 'rebels',
      visibility: 'owner',
      ordered: false,
      acceptsTypeIds: ['probe'],
      maxCards: 1,
    },
    {
      id: 'rebels-base-revealed',
      kind: 'revealed',
      owner: 'rebels',
      visibility: 'public',
      ordered: false,
      acceptsTypeIds: ['probe'],
      maxCards: 1,
    },
    {
      id: 'empire-probes',
      kind: 'hand',
      owner: 'empire',
      visibility: 'owner',
      ordered: false,
      acceptsTypeIds: ['probe'],
      maxCards: null,
    },
  ]),
);

const TYPE_BY_DEFINITION: ReadonlyMap<string, string> = new Map(
  REBELLION_CARD_CATALOG.cards.map((card) => [card.id, card.typeId]),
);

/** Deck-engine context of Rebellion: zone layout + catalog type lookup. */
export const rebellionCardEngineContext: CardEngineContext = Object.freeze({
  layout: REBELLION_CARD_ZONES,
  typeOfDefinition: (definitionId: string) => TYPE_BY_DEFINITION.get(definitionId),
});

/** Stored card state of a `core-v1` game (absent = cards are not tracked in this game, legacy). */
export const CoreCardsStateSchema = z.strictObject({
  catalogId: z.literal(REBELLION_CARD_CATALOG_ID),
  pile: CardPileSchema,
});
export type CoreCardsState = z.infer<typeof CoreCardsStateSchema>;

/** Card zones as one viewer sees them (projected on the server). */
export const CoreCardsViewSchema = z.strictObject({
  catalogId: z.literal(REBELLION_CARD_CATALOG_ID),
  /** Every zone of REBELLION_CARD_ZONES, in that order. */
  zones: z.array(CardZoneViewSchema),
});
export type CoreCardsView = z.infer<typeof CoreCardsViewSchema>;
