import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, useSettingsStore } from '@/shared/settings/settingsStore';

/**
 * Resources are collected automatically (SWR-003 plan-frontend §5.1), adding a namespace or a game needs no
 * change here:
 * - `src/locales/<lng>/<ns>.json` → platform namespace `<ns>`;
 * - `src/games/<prefix>/locales/<lng>/<area>.json` → game namespace `<prefix>.<area>` (e.g. `rebellion.board`).
 * The glob is generic (no game names) — the one documented exception to "shared knows no games".
 */
const modules = import.meta.glob<{ default: Record<string, unknown> }>(
  ['../../locales/*/*.json', '../../games/*/locales/*/*.json'],
  { eager: true },
);

const GAME_LOCALE = /games\/([^/]+)\/locales\/([^/]+)\/([^/]+)\.json$/;
const PLATFORM_LOCALE = /locales\/([^/]+)\/([^/]+)\.json$/;

/** Module path → `{ lng, ns }`, or `null` for an unrelated path. */
export function localeOf(path: string): { lng: string; ns: string } | null {
  const game = GAME_LOCALE.exec(path);
  if (game) {
    const [, prefix, lng, area] = game as unknown as [string, string, string, string];
    return { lng, ns: `${prefix}.${area}` };
  }
  const platform = PLATFORM_LOCALE.exec(path);
  if (platform) {
    const [, lng, ns] = platform as unknown as [string, string, string];
    return { lng, ns };
  }
  return null;
}

export function buildResources(
  mods: Record<string, { default: Record<string, unknown> }> = modules,
): Resource {
  const resources: Resource = {};
  for (const [path, mod] of Object.entries(mods)) {
    const locale = localeOf(path);
    if (!locale) continue;
    const { lng, ns } = locale;
    resources[lng] ??= {};
    resources[lng][ns] = mod.default;
  }
  return resources;
}

export const resources = buildResources();
export const namespaces = Array.from(
  new Set(Object.values(resources).flatMap((byNs) => Object.keys(byNs))),
).sort();

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: useSettingsStore.getState().language,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['ru', 'en'],
  ns: namespaces,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});
