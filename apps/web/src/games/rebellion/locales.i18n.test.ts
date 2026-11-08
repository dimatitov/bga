/**
 * TC-WEB-12 + R-14 for the Rebellion namespaces (`rebellion.*`, SWR-003 plan-frontend §5.2): ru/en key sets match
 * (modulo plural suffixes), every system/region/piece key of the mock scenario has a translation, every game
 * error `messageKey` is translated in `rebellion.errors`. Test-only import of the scenario (allowed for
 * `*.i18n.test.ts`, ESLint B-10).
 */
import { rebellionDefinition } from '@bga/game-rebellion/definition';
import { mockScenario } from '@bga/game-rebellion/scenario';
import { factions } from '@bga/game-rebellion/assets';
import {
  FactionIdSchema,
  GameModeSchema,
  GameRulesetSchema,
  OpponentTypeSchema,
  REBELLION_ERROR_MESSAGE_KEYS,
} from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { i18n, resources } from '@/shared/i18n';
import { REBELLION_ERRORS_NS } from './i18n';

const TABLE_NAMESPACES = [
  'rebellion.meta',
  'rebellion.common',
  'rebellion.setup',
  'rebellion.session',
  'rebellion.board',
  'rebellion.gameData',
  'rebellion.errors',
  'rebellion.list',
] as const;
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function lookup(ns: string, lng: 'ru' | 'en', key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
      resources[lng]?.[ns],
    );
}

describe('Rebellion locales (rebellion.*)', () => {
  it.each(TABLE_NAMESPACES)(
    '%s: ru and en have the same keys (plural forms normalised), no empty texts',
    (ns) => {
      const norm = (lng: 'ru' | 'en') =>
        [...new Set(flatKeys(resources[lng]?.[ns]).map((k) => k.replace(PLURAL, '')))].sort();
      expect(norm('ru').length).toBeGreaterThan(0);
      expect(norm('en')).toEqual(norm('ru'));
      for (const lng of ['ru', 'en'] as const) {
        for (const key of flatKeys(resources[lng]?.[ns])) {
          const v = lookup(ns, lng, key);
          expect(typeof v, `${lng} ${ns}:${key}`).toBe('string');
          expect(v, `${lng} ${ns}:${key}`).not.toBe('');
        }
      }
    },
  );

  it('ru plural keys have one/few/many/other, en plural keys have one/other', () => {
    for (const ns of TABLE_NAMESPACES) {
      const ru = flatKeys(resources.ru?.[ns]).filter((k) => PLURAL.test(k));
      const bases = new Set(ru.map((k) => k.replace(PLURAL, '')));
      for (const b of bases) {
        for (const f of ['one', 'few', 'many', 'other'])
          expect(ru, `ru ${ns}:${b}_${f}`).toContain(`${b}_${f}`);
        for (const f of ['one', 'other'])
          expect(typeof lookup(ns, 'en', `${b}_${f}`), `en ${ns}:${b}_${f}`).toBe('string');
      }
    }
  });

  it('every system, region and piece type of the scenario has ru and en names (A-12, R-14)', () => {
    const keys = [
      ...mockScenario.systems.map((s) => s.nameKey),
      ...mockScenario.systems.map((s) => `regions.${s.regionId}`),
      ...mockScenario.regions.map((r) => r.nameKey),
      ...mockScenario.pieces.map((p) => `pieces.${p.typeKey}`),
    ];
    for (const key of keys) {
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof lookup('rebellion.gameData', lng, key), `${lng} gameData:${key}`).toBe(
          'string',
        );
      }
    }
  });

  it('en texts contain no Cyrillic (TC-E2E-26)', () => {
    for (const ns of TABLE_NAMESPACES) {
      for (const key of flatKeys(resources.en?.[ns])) {
        expect(String(lookup(ns, 'en', key)), `en ${ns}:${key}`).not.toMatch(/[А-Яа-яЁё]/);
      }
    }
  });

  it('every Rebellion error messageKey has ru and en text in rebellion.errors (PA-5)', () => {
    for (const messageKey of Object.values(REBELLION_ERROR_MESSAGE_KEYS)) {
      const name = messageKey.replace(/^errors\./, '');
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof lookup(REBELLION_ERRORS_NS, lng, name), `${lng} ${name}`).toBe('string');
      }
    }
  });

  it('definition descriptionKey/coverAltKey resolve to non-empty ru and en texts (R-1)', () => {
    for (const lng of ['ru', 'en'] as const) {
      const t = i18n.getFixedT(lng);
      for (const key of [rebellionDefinition.descriptionKey, rebellionDefinition.coverAltKey]) {
        expect(key, 'definition key').toBeDefined();
        const text = t(key ?? '');
        expect(text, `${lng} ${key}`).not.toBe(key);
        expect(text.length, `${lng} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('SWR-004 setup form: keys for every FactionId, OpponentType, GameRuleset, GameMode (TC-C-22)', () => {
    const t = (lng: 'ru' | 'en') => i18n.getFixedT(lng);
    for (const lng of ['ru', 'en'] as const) {
      const keys: string[] = [];
      for (const f of FactionIdSchema.options) {
        const visual = factions[f];
        keys.push(visual.nameKey, visual.shortNameKey, visual.taglineKey);
        for (const kind of OpponentTypeSchema.options)
          keys.push(`rebellion.setup:newGame.opponentCaption.${kind}.${f}`);
      }
      for (const r of GameRulesetSchema.options) keys.push(`rebellion.common:ruleset.${r}`);
      for (const m of GameModeSchema.options) keys.push(`rebellion.common:mode.${m}`);
      keys.push('rebellion.common:prototype.badge', 'rebellion.common:prototype.full');
      for (const key of keys) {
        const text = t(lng)(key);
        expect(text, `${lng} ${key}`).not.toBe(key);
        expect(text.length, `${lng} ${key}`).toBeGreaterThan(0);
      }
    }
    expect(t('en')('rebellion.common:faction.rebels')).toBe('Rebels');
    expect(t('ru')('rebellion.common:faction.rebels')).toBe('Повстанцы');
  });
});
