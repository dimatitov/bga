import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, useSettingsStore } from '@/shared/settings/settingsStore';

/**
 * Resources are collected automatically from `src/locales/<lng>/<ns>.json` (plan-frontend §7.1):
 * adding a namespace needs no change here.
 */
const modules = import.meta.glob<{ default: Record<string, unknown> }>('../../locales/*/*.json', {
  eager: true,
});

export function buildResources(
  mods: Record<string, { default: Record<string, unknown> }> = modules,
): Resource {
  const resources: Resource = {};
  for (const [path, mod] of Object.entries(mods)) {
    const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, lng, ns] = match as unknown as [string, string, string];
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
