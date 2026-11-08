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
