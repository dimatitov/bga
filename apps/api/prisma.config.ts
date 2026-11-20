// Prisma 7 CLI configuration (SWR-007). Prisma 7 no longer loads `.env` by itself (the source of SWR-005B defect D-1):
// only DATABASE_URL is taken from apps/api/.env, and only when the environment has none — no other variable
// (OPENAI_*) ever enters a Prisma CLI process. A relative SQLite path keeps its Prisma ≤ 6 meaning (relative to prisma/).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';
import { resolveSqliteUrl } from './src/persistence/sqlite-url';

const API_ROOT = __dirname;
const SCHEMA_DIR = join(API_ROOT, 'prisma');

function databaseUrl(): string | undefined {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const dotenv = join(API_ROOT, '.env');
  if (!existsSync(dotenv)) return undefined;
  return parseEnv(readFileSync(dotenv, 'utf8')).DATABASE_URL?.trim() || undefined;
}

const url = databaseUrl();

export default defineConfig({
  schema: join(SCHEMA_DIR, 'schema.prisma'),
  // No `migrations.path`: the default (`migrations/` next to the schema) also follows `--schema` (migration tests).
  // `prisma generate` needs no URL (CI runs it on install before any .env exists).
  ...(url ? { datasource: { url: resolveSqliteUrl(url, SCHEMA_DIR) } } : {}),
});
