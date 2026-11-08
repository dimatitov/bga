import { defineConfig, devices } from '@playwright/test';

// A-17: e2e runs on its own ports (api 3100, web 5174) and its own SQLite file,
// so it can run in parallel with `pnpm dev`. Root `pnpm e2e` builds workspace packages first.
const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  // Specs share one e2e DB and rely on order (empty-DB check first, "Continue" → latest game).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @bga/api run e2e:serve',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { PORT: String(API_PORT) },
      stdout: 'pipe',
    },
    {
      command: 'pnpm --filter @bga/web run dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        WEB_PORT: String(WEB_PORT),
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
        VITE_E2E: '1',
      },
    },
  ],
});
