import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createAppTheme } from '@/app/theme/createAppTheme';
import type { WebGameEntry } from '@/games/registry';
import { GameRegistryProvider } from '@/platform/registry/GameRegistryContext';
import { FeedbackHost } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import { useApplySettings, useSettingsStore } from '@/shared/settings';
import { createQueryClient } from './queryClient';

function ThemedRoot({ children }: { children: ReactNode }) {
  useApplySettings();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const theme = useMemo(() => createAppTheme({ reduceMotion }), [reduceMotion]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
      <FeedbackHost />
    </ThemeProvider>
  );
}

export interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass a fresh client; the app creates one per mount. */
  queryClient?: QueryClient;
  /** Web game registry; default — the real `gameRegistry`. Tests inject fake entries (TR-5). */
  registry?: readonly WebGameEntry[];
}

/**
 * I18next → TanStack Query → game registry → Theme + CssBaseline → children (router) + FeedbackHost
 * (plan-frontend §2; SWR-003 §4 `GameRegistryProvider`).
 */
export function AppProviders({ children, queryClient, registry }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <GameRegistryProvider registry={registry}>
          <ThemedRoot>{children}</ThemedRoot>
        </GameRegistryProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
