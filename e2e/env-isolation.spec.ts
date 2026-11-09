// SWR-005B review F-1 (defect D-1, AC-10/AC-13) — regression for the Playwright side: the e2e test process loads the
// API's `@prisma/client` (e2e/support/seed.ts), whose dotenv loader copies apps/api/.env into process.env. After
// loading it the way seed.ts does, no OPENAI_* variable may hold a value. Names / blankness only — values are never
// read into assertions or printed. No browser and no DB query are needed (the client never connects).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { BLANKED_OPENAI_VARS, nonBlankOpenAiVarNames } from './support/blank-openai-env';
import { loadPrismaClientLikeSeed } from './support/seed';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api');

test.describe('F-1: no OpenAI values from apps/api/.env in the Playwright process', () => {
  test('worker: after loading AND constructing the Prisma client like seed.ts, no OPENAI_* is non-blank', async () => {
    await loadPrismaClientLikeSeed();
    expect(nonBlankOpenAiVarNames()).toEqual([]);
    expect(process.env.OPENAI_ENABLED === 'false').toBe(true);
    // Every listed name is PRESENT (blank) — dotenv never overwrites a present key, so it cannot fill them later.
    const missing = BLANKED_OPENAI_VARS.filter((key) => process.env[key] !== '');
    expect(missing).toEqual([]);
  });

  test('child spawned from a spec inherits a clean env even after it loads the Prisma client itself', () => {
    const script = [
      "const { createRequire } = require('node:module');",
      "const path = require('node:path');",
      "const requireFromApi = createRequire(path.join(process.argv[1], 'package.json'));",
      "const { PrismaClient } = requireFromApi('@prisma/client');",
      'new PrismaClient();',
      "const bad = Object.keys(process.env).filter((k) => /^OPENAI_/.test(k) && k !== 'OPENAI_ENABLED' && (process.env[k] || '').trim() !== '');",
      "process.stdout.write(JSON.stringify({ bad, enabledFalse: process.env.OPENAI_ENABLED === 'false' }));",
    ].join('\n');
    const out = execFileSync(process.execPath, ['-e', script, API_ROOT], {
      env: process.env,
      encoding: 'utf8',
    });
    expect(JSON.parse(out)).toEqual({ bad: [], enabledFalse: true });
  });
});
