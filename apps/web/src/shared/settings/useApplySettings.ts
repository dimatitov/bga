import { useLayoutEffect } from 'react';
import { i18n } from '@/shared/i18n/i18n';
import { useSettingsStore } from './settingsStore';

/** Applies settings to the document: i18n language, `<html lang>`, `<html data-reduced-motion>` (R-13, A-13). */
export function applySettingsToDocument(language: string, reduceMotion: boolean): void {
  const root = document.documentElement;
  root.lang = language;
  root.dataset.reducedMotion = String(reduceMotion);
}

export function useApplySettings(): void {
  const language = useSettingsStore((s) => s.language);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  useLayoutEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
    applySettingsToDocument(language, reduceMotion);
  }, [language, reduceMotion]);
}

/** Convenience selector for components (e.g. Konva tweens): `true` → no animations. */
export function useReduceMotion(): boolean {
  return useSettingsStore((s) => s.reduceMotion);
}
