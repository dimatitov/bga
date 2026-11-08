import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// `@swr/source` makes workspace packages resolve to their TypeScript sources (no `dist` needed).
const conditions = ['@swr/source', ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
