/**
 * SWR-005B defect D-1 (AC-10, AC-13): the PO's apps/api/.env never reaches a test process.
 * `@prisma/client` loads apps/api/.env itself (at import and on `new PrismaClient`) and copies every variable that is
 * not already present into process.env; the fix blanks every OPENAI_* first (test/setup/blank-openai-env.ts for Vitest,
 * scripts/e2e-env.mjs for the e2e API). Only presence / blankness is checked — values are never read or printed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AI_COMMANDER_VARS, BLANKED_OPENAI_VARS, buildE2eEnv } from '../scripts/e2e-env.mjs';
import { ENV_KEYS } from '../src/config/env';
import { API_ROOT, TMP_DIR } from './global-setup';
import { getStatus, startAiApp, type AiApp } from './support/ai-fakes';
import { api, createTestDb, startApp, stopApp } from './support/test-app';

const OPENAI_KEYS = ENV_KEYS.filter((k) => k.startsWith('OPENAI_') && k !== 'OPENAI_ENABLED');
const AI_COMMANDER_KEYS = ENV_KEYS.filter((k) => k.startsWith('AI_COMMANDER_'));

/** Names of AI_COMMANDER_* variables that are non-blank, except PROVIDER=bot (names only). */
function unexpectedAiCommanderVars(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env).filter(
    (k) =>
      /^AI_COMMANDER_/.test(k) &&
      (env[k] ?? '').trim() !== '' &&
      !(k === 'AI_COMMANDER_PROVIDER' && env[k] === 'bot'),
  );
}

/** Names of OPENAI_* variables that hold a non-blank value (names only). */
function nonBlankOpenAIVars(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env).filter(
    (k) => /^OPENAI_/.test(k) && k !== 'OPENAI_ENABLED' && (env[k] ?? '').trim() !== '',
  );
}

describe('defect D-1: no OpenAI values from apps/api/.env in test processes', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  it('after importing AND constructing the Prisma client, no OPENAI_* is non-blank and OPENAI_ENABLED is false', async () => {
    const client = new PrismaClient({ datasourceUrl: `file:${join(TMP_DIR, 'never-opened.db')}` });
    await client.$disconnect();
    expect(nonBlankOpenAIVars()).toEqual([]);
    expect(process.env.OPENAI_ENABLED === 'false').toBe(true);
    // SWR-006: the commander settings of apps/api/.env never reach a test process either.
    expect(unexpectedAiCommanderVars()).toEqual([]);
    expect(process.env.AI_COMMANDER_PROVIDER === 'bot').toBe(true);
  });

  it('SWR-006 TR-7: the e2e environment drops parent AI_COMMANDER_* and forces the bot', () => {
    expect([...AI_COMMANDER_VARS].sort()).toEqual([...AI_COMMANDER_KEYS].sort());
    const env = buildE2eEnv(
      {
        PATH: '/bin',
        AI_COMMANDER_PROVIDER: 'openai',
        AI_COMMANDER_MAX_STEPS: '1',
        AI_COMMANDER_EXTRA: 'x',
      },
      { databaseUrl: 'file:/tmp/e2e.db', port: '3100' },
    );
    expect(env.AI_COMMANDER_PROVIDER).toBe('bot');
    for (const key of AI_COMMANDER_KEYS.filter((k) => k !== 'AI_COMMANDER_PROVIDER')) {
      expect(env[key]).toBe('');
    }
    expect(env.AI_COMMANDER_EXTRA).toBeUndefined();
  });

  it('the e2e environment blanks every config OPENAI_* variable and forces NODE_ENV=test / OPENAI_ENABLED=false', () => {
    const env = buildE2eEnv(
      { PATH: '/bin', OPENAI_API_KEY: 'sk-test-parent-sentinel', OPENAI_EXTRA: 'x' },
      { databaseUrl: 'file:/tmp/e2e.db', port: '3100' },
    );
    for (const key of OPENAI_KEYS) {
      expect(BLANKED_OPENAI_VARS).toContain(key);
      expect(env[key]).toBe('');
    }
    expect(env.OPENAI_EXTRA).toBeUndefined();
    expect(env).toMatchObject({
      NODE_ENV: 'test',
      OPENAI_ENABLED: 'false',
      PATH: '/bin',
      PORT: '3100',
    });
  });

  it('a child process with the e2e environment: Prisma loads .env, yet no OPENAI_* becomes non-blank', () => {
    const env = buildE2eEnv(process.env, {
      databaseUrl: `file:${join(TMP_DIR, 'never-opened.db')}`,
      port: '3100',
    });
    const script = [
      "const { PrismaClient } = require('@prisma/client');",
      'new PrismaClient();',
      "const bad = Object.keys(process.env).filter((k) => /^OPENAI_/.test(k) && k !== 'OPENAI_ENABLED' && (process.env[k] || '').trim() !== '');",
      "const badAi = Object.keys(process.env).filter((k) => /^AI_COMMANDER_/.test(k) && (process.env[k] || '').trim() !== '' && !(k === 'AI_COMMANDER_PROVIDER' && process.env[k] === 'bot'));",
      "process.stdout.write(JSON.stringify({ bad, badAi, enabledFalse: process.env.OPENAI_ENABLED === 'false', bot: process.env.AI_COMMANDER_PROVIDER === 'bot' }));",
    ].join('\n');
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: API_ROOT,
      env,
      encoding: 'utf8',
    });
    expect(JSON.parse(out)).toEqual({ bad: [], badAi: [], enabledFalse: true, bot: true });
  });

  it('INTEGRATION: the `prisma migrate deploy` child of global-setup gets its env from buildE2eEnv (no OPENAI_* values)', () => {
    const src = readFileSync(join(API_ROOT, 'test', 'global-setup.ts'), 'utf8');
    expect(src).toMatch(/import \{ buildE2eEnv \} from '\.\.\/scripts\/e2e-env\.mjs'/);
    expect(src).toMatch(/env:\s*buildE2eEnv\(process\.env,/);
    expect(src).not.toMatch(/\.\.\.process\.env/);
  });

  it('GET /api/dev/ai/status of the test app reports keyConfigured:false (plain app and AI test app)', async () => {
    const db = createTestDb();
    const app = await startApp(db.url, { logger: false });
    try {
      const res = await api(app).get('/api/dev/ai/status');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        openaiEnabled: false,
        keyConfigured: false,
        provider: 'mock',
      });
    } finally {
      await stopApp(app, db);
    }
    ctx = await startAiApp();
    expect((await getStatus(ctx.app)).body.keyConfigured).toBe(false);
  });
});
