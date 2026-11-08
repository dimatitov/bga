import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TMP_DIR = join(API_ROOT, '.tmp');
export const TEMPLATE_DB = join(TMP_DIR, 'template.db');

/**
 * Runs once per `vitest run`: clears old per-test DB files and migrates a template DB
 * that every test copies (R-6). The dev DB is never touched; no reset/seed endpoints (R-7).
 */
export default function setup(): void {
  mkdirSync(TMP_DIR, { recursive: true });
  for (const file of readdirSync(TMP_DIR)) {
    if (/^(test-.*|template)\.db(-journal)?$/.test(file))
      rmSync(join(TMP_DIR, file), { force: true });
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    stdio: 'pipe',
  });
}
