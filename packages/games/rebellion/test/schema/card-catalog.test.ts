/**
 * SWR-010 W2 (plan-backend §3.2, §3.3, §11.2; TC-REG-04..TC-REG-08): Rebellion card catalog v0 and zones.
 */
import { describe, expect, it } from 'vitest';
import {
  CardCatalogSchema,
  CardDefinitionSchema,
  CardTypeDefinitionSchema,
  CardZonePolicySchema,
} from '@bga/platform/cards';
import {
  CORE_SYSTEM_IDS,
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  NO_PLAY_EFFECT_ID,
  PROBE_SYSTEM_IDS,
  PROBE_SYSTEM_PARAM,
  REBELLION_CARD_CATALOG,
  REBELLION_CARD_CATALOG_ID,
  REBELLION_CARD_TYPE_IDS,
  REBELLION_CARD_ZONE_IDS,
  REBELLION_CARD_ZONES,
  probeDefinitionId,
  probeInstanceId,
  probeSystemOf,
  rebellionCardEngineContext,
} from '../../src/schema';
import { coreDataBaseV1 } from '../../src/scenario';

const catalog = REBELLION_CARD_CATALOG;
const probes = catalog.cards.filter((c) => c.typeId === 'probe');

describe('catalog identity (AC-2)', () => {
  it('id / game / edition (W1-Q1: editionId "base")', () => {
    expect(catalog.id).toBe(REBELLION_CARD_CATALOG_ID);
    expect(catalog.id).toBe('rebellion-cards-v1');
    expect(catalog.gameId).toBe('rebellion');
    expect(catalog.editionId).toBe('base');
  });

  it('TC-REG-04: the whole catalog and every record pass the platform schemas', () => {
    expect(CardCatalogSchema.safeParse(catalog).success).toBe(true);
    for (const t of catalog.types) {
      expect(CardTypeDefinitionSchema.safeParse(t).success, t.id).toBe(true);
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      expect(t.verification, t.id).toBe('verified');
    }
    for (const c of catalog.cards) {
      expect(CardDefinitionSchema.safeParse(c).success, c.id).toBe(true);
      expect(c.sources.length, c.id).toBeGreaterThan(0);
      expect(
        catalog.effects.find((e) => e.id === c.effectId),
        c.id,
      ).toBeDefined();
    }
  });

  it('TC-REG-05: id snapshot (types + sorted card ids are stable)', () => {
    expect(catalog.types.map((t) => t.id)).toEqual([...REBELLION_CARD_TYPE_IDS]);
    expect(catalog.effects.map((e) => e.id)).toEqual(['no-play']);
    expect(catalog.cards.map((c) => c.id).sort()).toMatchInlineSnapshot(`
      [
        "probe-alderaan",
        "probe-bespin",
        "probe-bothawui",
        "probe-cato-neimoidia",
        "probe-corellia",
        "probe-dagobah",
        "probe-dantooine",
        "probe-dathomir",
        "probe-endor",
        "probe-felucia",
        "probe-geonosis",
        "probe-hoth",
        "probe-ilum",
        "probe-kashyyyk",
        "probe-kessel",
        "probe-malastare",
        "probe-mandalore",
        "probe-mon-calamari",
        "probe-mustafar",
        "probe-mygeeto",
        "probe-naboo",
        "probe-nal-hutta",
        "probe-ord-mantell",
        "probe-rodia",
        "probe-ryloth",
        "probe-saleucami",
        "probe-sullust",
        "probe-tatooine",
        "probe-toydaria",
        "probe-utapau",
        "probe-yavin",
      ]
    `);
  });
});

describe('probe cards (AC-3)', () => {
  it('TC-REG-06: exactly 31, one per core-v1 system except Coruscant, no duplicates, verified, no-play', () => {
    expect(probes).toHaveLength(31);
    expect(catalog.cards).toHaveLength(31);
    const systems = probes.map((c) => probeSystemOf(c.id));
    expect(new Set(systems).size).toBe(31);
    const mapSystems = coreDataBaseV1.systems.map((s) => s.id).filter((id) => id !== 'coruscant');
    expect([...systems].sort()).toEqual([...mapSystems].sort());
    expect(systems).toEqual([...PROBE_SYSTEM_IDS]);
    expect(PROBE_SYSTEM_IDS).toEqual(CORE_SYSTEM_IDS.filter((id) => id !== 'coruscant'));
    for (const c of probes) {
      const systemId = String(c.params[PROBE_SYSTEM_PARAM]);
      expect(c).toEqual({
        id: `probe-${systemId}`,
        gameId: 'rebellion',
        editionId: 'base',
        typeId: 'probe',
        scope: 'shared',
        nameKey: `systems.${systemId}`,
        params: { [PROBE_SYSTEM_PARAM]: systemId },
        usageKeys: ['cards.usage.probe-refresh-draw', 'cards.usage.probe-base-location'],
        sources: [
          { kind: 'kb', id: 'rebellion:cards.probe' },
          { kind: 'book', sourceId: 'RR', page: 10, section: 'Probe Cards' },
        ],
        verification: 'verified',
        effectId: NO_PLAY_EFFECT_ID,
      });
    }
    expect(catalog.effects).toEqual([
      { id: 'no-play', status: 'none', mechanicId: null, summaryKey: 'cards.effects.no-play' },
    ]);
  });

  it('TC-REG-07: mission / project / action / objective / tactic are deferred types without cards', () => {
    const probe = catalog.types.find((t) => t.id === 'probe');
    expect(probe?.catalogStatus).toBe('tracked');
    for (const id of ['mission', 'project', 'action', 'objective', 'tactic']) {
      const type = catalog.types.find((t) => t.id === id);
      expect(type?.catalogStatus, id).toBe('deferred');
      expect(
        catalog.cards.filter((c) => c.typeId === id),
        id,
      ).toEqual([]);
    }
    expect(catalog.cards.every((c) => c.typeId === 'probe')).toBe(true);
  });

  it('TC-REG-08: no Coruscant card; every probe system is on the core-v1 map', () => {
    expect(catalog.cards.find((c) => c.id === 'probe-coruscant')).toBeUndefined();
    expect(probeSystemOf('probe-coruscant')).toBeNull();
    const map = new Set(coreDataBaseV1.systems.map((s) => s.id));
    for (const c of probes) expect(map.has(String(c.params[PROBE_SYSTEM_PARAM])), c.id).toBe(true);
  });

  it('the platform catalog validator rejects a card of a deferred type or with an unknown effect', () => {
    const card = probes[0]!;
    expect(
      CardCatalogSchema.safeParse({ ...catalog, cards: [{ ...card, typeId: 'mission' }] }).success,
    ).toBe(false);
    expect(
      CardCatalogSchema.safeParse({ ...catalog, cards: [{ ...card, effectId: 'boom' }] }).success,
    ).toBe(false);
    expect(CardCatalogSchema.safeParse({ ...catalog, cards: [card, card] }).success).toBe(false);
  });

  it('first game: the 5 removed probe systems = start-setup base-ineligible systems − Coruscant', () => {
    expect([...FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS]).toEqual([
      'corellia',
      'mandalore',
      'saleucami',
      'sullust',
      'mustafar',
    ]);
    const ineligible = coreDataBaseV1.startSetup.baseIneligibleSystemIds.filter(
      (id) => id !== 'coruscant',
    );
    expect([...FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS].sort()).toEqual([...ineligible].sort());
    expect(Object.isFrozen(FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS)).toBe(true);
  });

  it('helpers: probeDefinitionId / probeInstanceId / probeSystemOf', () => {
    expect(probeDefinitionId('yavin')).toBe('probe-yavin');
    expect(probeInstanceId('yavin')).toBe('probe-yavin#1');
    expect(probeSystemOf('probe-yavin')).toBe('yavin');
    expect(probeSystemOf('probe-nowhere')).toBeNull();
    expect(probeSystemOf('yavin')).toBeNull();
  });
});

describe('i18n keys (plan-backend §9, FQ-4)', () => {
  it('type names cards.types.<id>, descriptions cards.typeInfo.<id>', () => {
    for (const t of catalog.types) {
      expect(t.nameKey).toBe(`cards.types.${t.id}`);
      expect(t.descriptionKey).toBe(`cards.typeInfo.${t.id}`);
    }
  });

  it('full list of catalog key strings (for the web locales)', () => {
    const keys = new Set<string>();
    for (const t of catalog.types) keys.add(t.nameKey).add(t.descriptionKey);
    for (const e of catalog.effects) keys.add(e.summaryKey);
    for (const c of catalog.cards) c.usageKeys.forEach((k) => keys.add(k));
    expect([...keys].sort()).toEqual([
      'cards.effects.no-play',
      'cards.typeInfo.action',
      'cards.typeInfo.mission',
      'cards.typeInfo.objective',
      'cards.typeInfo.probe',
      'cards.typeInfo.project',
      'cards.typeInfo.tactic',
      'cards.types.action',
      'cards.types.mission',
      'cards.types.objective',
      'cards.types.probe',
      'cards.types.project',
      'cards.types.tactic',
      'cards.usage.probe-base-location',
      'cards.usage.probe-refresh-draw',
    ]);
    // Card names reuse the existing system keys.
    expect(catalog.cards.every((c) => c.nameKey === `systems.${probeSystemOf(c.id)}`)).toBe(true);
  });
});

describe('zones (plan-backend §3.3)', () => {
  it('five zones in order, each a valid platform policy', () => {
    expect(REBELLION_CARD_ZONES.map((z) => z.id)).toEqual([...REBELLION_CARD_ZONE_IDS]);
    for (const z of REBELLION_CARD_ZONES) {
      expect(CardZonePolicySchema.safeParse(z).success, z.id).toBe(true);
    }
  });

  it('policy table', () => {
    expect(
      REBELLION_CARD_ZONES.map((z) => [z.id, z.kind, z.owner, z.visibility, z.ordered, z.maxCards]),
    ).toEqual([
      ['probe-deck', 'deck', null, 'hidden', true, null],
      ['probe-box', 'removed', null, 'public', false, null],
      ['rebels-location', 'special', 'rebels', 'owner', false, 1],
      ['rebels-base-revealed', 'revealed', 'rebels', 'public', false, 1],
      ['empire-probes', 'hand', 'empire', 'owner', false, null],
    ]);
    for (const z of REBELLION_CARD_ZONES) expect(z.acceptsTypeIds).toEqual(['probe']);
  });

  it('engine context: layout + catalog type lookup', () => {
    expect(rebellionCardEngineContext.layout).toBe(REBELLION_CARD_ZONES);
    expect(rebellionCardEngineContext.typeOfDefinition('probe-hoth')).toBe('probe');
    expect(rebellionCardEngineContext.typeOfDefinition('probe-coruscant')).toBeUndefined();
  });
});
