import { createBrowserRouter, type RouteObject } from 'react-router';
import { NewGamePage } from '@/features/game-setup';
import { AppLayout } from './layout/AppLayout';
import { LazyGameTablePage } from './pages/LazyGameTablePage';
import { MainMenuPage } from './pages/MainMenuPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';

export const paths = {
  menu: '/',
  newGame: '/games/new',
  game: (gameId: string) => `/games/${encodeURIComponent(gameId)}`,
  settings: '/settings',
} as const;

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <MainMenuPage /> },
      { path: '/games/new', element: <NewGamePage /> },
      { path: '/games/:id', element: <LazyGameTablePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
