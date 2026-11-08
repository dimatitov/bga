// Creates apps/api/.env from .env.example when it does not exist, so `pnpm dev` works after a clean clone.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(apiRoot, '.env');

if (existsSync(envFile)) {
  console.log('[ensure-env] apps/api/.env exists');
} else {
  copyFileSync(join(apiRoot, '.env.example'), envFile);
  console.log('[ensure-env] created apps/api/.env from .env.example');
}
