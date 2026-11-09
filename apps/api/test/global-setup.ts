import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildE2eEnv } from '../scripts/e2e-env.mjs';

export const API_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TMP_DIR = join(API_ROOT, '.tmp');
export const TEMPLATE_DB = join(TMP_DIR, 'template.db');

/**
 * Runs once per `vitest run`: clears old per-test DB files and migrates a template DB
 * that every test copies (R-6). The dev DB is never touched; no reset/seed endpoints (R-7).
 * The migrate child gets no OPENAI_* values (buildE2eEnv, SWR-005B D-1).
 */
export default function setup(): void {
  mkdirSync(TMP_DIR, { recursive: true });
  for (const file of readdirSync(TMP_DIR)) {
    if (/^(test-.*|template)\.db(-journal)?$/.test(file))
      rmSync(join(TMP_DIR, file), { force: true });
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    // SWR-005B D-1: the prisma CLI also loads apps/api/.env for keys that are not present; every OPENAI_* is
    // passed blank (OPENAI_ENABLED=false) so the PO's real key never enters the child. PORT is unused by prisma.
    env: buildE2eEnv(process.env, { databaseUrl: `file:${TEMPLATE_DB}`, port: '3000' }),
    stdio: 'pipe',
  });
}
