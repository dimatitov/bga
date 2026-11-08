import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const LANGUAGES = ['ru', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'ru';

/** localStorage key of the persisted settings (R-13, Q-22). Value: `{"state":{language,reduceMotion},"version":1}`. */
export const SETTINGS_STORAGE_KEY = 'bga.settings.v1';
/** SWR-002 key; moved once to `SETTINGS_STORAGE_KEY` on start (Q-22, D-ST-4). */
export const LEGACY_SETTINGS_STORAGE_KEY = 'swr.settings.v1';

/**
 * One-time move of the SWR-002 settings (Q-22): if the new key is absent and the old one is present, copy the
 * value to the new key and delete the old one. If both exist, the new key wins and the old one is deleted.
 * Storage errors (private mode, blocked storage) are ignored — defaults apply.
 */
export function migrateLegacySettings(storage: Storage | undefined = safeLocalStorage()): void {
  if (!storage) return;
  try {
    const legacy = storage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (legacy === null) return;
    if (storage.getItem(SETTINGS_STORAGE_KEY) === null)
      storage.setItem(SETTINGS_STORAGE_KEY, legacy);
    storage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
  } catch {
    // ignore: settings are a convenience
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export interface SettingsState {
  language: Language;
  reduceMotion: boolean;
  setLanguage: (language: Language) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** D-ST-3: default = system `prefers-reduced-motion`; an explicit user choice overrides it. */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function defaultSettings(): Pick<SettingsState, 'language' | 'reduceMotion'> {
  // Language default is `ru` regardless of browser locale (R-19, D-i18n-1).
  return { language: DEFAULT_LANGUAGE, reduceMotion: systemPrefersReducedMotion() };
}

migrateLegacySettings();

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      setLanguage: (language) => set({ language }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ language: s.language, reduceMotion: s.reduceMotion }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          language: isLanguage(p.language) ? p.language : current.language,
          reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : current.reduceMotion,
        };
      },
    },
  ),
);

/** Test helper: restore defaults (does not touch localStorage). */
export function resetSettingsStore(): void {
  useSettingsStore.setState(defaultSettings());
}
