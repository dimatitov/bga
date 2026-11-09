import { join } from 'node:path';
import { runBootstrap } from './bootstrap';
import { loadAppConfig } from './config/env';

// apps/api/.env (created by scripts/ensure-env.mjs) is read by loadAppConfig unless NODE_ENV=test;
// variables already set in the environment win (e2e sets its own).
// SWR-005B defect D-1: the app factory (and with it @prisma/client, whose own dotenv loader copies apps/api/.env
// into the process environment at import) is loaded only AFTER the configuration was validated, so AppConfig never sees values
// that Prisma injected. NODE_ENV=test children additionally get every OPENAI_* blanked (scripts/e2e-env.mjs).
void runBootstrap({
  loadConfig: () => loadAppConfig({ dotenvPath: join(__dirname, '..', '.env') }),
  createApp: async (options) => (await import('./app.factory.js')).createApp(options),
  stderr: (line) => console.error(line),
  exit: (code) => process.exit(code),
});
