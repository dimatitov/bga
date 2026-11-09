import { screen, waitFor } from '@testing-library/react';
import { type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/app/router';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { makeStatus } from './testFixtures';

function allPaths(tree: RouteObject[]): string[] {
  return tree.flatMap((r) => [...(r.path ? [r.path] : []), ...allPaths(r.children ?? [])]);
}

describe('/dev/ai route registration (plan-frontend §3.1)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('T-13: in DEV the route tree has /dev/ai (before the 404) and Settings links to the page', async () => {
    const paths = allPaths(routes);
    expect(paths).toContain('/dev/ai');
    expect(paths.indexOf('/dev/ai')).toBeLessThan(paths.indexOf('*'));

    const { requests } = mockFetch({
      'GET /api/dev/ai/status': { status: 200, body: makeStatus() },
    });
    const { user, router } = renderWithProviders({ path: '/settings' });
    await user.click(screen.getByTestId('settings-dev-ai-link'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dev/ai'));
    expect(await screen.findByTestId('dev-ai-page')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    await waitFor(() => expect(requests.map((r) => r.path)).toEqual(['/api/dev/ai/status']));
  });

  it('T-14: with DEV=false the route module has no /dev/ai', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const mod = await import('@/app/router');
    expect(allPaths(mod.routes)).not.toContain('/dev/ai');
    expect(allPaths(mod.routes)).toContain('/settings');
  });
});
