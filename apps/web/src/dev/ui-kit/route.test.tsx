import { type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/app/router';

function allPaths(tree: RouteObject[]): string[] {
  return tree.flatMap((r) => [...(r.path ? [r.path] : []), ...allPaths(r.children ?? [])]);
}

// Separate file: `vi.resetModules()` gives later lazy imports a fresh i18n instance, so it must not share a file
// with rendering tests.
describe('/dev/ui-kit route registration (SWR-009 S, A-7)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('S-1: in DEV the route tree has /dev/ui-kit before the 404', () => {
    const paths = allPaths(routes);
    expect(paths).toContain('/dev/ui-kit');
    expect(paths.indexOf('/dev/ui-kit')).toBeLessThan(paths.indexOf('*'));
  });

  it('S-1b: with DEV=false the route module has neither /dev/ui-kit nor /dev/ai', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const mod = await import('@/app/router');
    expect(allPaths(mod.routes)).not.toContain('/dev/ui-kit');
    expect(allPaths(mod.routes)).not.toContain('/dev/ai');
    expect(allPaths(mod.routes)).toContain('/settings');
  });
});
