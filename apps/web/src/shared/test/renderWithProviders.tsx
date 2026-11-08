import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AppProviders } from '@/app/providers/AppProviders';
import { routes as appRoutes } from '@/app/router';

export interface RenderOptions {
  /** Initial URL (default `/`). */
  path?: string;
  /** Render a single element at `routePattern` instead of the app routes. */
  element?: ReactElement;
  /** Route pattern for `element` (default `*`), e.g. `/games/:id`. */
  routePattern?: string;
  /** Custom route tree (default: the app routes). */
  routes?: RouteObject[];
  queryClient?: QueryClient;
}

/** Fresh QueryClient without retries/caching delays — deterministic tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}

/**
 * Renders inside the real providers (i18n, Query, theme, FeedbackHost) with a memory router.
 * Mock the API with `mockFetch` (shared/test/mockFetch) before calling.
 */
export function renderWithProviders(options: RenderOptions = {}) {
  const {
    path = '/',
    element,
    routePattern = '*',
    queryClient = createTestQueryClient(),
  } = options;
  const routes = element ? [{ path: routePattern, element }] : (options.routes ?? appRoutes);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const result = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router, user, queryClient };
}
