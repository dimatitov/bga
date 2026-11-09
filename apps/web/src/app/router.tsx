import { createBrowserRouter, type RouteObject } from 'react-router';
import { CatalogPage } from '@/platform/catalog/CatalogPage';
import { GamePage } from '@/platform/game-page/GamePage';
import { NewSessionPage } from '@/platform/new-session/NewSessionPage';
import { routePatterns } from '@/platform/paths';
import { SessionHost } from '@/platform/session-host/SessionHost';
import { AppLayout } from './layout/AppLayout';
import { PlatformLayout } from './layout/PlatformLayout';
import { RouteError } from './layout/RouteError';
import { SessionLayout } from './layout/SessionLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';

// Dev diagnostics (SWR-005B plan-frontend §3.1, Q-FE-3): the literal `import.meta.env.DEV` is replaced by `false` in
// `vite build`, the ternary folds and the dynamic import is dropped — no chunk, no path string in the production bundle
// (checked by `check:bundle`). Keep the literal check here: a helper function would not be folded reliably.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/dev/ai', lazy: () => import('@/dev/ai/route') }]
  : [];

/**
 * The only route table of the app (plan-frontend §2). Game-agnostic: games are resolved at runtime through the
 * registry (`GameRegistryProvider`), so adding a game never changes this file (AC-5).
 */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PlatformLayout />,
        children: [
          { path: routePatterns.catalog, element: <CatalogPage /> },
          { path: routePatterns.game, element: <GamePage /> },
          { path: routePatterns.newSession, element: <NewSessionPage /> },
          { path: routePatterns.settings, element: <SettingsPage /> },
          ...devRoutes,
          { path: routePatterns.notFound, element: <NotFoundPage /> },
        ],
      },
      {
        element: <SessionLayout />,
        children: [{ path: routePatterns.session, element: <SessionHost /> }],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
