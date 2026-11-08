/**
 * TC-WEB-12 (FE-TABLE namespaces) + R-14: ru/en key sets of session/board/gameData match (modulo plural suffixes),
 * and every system/region/piece key of the mock scenario has a translation. Test-only import of the scenario
 * (allowed for `*.i18n.test.ts`, plan-frontend §0.1).
 */
import { mockScenario } from '@swr/game-data';
import { describe, expect, it } from 'vitest';
import { resources } from '@/shared/i18n';

const TABLE_NAMESPACES = ['session', 'board', 'gameData'] as const;
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

describe('FE-TABLE locales', () => {
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
        expect(typeof lookup('gameData', lng, key), `${lng} gameData:${key}`).toBe('string');
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
});
