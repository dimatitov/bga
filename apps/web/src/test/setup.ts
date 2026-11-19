import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
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

// SWR-007: a timer a test file leaves pending (e.g. `focusWhenReady` retries, up to 12 × 16 ms) must not fire after
// Vitest tore the jsdom environment down — `document is not defined` then fails the whole run as an unhandled error
// (seen under the load of `pnpm verify`). Real timers created by the file are tracked and cleared when it is done.
const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
  const id = realSetTimeout(() => {
    pendingTimers.delete(id);
    if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...args);
  }, timeout);
  pendingTimers.add(id);
  return id;
}) as typeof setTimeout;
globalThis.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
  pendingTimers.delete(id as ReturnType<typeof setTimeout>);
  realClearTimeout(id);
}) as typeof clearTimeout;

afterAll(() => {
  for (const id of pendingTimers) realClearTimeout(id);
  pendingTimers.clear();
});
