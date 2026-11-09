/**
 * SWR-005B review F-4: the built API (`pnpm --filter @bga/api start`) runs with NODE_ENV=production, so the dev AI
 * routes are not registered; the schema default stays `development` for `pnpm dev`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROOT } from './global-setup';

const pkg = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('apps/api package scripts', () => {
  it('start runs dist/main.js with NODE_ENV=production', () => {
    expect(pkg.scripts.start).toBe('NODE_ENV=production node dist/main.js');
  });

  it('dev does not force production', () => {
    expect(pkg.scripts.dev).not.toContain('NODE_ENV=production');
  });
});
