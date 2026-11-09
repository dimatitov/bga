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
    // SWR-005B (AC-13): any fetch to a non-loopback host fails the test file (plan-backend §2.5).
    // blank-openai-env FIRST (defect D-1): OPENAI_* are blanked before @prisma/client can load apps/api/.env.
    setupFiles: ['test/setup/blank-openai-env.ts', 'test/setup/no-network.ts'],
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
