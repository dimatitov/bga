import { ERROR_MESSAGE_KEYS, ErrorCodeSchema } from '@swr/contracts';
import { describe, expect, it } from 'vitest';
import { resources } from './i18n';

/** FE-SHELL namespaces (plan-frontend §7.2). FE-TABLE checks session/board/gameData in its own test. */
const SHELL_NAMESPACES = ['common', 'setup', 'settings', 'errors'] as const;

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

describe('TC-WEB-12 (FE-SHELL namespaces): ru and en key sets', () => {
  it.each(SHELL_NAMESPACES)('%s: ru and en have identical keys and no empty strings', (ns) => {
    const ru = flatKeys(resources.ru?.[ns]).sort();
    const en = flatKeys(resources.en?.[ns]).sort();
    expect(ru.length).toBeGreaterThan(0);
    expect(en).toEqual(ru);
    for (const key of ru) {
      expect(typeof lookup(ns, 'ru', key), `ru ${ns}:${key}`).toBe('string');
      expect(lookup(ns, 'ru', key), `ru ${ns}:${key}`).not.toBe('');
      expect(lookup(ns, 'en', key), `en ${ns}:${key}`).not.toBe('');
    }
  });

  it('every ERROR_MESSAGE_KEYS entry and every ErrorCode has ru and en text (PA-2)', () => {
    for (const messageKey of Object.values(ERROR_MESSAGE_KEYS)) {
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

  it('en texts of FE-SHELL namespaces contain no Cyrillic (TC-E2E-26)', () => {
    for (const ns of SHELL_NAMESPACES) {
      for (const key of flatKeys(resources.en?.[ns])) {
        expect(String(lookup(ns, 'en', key)), `en ${ns}:${key}`).not.toMatch(/[А-Яа-яЁё]/);
      }
    }
  });
});
