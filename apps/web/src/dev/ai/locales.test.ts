import { describe, expect, it } from 'vitest';
import { AI_ERROR_CODES } from './errorText';
import en from './locales/en.json';
import ru from './locales/ru.json';

function flat(obj: unknown, prefix = ''): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') return { [prefix]: obj };
  return Object.assign(
    {},
    ...Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
      flat(v, prefix ? `${prefix}.${k}` : k),
    ),
  ) as Record<string, unknown>;
}

describe('devAi namespace (T-16)', () => {
  const ruFlat = flat(ru);
  const enFlat = flat(en);

  it('ru and en have identical keys and non-empty strings', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(ruFlat).sort());
    for (const [key, value] of [...Object.entries(ruFlat), ...Object.entries(enFlat)]) {
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
    }
  });

  it('en has no Cyrillic', () => {
    for (const [key, value] of Object.entries(enFlat)) {
      expect(String(value), key).not.toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('every AI_* code has a title and a hint', () => {
    for (const code of AI_ERROR_CODES) {
      for (const f of [ruFlat, enFlat]) {
        expect(typeof f[`error.${code}.title`], code).toBe('string');
        expect(typeof f[`error.${code}.hint`], code).toBe('string');
      }
    }
  });

  it('the cost note is exactly the spec wording', () => {
    expect(ruFlat['result.costNote']).toBe('оценка; итог по счёту OpenAI может отличаться');
    expect(ruFlat['scenario.note']).toBe('Тестовые данные, не правила Rebellion');
  });
});
