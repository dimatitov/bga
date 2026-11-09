/**
 * SWR-005B W5 (Q-BE-1): `scripts/reset-ai-budget.mjs` — argument guard (refuses without --yes, nothing touched) and a
 * real run on a SQLite copy of the template (deletes only the given key's AiUsage rows). Never dev.db.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiUsageRepository, type NewAiUsageRow } from '../../src/ai/ai-usage.repository';
import { API_ROOT } from '../global-setup';
import { createTestDb, removeTestDb, type TestDb } from '../support/test-app';

const SCRIPT = join(API_ROOT, 'scripts', 'reset-ai-budget.mjs');

function run(args: string[], env: Record<string, string> = {}) {
  const baseEnv = { ...process.env };
  delete baseEnv.DATABASE_URL;
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: API_ROOT,
    env: { ...baseEnv, ...env },
    encoding: 'utf8',
  });
}

function row(budgetKey: string, cost: number): NewAiUsageRow {
  return {
    budgetKey,
    provider: 'openai',
    model: 'gpt-6-luna',
    role: 'tactical',
    status: 'ok',
    attempts: 1,
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 5,
    reasoningTokens: null,
    estimatedCostMicroUsd: cost,
    pricingVersion: 'openai-2026-11-08',
    durationMs: 1,
    errorCode: null,
  };
}

describe('reset-ai-budget.mjs (SWR-005B W5)', () => {
  let db: TestDb;
  let prisma: PrismaClient;

  beforeEach(async () => {
    db = createTestDb();
    prisma = new PrismaClient({ datasourceUrl: db.url });
    const repo = new AiUsageRepository(prisma);
    await repo.insert(row('dev-diagnostics', 100));
    await repo.insert(row('dev-diagnostics', 250));
    await repo.insert(row('other-key', 7));
  });

  afterEach(async () => {
    await prisma.$disconnect();
    removeTestDb(db);
  });

  it.each<[string, string[], Record<string, string>, RegExp]>([
    ['no --yes', ['--key', 'dev-diagnostics', '--database-url', 'URL'], {}, /without --yes/],
    ['no --yes (env URL)', ['--key', 'dev-diagnostics'], { DATABASE_URL: 'URL' }, /without --yes/],
    ['no key', ['--database-url', 'URL', '--yes'], {}, /Missing --key/],
    ['empty key', ['--key=', '--database-url', 'URL', '--yes'], {}, /Missing --key/],
    ['no URL', ['--key', 'dev-diagnostics', '--yes'], {}, /Missing --database-url/],
    ['non-file URL', ['--key', 'k', '--database-url', 'postgres://x', '--yes'], {}, /Only file:/],
    ['unknown flag', ['--key', 'k', '--force', '--yes'], {}, /Unknown argument: --force/],
    [
      'missing file',
      ['--key', 'k', '--database-url', 'file:/nonexistent/x.db', '--yes'],
      {},
      /not found/,
    ],
  ])('refuses (%s): exit 2, no rows deleted', async (_name, args, env, message) => {
    const subst = (s: string) => s.replace('URL', db.url);
    const result = run(
      args.map(subst),
      Object.fromEntries(Object.entries(env).map(([k, v]) => [k, subst(v)])),
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(message);
    expect(result.stderr).toContain('reset-ai-budget');
    expect(await prisma.aiUsage.count()).toBe(3);
  });

  it('with --yes deletes only the given key (flag URL)', async () => {
    const result = run(['--key', 'dev-diagnostics', '--database-url', db.url, '--yes']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/deleted 2 row\(s\), freed 350 micro-USD \(\$0\.000350\)/);
    expect(await prisma.aiUsage.count({ where: { budgetKey: 'dev-diagnostics' } })).toBe(0);
    expect(await prisma.aiUsage.count({ where: { budgetKey: 'other-key' } })).toBe(1);
  });

  it('with --yes uses DATABASE_URL from the environment; --database-url=… inline form works too', async () => {
    const viaEnv = run(['--key=other-key', '--yes'], { DATABASE_URL: db.url });
    expect(viaEnv.status, viaEnv.stderr).toBe(0);
    expect(await prisma.aiUsage.count({ where: { budgetKey: 'other-key' } })).toBe(0);
    const inline = run([`--database-url=${db.url}`, '--key', 'dev-diagnostics', '--yes']);
    expect(inline.status, inline.stderr).toBe(0);
    expect(await prisma.aiUsage.count()).toBe(0);
  });
});
