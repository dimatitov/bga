import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetFeedbackStore } from '@/shared/feedback/feedbackStore';
import { i18n } from '@/shared/i18n/i18n';
import { resetSettingsStore } from '@/shared/settings/settingsStore';

// `pnpm test` runs package suites in parallel (api int-tests + web); lazy screens (Konva table chunk) can take
// longer than the default 1 s to transform on a cold, loaded machine (SWR-003 INTEGRATION flake in TableScreen.test).
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia (MUI / reduced-motion default use it).
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

beforeEach(async () => {
  localStorage.clear();
  resetSettingsStore();
  resetFeedbackStore();
  await i18n.changeLanguage('ru');
  document.documentElement.lang = 'ru';
  delete document.documentElement.dataset.reducedMotion;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
