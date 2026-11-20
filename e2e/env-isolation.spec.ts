// SWR-005B review F-1 (defect D-1, AC-10/AC-13) — regression for the Playwright side: the e2e test process loads the
// API's `@prisma/client` (e2e/support/seed.ts), whose dotenv loader copies apps/api/.env into process.env. After
// loading it the way seed.ts does, no OPENAI_* variable may hold a value. Names / blankness only — values are never
// read into assertions or printed. No browser and no DB query are needed (the client never connects).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { buildE2eEnv } from '../apps/api/scripts/e2e-env.mjs';
import { createSession, REBELS_VS_AI, REBELS_VS_HUMAN } from './support/api';
import {
  AI_COMMANDER_VARS,
  BLANKED_OPENAI_VARS,
  nonBlankOpenAiVarNames,
  unexpectedAiCommanderVarNames,
} from './support/blank-openai-env';
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

// SWR-006 TC-E-08 (AC-13, TR-7): AI_COMMANDER_* never leaks from the parent env / apps/api/.env into the e2e
// processes; the e2e API always plays the deterministic bot. Names / equality to the forced values only.
test.describe('TC-E-08: AI_COMMANDER_* of the e2e processes are forced to the bot', () => {
  test('worker: after loading the Prisma client like seed.ts, AI_COMMANDER_PROVIDER=bot and the other AI_COMMANDER_* blank', async () => {
    await loadPrismaClientLikeSeed();
    expect(unexpectedAiCommanderVarNames()).toEqual([]);
    expect(process.env.AI_COMMANDER_PROVIDER === 'bot').toBe(true);
    const missing = AI_COMMANDER_VARS.filter((key) => process.env[key] === undefined);
    expect(missing, 'every AI_COMMANDER_* is present (dotenv cannot fill it later)').toEqual([]);
  });

  test('e2e API env (buildE2eEnv): a hostile parent env (openai, OPENAI_ENABLED=true, a key) still yields bot / disabled / blank key', () => {
    const SENTINEL = 'sk-e2e-sentinel-never-used';
    const env = buildE2eEnv(
      {
        PATH: process.env.PATH,
        AI_COMMANDER_PROVIDER: 'openai',
        AI_COMMANDER_MODEL_ROLE: 'strategy',
        AI_COMMANDER_MAX_STEPS: '1',
        AI_COMMANDER_RUN_DEADLINE_MS: '1000',
        AI_COMMANDER_EXTRA: 'x',
        OPENAI_ENABLED: 'true',
        OPENAI_API_KEY: SENTINEL,
      },
      { databaseUrl: 'file:/tmp/none.db', port: '1' },
    );
    expect(env.AI_COMMANDER_PROVIDER).toBe('bot');
    for (const key of AI_COMMANDER_VARS.filter((k) => k !== 'AI_COMMANDER_PROVIDER'))
      expect(env[key], key).toBe('');
    expect(
      Object.keys(env)
        .filter((k) => /^AI_COMMANDER_/.test(k))
        .sort(),
    ).toEqual([...AI_COMMANDER_VARS].sort());
    expect(env.OPENAI_ENABLED).toBe('false');
    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.NODE_ENV).toBe('test');
    expect(JSON.stringify(env).includes(SENTINEL)).toBe(false);
  });

  test('running e2e API: an AI game reports strategy «bot», a hot-seat game none', async ({
    request,
  }) => {
    expect((await createSession(request, REBELS_VS_AI)).automation).toEqual({
      pending: false,
      strategy: 'bot',
    });
    expect((await createSession(request, REBELS_VS_HUMAN)).automation).toEqual({
      pending: false,
      strategy: null,
    });
  });
});
