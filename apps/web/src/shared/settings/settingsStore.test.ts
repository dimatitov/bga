import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LEGACY_SETTINGS_STORAGE_KEY,
  migrateLegacySettings,
  SETTINGS_STORAGE_KEY,
  useSettingsStore,
} from './settingsStore';

const value = (language: string, reduceMotion: boolean) =>
  JSON.stringify({ state: { language, reduceMotion }, version: 1 });

describe('settings storage key (Q-22, D-ST-4)', () => {
  it('uses bga.settings.v1', () => {
    expect(SETTINGS_STORAGE_KEY).toBe('bga.settings.v1');
    expect(LEGACY_SETTINGS_STORAGE_KEY).toBe('swr.settings.v1');
  });

  // The test setup resets the store, which persists defaults under the new key — start from empty storage.
  beforeEach(() => localStorage.clear());

  it('old key only → copied to the new key, old key deleted; the store rehydrates it', async () => {
    localStorage.setItem(LEGACY_SETTINGS_STORAGE_KEY, value('en', true));
    migrateLegacySettings(localStorage);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(value('en', true));
    expect(localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)).toBeNull();
    await act(() => useSettingsStore.persist.rehydrate());
    expect(useSettingsStore.getState()).toMatchObject({ language: 'en', reduceMotion: true });
  });

  it('both keys → the new key wins, old key deleted (runs once)', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, value('ru', false));
    localStorage.setItem(LEGACY_SETTINGS_STORAGE_KEY, value('en', true));
    migrateLegacySettings(localStorage);
    migrateLegacySettings(localStorage);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(value('ru', false));
    expect(localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('no old key → nothing changes; a throwing storage is ignored', () => {
    migrateLegacySettings(localStorage);
    expect(localStorage.length).toBe(0);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => migrateLegacySettings(broken)).not.toThrow();
  });
});
