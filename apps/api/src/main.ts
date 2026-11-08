import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  // apps/api/.env (created by scripts/ensure-env.mjs). Existing env vars win (e2e sets its own).
  const envFile = join(__dirname, '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
