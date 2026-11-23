import { CardCatalogSchema, type CardCatalog, type CardSourceRef } from '@bga/platform/cards';
import { CORE_SYSTEM_IDS, type CoreSystemId } from './core-ids';

/**
 * SWR-010 (plan-backend §3.2, AC-2, AC-3): Rebellion card catalog v0. Public, web-safe data (no deck order, no
 * base choice): card types of the base game and the 31 probe cards (every `core-v1` system except Coruscant).
 * Mission / project / action / objective / tactic exist only at the type level (`deferred`, no cards —
 * rules-audit §3.1–3.5, §7 item 7). Names reuse the system i18n keys (`systems.<id>`); type names are
 * `cards.types.<typeId>`, type descriptions `cards.typeInfo.<typeId>` (FQ-4). Own wording only (no card texts).
 */

export const REBELLION_CARD_CATALOG_ID = 'rebellion-cards-v1';
export const REBELLION_CARD_GAME_ID = 'rebellion';
/** Platform `editionId` (W1-Q1): the base game. */
export const REBELLION_CARD_EDITION_ID = 'base';

export const REBELLION_CARD_TYPE_IDS = [
  'probe',
  'mission',
  'project',
  'action',
  'objective',
  'tactic',
] as const;
export type RebellionCardTypeId = (typeof REBELLION_CARD_TYPE_IDS)[number];

/** Effect of every v0 card: the card is never "played" (probe cards only name a system). */
export const NO_PLAY_EFFECT_ID = 'no-play';

/**
 * Probe-card parameter naming the system. The frozen contract writes `params: { systemId }`, but the platform's
 * `params` keys are `CardIdSchema` (lowercase kebab), so the key is `system-id` (W2 deviation, reported).
 */
export const PROBE_SYSTEM_PARAM = 'system-id';

/** KB `rebellion:setup.first-game-rebels`: the 5 probe cards removed from the deck in the first game. */
export const FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS: readonly CoreSystemId[] = Object.freeze([
  'corellia',
  'mandalore',
  'saleucami',
  'sullust',
  'mustafar',
] as const);

const kb = (id: string): CardSourceRef => ({ kind: 'kb', id });

const PROBE_SOURCES: CardSourceRef[] = [
  kb('rebellion:cards.probe'),
  { kind: 'book', sourceId: 'RR', page: 10, section: 'Probe Cards' },
];

function typeDef(
  id: RebellionCardTypeId,
  scope: string,
  catalogStatus: 'tracked' | 'deferred',
  sources: CardSourceRef[],
) {
  return {
    id,
    gameId: REBELLION_CARD_GAME_ID,
    editionId: REBELLION_CARD_EDITION_ID,
    nameKey: `cards.types.${id}`,
    descriptionKey: `cards.typeInfo.${id}`,
    scope,
    catalogStatus,
    verification: 'verified' as const,
    sources,
  };
}

/** Systems that have a probe card, in `CORE_SYSTEM_IDS` order (31). */
export const PROBE_SYSTEM_IDS: readonly CoreSystemId[] = Object.freeze(
  CORE_SYSTEM_IDS.filter((id) => id !== 'coruscant'),
);

/** Parsed at module load (fail fast on a broken catalog). */
export const REBELLION_CARD_CATALOG: CardCatalog = CardCatalogSchema.parse({
  id: REBELLION_CARD_CATALOG_ID,
  gameId: REBELLION_CARD_GAME_ID,
  editionId: REBELLION_CARD_EDITION_ID,
  types: [
    typeDef('probe', 'shared', 'tracked', PROBE_SOURCES),
    typeDef('mission', 'shared', 'deferred', [
      kb('rebellion:setup.decks'),
      kb('rebellion:missions.starting'),
    ]),
    typeDef('project', 'empire', 'deferred', [kb('rebellion:missions.projects')]),
    typeDef('action', 'shared', 'deferred', [kb('rebellion:cards.action')]),
    typeDef('objective', 'rebels', 'deferred', [kb('rebellion:cards.objectives')]),
    typeDef('tactic', 'shared', 'deferred', [kb('rebellion:cards.tactic')]),
  ],
  effects: [
    {
      id: NO_PLAY_EFFECT_ID,
      status: 'none',
      mechanicId: null,
      summaryKey: 'cards.effects.no-play',
    },
  ],
  cards: PROBE_SYSTEM_IDS.map((systemId) => ({
    id: probeDefinitionId(systemId),
    gameId: REBELLION_CARD_GAME_ID,
    editionId: REBELLION_CARD_EDITION_ID,
    typeId: 'probe',
    scope: 'shared',
    nameKey: `systems.${systemId}`,
    params: { [PROBE_SYSTEM_PARAM]: systemId },
    usageKeys: ['cards.usage.probe-refresh-draw', 'cards.usage.probe-base-location'],
    sources: PROBE_SOURCES,
    verification: 'verified',
    effectId: NO_PLAY_EFFECT_ID,
  })),
});

/** `'probe-<systemId>'`. */
export function probeDefinitionId(systemId: string): string {
  return `probe-${systemId}`;
}

/** `'probe-<systemId>#1'` (one physical copy of each probe card). */
export function probeInstanceId(systemId: string): string {
  return `${probeDefinitionId(systemId)}#1`;
}

const PROBE_SYSTEM_BY_DEFINITION: ReadonlyMap<string, string> = new Map(
  REBELLION_CARD_CATALOG.cards
    .filter((card) => card.typeId === 'probe')
    .map((card) => [card.id, String(card.params[PROBE_SYSTEM_PARAM])]),
);

/** Catalog lookup: the system named by a probe card, `null` if `definitionId` is not a probe card. */
export function probeSystemOf(definitionId: string): string | null {
  return PROBE_SYSTEM_BY_DEFINITION.get(definitionId) ?? null;
}
