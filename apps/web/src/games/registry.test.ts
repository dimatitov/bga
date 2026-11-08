import { GameDefinitionSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { gameRegistry } from './registry';

/** Invariants of the web registry (plan-frontend §4; TC-CAT-07, TC-CAT-09, TC-ARCH-04, AC-6). */
describe('web game registry', () => {
  it('definitions pass GameDefinitionSchema; ids unique; order = Rebellion, Forbidden Stars', () => {
    for (const entry of gameRegistry)
      expect(() => GameDefinitionSchema.parse(entry.definition)).not.toThrow();
    const ids = gameRegistry.map((e) => e.definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['star-wars-rebellion', 'forbidden-stars']);
  });

  it('available ⇒ SetupScreen and TableScreen; coming_soon ⇒ no screens (AC-6)', () => {
    for (const { definition, SetupScreen, TableScreen } of gameRegistry) {
      const hasScreens = [SetupScreen !== undefined, TableScreen !== undefined];
      expect(hasScreens, definition.id).toEqual(
        definition.status === 'available' ? [true, true] : [false, false],
      );
    }
  });

  it('cover is a data:image/svg+xml URL; i18nPrefix is a folder-like id', () => {
    for (const entry of gameRegistry) {
      expect(entry.cover?.src ?? 'data:image/svg+xml', entry.definition.id).toMatch(
        /^data:image\/svg\+xml/,
      );
      expect(entry.i18nPrefix).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('descriptionKey and coverAltKey resolve to non-empty ru and en text in the game namespace', () => {
    for (const { definition, i18nPrefix } of gameRegistry) {
      for (const key of [definition.descriptionKey, definition.coverAltKey]) {
        expect(key, definition.id).toBeDefined();
        expect(key!.startsWith(`${i18nPrefix}.meta:`), key).toBe(true);
        for (const lng of ['ru', 'en'] as const) {
          expect(i18n.exists(key!, { lng }), `${lng} ${key}`).toBe(true);
          expect(i18n.t(key!, { lng }), `${lng} ${key}`).not.toBe('');
        }
        expect(i18n.t(key!, { lng: 'en' })).not.toMatch(/[А-Яа-яЁё]/);
      }
    }
  });

  it('the registry array is frozen (TC-ARCH-04)', () => {
    expect(Object.isFrozen(gameRegistry)).toBe(true);
  });
});
