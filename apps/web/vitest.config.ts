import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // SWR-005 INTEGRATION (spec «таймауты web-тестов»): heavy jsdom/MUI table tests exceed 5 s when `pnpm -r test`
      // runs web and api in parallel (alone: 476/476 within 5 s). Web only.
      testTimeout: 15000,
    },
  }),
);
