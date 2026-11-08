import swc from 'unplugin-swc';
import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// `@bga/source` → workspace packages are read from TypeScript sources (no `dist` needed).
const conditions = ['@bga/source', ...defaultServerConditions];

export default defineConfig({
  // SWC emits decorator metadata (esbuild/oxc do not) — required for Nest DI by type.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['test/**/*.int.test.ts', 'test/**/*.unit.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
