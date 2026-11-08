import { ERROR_MESSAGE_KEYS, ErrorCodeSchema, SessionStatusSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { resources } from './i18n';

/**
 * FE-SHELL / FE-PLATFORM namespaces (plan-frontend §7.2; SWR-003 §5.2). FE-TABLE checks session/board/gameData
 * in its own test; game namespaces (`<prefix>.*`) — in the game's i18n test.
 */
const SHELL_NAMESPACES = [
  'common',
  'settings',
  'errors',
  'catalog',
  'gamePage',
  'sessionHost',
  'forbidden-stars.meta',
] as const;

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

/** i18next plural suffixes: languages have different plural categories (ru: one/few/many/other, en: one/other). */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function keySet(obj: unknown): string[] {
  return [...new Set(flatKeys(obj).map((k) => k.replace(PLURAL_SUFFIX, '')))].sort();
}

describe('TC-WEB-12 (FE-SHELL namespaces): ru and en key sets', () => {
  it.each(SHELL_NAMESPACES)('%s: ru and en have identical keys and no empty strings', (ns) => {
    expect(keySet(resources.en?.[ns])).toEqual(keySet(resources.ru?.[ns]));
    const ru = flatKeys(resources.ru?.[ns]);
    const en = flatKeys(resources.en?.[ns]);
    expect(ru.length).toBeGreaterThan(0);
    for (const key of en) expect(lookup(ns, 'en', key), `en ${ns}:${key}`).not.toBe('');
    for (const key of ru) {
      expect(typeof lookup(ns, 'ru', key), `ru ${ns}:${key}`).toBe('string');
      expect(lookup(ns, 'ru', key), `ru ${ns}:${key}`).not.toBe('');
    }
  });

  it('every ERROR_MESSAGE_KEYS entry and every ErrorCode has ru and en text (PA-2)', () => {
    // Game keys (e.g. Rebellion's) are checked in the game's own i18n test (`<prefix>.errors`).
    const messageKeys = Object.values(ERROR_MESSAGE_KEYS);
    for (const messageKey of messageKeys) {
      const name = messageKey.replace(/^errors\./, '');
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof lookup('errors', lng, name), `${lng} errors:${name}`).toBe('string');
      }
    }
    for (const code of ErrorCodeSchema.options) {
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof lookup('errors', lng, `code.${code}`), `${lng} errors:code.${code}`).toBe(
          'string',
        );
      }
    }
  });

  it('every SessionStatus has a ru and en word (common:sessionStatus.*, Q-9, SWR-004 plan-frontend §8)', () => {
    for (const status of SessionStatusSchema.options) {
      for (const lng of ['ru', 'en'] as const) {
        const text = lookup('common', lng, `sessionStatus.${status}`);
        expect(typeof text, `${lng} common:sessionStatus.${status}`).toBe('string');
        expect(text, `${lng} common:sessionStatus.${status}`).not.toBe('');
      }
    }
  });

  it('en texts of FE-SHELL namespaces contain no Cyrillic (TC-E2E-26)', () => {
    for (const ns of SHELL_NAMESPACES) {
      for (const key of flatKeys(resources.en?.[ns])) {
        expect(String(lookup(ns, 'en', key)), `en ${ns}:${key}`).not.toMatch(/[А-Яа-яЁё]/);
      }
    }
  });
});
