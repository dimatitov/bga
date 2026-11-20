import { join } from 'node:path';
import { runBootstrap } from './bootstrap';
import { loadAppConfig } from './config/env';
import { resolveSqliteUrl } from './persistence/sqlite-url';

// apps/api/.env (created by scripts/ensure-env.mjs) is read by loadAppConfig unless NODE_ENV=test;
// variables already set in the environment win (e2e sets its own).
// SWR-005B defect D-1: the app factory (and with it @prisma/client, whose Prisma ≤ 6 dotenv loader copied apps/api/.env
// into the process environment at import) is loaded only AFTER the configuration was validated. Prisma 7 (SWR-007) no longer
// loads .env; the order and the OPENAI_* blanking of NODE_ENV=test children (scripts/e2e-env.mjs) stay as defence in depth.
void runBootstrap({
  loadConfig: () => {
    const config = loadAppConfig({ dotenvPath: join(__dirname, '..', '.env') });
    // SWR-007 (Prisma 7 driver adapter): a relative SQLite path keeps meaning "relative to prisma/" (`.env.example`).
    const databaseUrl = resolveSqliteUrl(config.databaseUrl, join(__dirname, '..', 'prisma'));
    return Object.freeze({ ...config, databaseUrl });
  },
  createApp: async (options) => (await import('./app.factory.js')).createApp(options),
  stderr: (line) => console.error(line),
  exit: (code) => process.exit(code),
});
