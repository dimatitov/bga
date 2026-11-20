/**
 * SWR-008 migration `20261120120000_ai_usage_rules` (plan-backend §5, W6a; TC-COST-06, TC-COST-04 schema part,
 * TC-RS-06 migration part): ADD COLUMN only on `AiUsage` — no table rebuild, `Session` / `SessionEvent` untouched,
 * existing AiUsage rows keep every byte and read with the "rules off" defaults; the budget sum and the
 * `reset-ai-budget` script keep working on a migrated DB.
 *
 * The pre-SWR-008 DB is built per run: the four earlier migrations are deployed from a temp copy of the migrations
 * folder (= the SWR-005B..007 shape), then sessions (frozen v2 snapshot) and AiUsage rows are inserted raw. The real
 * migrations folder is then deployed on top, as on a dev DB. Never dev.db.
 *
 * Opt-in (TC-RS-06, real dev data on a COPY): `SWR008_DEV_DB=prisma/dev.pre-swr008.db npx vitest run
 * test/migration-swr008.int.test.ts` — the original is only read (sha256 before/after must match).
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { AiUsageRepository, ruleIdsOf } from '../src/ai/ai-usage.repository';
import { createSqliteAdapter } from '../src/persistence/sqlite-adapter';
import { API_ROOT, TMP_DIR } from './global-setup';
import { INIT_MIGRATION, SESSIONS_MIGRATION, prisma } from './support/pre-migration-db';
import { v2Sessions } from './support/swr004-db';
import { api, startApp, stopApp } from './support/test-app';

const SWR004_MIGRATION = '20261108200000_session_status_idempotency';
const SWR005B_MIGRATION = '20261108230000_ai_usage';
const SWR008_MIGRATION = '20261120120000_ai_usage_rules';
const MIGRATIONS_DIR = join(API_ROOT, 'prisma', 'migrations');
const RESET_SCRIPT = join(API_ROOT, 'scripts', 'reset-ai-budget.mjs');

type RawRow = Record<string, unknown>;

async function raw(url: string, sql: string): Promise<RawRow[]> {
  const client = new PrismaClient({ adapter: createSqliteAdapter(url) });
  try {
    return await client.$queryRawUnsafe<RawRow[]>(sql);
  } finally {
    await client.$disconnect();
  }
}

function migrationSql(name: string): Buffer {
  return readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'));
}

function sha(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function removeDbFile(file: string): void {
  for (const suffix of ['', '-journal']) rmSync(`${file}${suffix}`, { force: true });
}

/** The 16 SWR-005B columns, unchanged (same as migration-swr005b.int.test.ts). */
const OLD_COLUMNS = [
  { name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
  { name: 'budgetKey', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'provider', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'model', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'role', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'status', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'attempts', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'inputTokens', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'cachedInputTokens', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'outputTokens', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'reasoningTokens', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'estimatedCostMicroUsd', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'pricingVersion', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'durationMs', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'errorCode', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'createdAt', type: 'DATETIME', notnull: 1, dflt_value: 'CURRENT_TIMESTAMP', pk: 0 },
];

/** The 9 SWR-008 columns appended at the end (plan §5). */
const NEW_COLUMNS = [
  { name: 'rulesEnabled', type: 'BOOLEAN', notnull: 1, dflt_value: 'false', pk: 0 },
  { name: 'rulesVersion', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'rulesCount', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'rulesIds', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'rulesChars', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'rulesTokensEstimate', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'rulesTruncated', type: 'BOOLEAN', notnull: 1, dflt_value: 'false', pk: 0 },
  { name: 'rulesDropped', type: 'BOOLEAN', notnull: 1, dflt_value: 'false', pk: 0 },
  { name: 'promptTokensUpperBound', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
];

async function columnsOf(url: string): Promise<RawRow[]> {
  return (await raw(url, `PRAGMA table_info('AiUsage')`)).map((c) => ({
    name: c.name,
    type: c.type,
    notnull: Number(c.notnull),
    dflt_value: c.dflt_value,
    pk: Number(c.pk),
  }));
}

/** AiUsage rows as SWR-005B/006 wrote them (cost in micro-USD, two keys, every status family). */
const OLD_USAGE = [
  {
    key: 'session-a',
    provider: 'openai',
    status: 'ok',
    attempts: 1,
    cost: 120,
    input: 1500,
    cached: 200,
    output: 40,
    err: null,
  },
  {
    key: 'session-a',
    provider: 'openai',
    status: 'timeout',
    attempts: 3,
    cost: 300,
    input: 4500,
    cached: 0,
    output: 0,
    err: 'AI_TIMEOUT',
  },
  {
    key: 'session-a',
    provider: 'openai',
    status: 'budget_exceeded',
    attempts: 0,
    cost: 0,
    input: 0,
    cached: 0,
    output: 0,
    err: 'AI_BUDGET_EXCEEDED',
  },
  {
    key: 'dev-diagnostics',
    provider: 'mock',
    status: 'ok',
    attempts: 1,
    cost: 0,
    input: 0,
    cached: 0,
    output: 0,
    err: null,
  },
  {
    key: 'dev-diagnostics',
    provider: 'openai',
    status: 'ok',
    attempts: 1,
    cost: 77,
    input: 900,
    cached: 0,
    output: 25,
    err: null,
  },
] as const;

interface ShapeDb {
  url: string;
  file: string;
  remove(): void;
}

/** SWR-005B..007 shape: four migrations, sessions of the v2 snapshot + AiUsage rows, inserted raw. */
async function createPreSwr008Db(): Promise<ShapeDb> {
  const id = randomUUID();
  const dir = join(TMP_DIR, `test-swr008-shape-${id}`);
  const file = join(TMP_DIR, `test-swr008-shape-${id}.db`);
  const url = `file:${file}`;
  const remove = () => {
    rmSync(dir, { recursive: true, force: true });
    removeDbFile(file);
  };
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  cpSync(join(API_ROOT, 'prisma', 'schema.prisma'), join(dir, 'schema.prisma'));
  for (const entry of readdirSync(MIGRATIONS_DIR)) {
    if (entry === SWR008_MIGRATION) continue;
    cpSync(join(MIGRATIONS_DIR, entry), join(dir, 'migrations', entry), { recursive: true });
  }
  prisma(url, ['migrate', 'deploy', '--schema', join(dir, 'schema.prisma')]);

  const client = new PrismaClient({ adapter: createSqliteAdapter(url) });
  try {
    for (const s of v2Sessions()) {
      await client.$executeRaw`INSERT INTO "Session" ("id", "gameId", "setup", "state", "version", "status", "createdAt", "updatedAt")
        VALUES (${s.id}, ${s.gameId}, ${JSON.stringify(s.setup)}, ${JSON.stringify(s.state)}, ${s.version}, ${s.status}, ${BigInt(new Date(s.createdAt).getTime())}, ${BigInt(new Date(s.updatedAt).getTime())})`;
      for (const e of s.events) {
        await client.$executeRaw`INSERT INTO "SessionEvent" ("sessionId", "seq", "type", "actor", "payload", "createdAt")
          VALUES (${s.id}, ${e.seq}, ${e.type}, ${e.actor}, ${JSON.stringify(e.payload)}, ${BigInt(new Date(e.at).getTime())})`;
      }
    }
    for (const [i, u] of OLD_USAGE.entries()) {
      await client.$executeRaw`INSERT INTO "AiUsage" ("id", "budgetKey", "provider", "model", "role", "status", "attempts", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "estimatedCostMicroUsd", "pricingVersion", "durationMs", "errorCode", "createdAt")
        VALUES (${`00000000-0000-4000-8000-00000000000${i}`}, ${u.key}, ${u.provider}, ${u.provider === 'mock' ? 'mock-deterministic-v1' : 'gpt-6-luna'}, 'tactical', ${u.status}, ${u.attempts}, ${u.input}, ${u.cached}, ${u.output}, ${null}, ${u.cost}, 'openai-2026-11-08', ${100 + i}, ${u.err}, ${BigInt(Date.UTC(2026, 10, 10, 10, i))})`;
    }
  } finally {
    await client.$disconnect();
  }
  return { url, file, remove };
}

const SESSION_HEX = `SELECT hex("id") AS id, hex("gameId") AS gameId, hex("setup") AS setup, hex("state") AS state,
  "version", hex("createdAt") AS createdAt, hex("updatedAt") AS updatedAt, hex("status") AS status,
  hex("idempotencyKey") AS idempotencyKey, hex("idempotencyHash") AS idempotencyHash FROM "Session" ORDER BY "id"`;
const EVENT_HEX = `SELECT "id", hex("sessionId") AS sessionId, "seq", hex("type") AS type, hex("actor") AS actor,
  hex("payload") AS payload, hex("createdAt") AS createdAt FROM "SessionEvent" ORDER BY "id"`;
const OLD_USAGE_HEX = `SELECT ${OLD_COLUMNS.map((c) => `hex("${c.name}") AS "${c.name}"`).join(', ')} FROM "AiUsage" ORDER BY "id"`;
const SCHEMA_OBJECTS = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY type, name`;

describe(`migration ${SWR008_MIGRATION}`, { timeout: 60_000 }, () => {
  let db: ShapeDb | undefined;

  afterEach(() => {
    db?.remove();
    db = undefined;
  });

  it('earlier SQL unchanged; the new SQL is 9 × ADD COLUMN on AiUsage, no rebuild, no game words, no text columns', () => {
    expect(sha(migrationSql(INIT_MIGRATION))).toBe(
      '4915407ea5c0ff1b41885db1a41aa0171024732465d67d47efb00adcdf7a6a13',
    );
    expect(sha(migrationSql(SESSIONS_MIGRATION))).toBe(
      'fdc537c6a6841eeee30c9185911b154c38773a6a0684beac4c56417639ae62f8',
    );
    expect(sha(migrationSql(SWR004_MIGRATION))).toBe(
      '9bd55de2b2c6102b4ff3764787ae3d2c566351b99972c2064b0cf573dc7d432d',
    );
    expect(sha(migrationSql(SWR005B_MIGRATION))).toBe(
      '8257753cb9a2c98e89326075d35729980d05fdbfd7e5104cba9f135fa89a2428',
    );
    expect(
      readdirSync(MIGRATIONS_DIR)
        .filter((e) => e !== 'migration_lock.toml')
        .sort(),
    ).toEqual([
      INIT_MIGRATION,
      SESSIONS_MIGRATION,
      SWR004_MIGRATION,
      SWR005B_MIGRATION,
      SWR008_MIGRATION,
    ]);

    const sql = migrationSql(SWR008_MIGRATION).toString('utf8');
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(NEW_COLUMNS.length);
    statements.forEach((statement, i) => {
      expect(statement).toMatch(
        new RegExp(`^ALTER TABLE "AiUsage" ADD COLUMN "${NEW_COLUMNS[i]!.name}" `),
      );
    });
    expect(statements.join('\n')).not.toMatch(
      /\b(DROP|CREATE|INSERT|UPDATE|DELETE|PRAGMA|RENAME)\b/i,
    );
    expect(sql).not.toMatch(/"Session"|"SessionEvent"/);
    expect(sql).not.toMatch(/rebel|empire|faction|rebellion|forbidden|leader|planet|imperial/i);
    // TC-COST-04: no column for prompt / rule text / situation / reason / key (the token bound is a number)
    for (const c of NEW_COLUMNS) {
      expect(c.name).not.toMatch(
        /prompt(?!TokensUpperBound)|instruction|situation|text|reason|content|message|apiKey|secret/i,
      );
    }
  });

  it('clean DB: SWR-005B columns unchanged + the 9 rules columns with "rules off" defaults; index kept', async () => {
    const file = join(TMP_DIR, `test-swr008-clean-${randomUUID()}.db`);
    db = { url: `file:${file}`, file, remove: () => removeDbFile(file) };
    prisma(db.url, ['migrate', 'deploy']);
    expect(await columnsOf(db.url)).toEqual([...OLD_COLUMNS, ...NEW_COLUMNS]);
    expect(
      (await raw(db.url, `PRAGMA index_info('AiUsage_budgetKey_createdAt_idx')`)).map(
        (c) => c.name,
      ),
    ).toEqual(['budgetKey', 'createdAt']);
  });

  it('TC-COST-06: pre-SWR-008 DB → deploy adds only the columns; old rows byte-equal, read with defaults; budget sums unchanged; re-deploy no-op', async () => {
    const shaped = await createPreSwr008Db();
    db = shaped;
    const before = {
      sessions: await raw(shaped.url, SESSION_HEX),
      events: await raw(shaped.url, EVENT_HEX),
      usage: await raw(shaped.url, OLD_USAGE_HEX),
      schema: await raw(shaped.url, SCHEMA_OBJECTS),
    };
    expect(before.sessions.length).toBeGreaterThan(0);
    expect(before.usage).toHaveLength(OLD_USAGE.length);
    expect(await columnsOf(shaped.url)).toEqual(OLD_COLUMNS);

    const out = prisma(shaped.url, ['migrate', 'deploy']);
    expect(out).toContain(SWR008_MIGRATION);
    expect(out).not.toContain(SWR005B_MIGRATION);

    expect(await raw(shaped.url, SESSION_HEX)).toEqual(before.sessions);
    expect(await raw(shaped.url, EVENT_HEX)).toEqual(before.events);
    expect(await raw(shaped.url, OLD_USAGE_HEX)).toEqual(before.usage);
    expect(await columnsOf(shaped.url)).toEqual([...OLD_COLUMNS, ...NEW_COLUMNS]);
    // schema objects: only the AiUsage table definition changed (columns appended); nothing added or removed
    const after = await raw(shaped.url, SCHEMA_OBJECTS);
    expect(after.map((o) => `${o.type}:${o.name}`)).toEqual(
      before.schema.map((o) => `${o.type}:${o.name}`),
    );
    expect(after.filter((o) => o.name !== 'AiUsage')).toEqual(
      before.schema.filter((o) => o.name !== 'AiUsage'),
    );

    const client = new PrismaClient({ adapter: createSqliteAdapter(shaped.url) });
    try {
      const repo = new AiUsageRepository(client);
      const rows = await repo.listByBudgetKey('session-a', 10);
      expect(rows.map((r) => r.status)).toEqual(['ok', 'timeout', 'budget_exceeded']);
      for (const r of [...rows, ...(await repo.listByBudgetKey('dev-diagnostics', 10))]) {
        expect(r).toMatchObject({
          rulesEnabled: false,
          rulesVersion: null,
          rulesCount: 0,
          rulesIds: null,
          rulesChars: 0,
          rulesTokensEstimate: 0,
          rulesTruncated: false,
          rulesDropped: false,
          promptTokensUpperBound: null,
        });
        expect(ruleIdsOf(r)).toEqual([]);
      }
      expect(await repo.sumCostMicroUsd('session-a')).toBe(420);
      expect(await repo.sumCostMicroUsd('dev-diagnostics')).toBe(77);
      // a new SWR-008 row on the migrated DB
      await repo.insert({
        budgetKey: 'session-a',
        provider: 'openai',
        model: 'gpt-6-luna',
        role: 'tactical',
        status: 'ok',
        attempts: 1,
        inputTokens: 3000,
        cachedInputTokens: 1024,
        outputTokens: 30,
        reasoningTokens: null,
        estimatedCostMicroUsd: 200,
        pricingVersion: 'openai-2026-11-08',
        durationMs: 700,
        errorCode: null,
        rulesEnabled: true,
        rulesVersion: 'fake@1:0123456789ab',
        rulesIds: ['fake:a', 'fake:b'],
        rulesChars: 120,
        promptTokensUpperBound: 5000,
      });
      expect(await repo.sumCostMicroUsd('session-a')).toBe(620);
      expect((await repo.listByBudgetKey('session-a', 1))[0]).toMatchObject({
        rulesCount: 2,
        rulesIds: '["fake:a","fake:b"]',
        rulesTokensEstimate: 30,
      });
    } finally {
      await client.$disconnect();
    }

    const migrations = await raw(
      shaped.url,
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    expect(migrations.map((m) => m.migration_name)).toEqual([
      INIT_MIGRATION,
      SESSIONS_MIGRATION,
      SWR004_MIGRATION,
      SWR005B_MIGRATION,
      SWR008_MIGRATION,
    ]);
    expect(await raw(shaped.url, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(await raw(shaped.url, 'PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(prisma(shaped.url, ['migrate', 'deploy'])).toMatch(/No pending migrations/);
    expect(await raw(shaped.url, SESSION_HEX)).toEqual(before.sessions);
  });

  it('TC-COST-06: reset-ai-budget.mjs works on a migrated DB (deletes only the given key)', async () => {
    const shaped = await createPreSwr008Db();
    db = shaped;
    prisma(shaped.url, ['migrate', 'deploy']);
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const res = spawnSync(
      process.execPath,
      [RESET_SCRIPT, '--database-url', shaped.url, '--key', 'session-a', '--yes'],
      { cwd: API_ROOT, env, encoding: 'utf8' },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(
      await raw(
        shaped.url,
        `SELECT "budgetKey", count(*) AS n FROM "AiUsage" GROUP BY "budgetKey" ORDER BY "budgetKey"`,
      ),
    ).toEqual([{ budgetKey: 'dev-diagnostics', n: 2n }]);
  });
});

const DEV_SOURCE = process.env['SWR008_DEV_DB'];

describe.skipIf(!DEV_SOURCE)(
  'TC-RS-06 (opt-in): copy of a pre-SWR-008 dev DB → deploy; every session and AiUsage row reads',
  { timeout: 120_000 },
  () => {
    const original = DEV_SOURCE
      ? isAbsolute(DEV_SOURCE)
        ? DEV_SOURCE
        : join(API_ROOT, DEV_SOURCE)
      : '';
    const copy = join(TMP_DIR, `devcopy-swr008-${randomUUID()}.db`);
    const url = `file:${copy}`;
    const hashBefore = DEV_SOURCE ? sha(readFileSync(original)) : '';
    const log = (line: string) => console.log(`[swr008-dev-db] ${line}`);

    afterAll(() => {
      removeDbFile(copy);
      if (DEV_SOURCE) {
        const hashAfter = sha(readFileSync(original));
        log(`${original} sha256 before=${hashBefore} after=${hashAfter}`);
        expect(hashAfter).toBe(hashBefore);
      }
    });

    it('deploy on the copy; sessions GET 200; AiUsage rows read with defaults, costs unchanged', async () => {
      copyFileSync(original, copy);
      const usageBefore = await raw(url, OLD_USAGE_HEX).catch(() => [] as RawRow[]);
      log(`copy ${copy}\n${prisma(url, ['migrate', 'deploy'])}`);
      expect(await raw(url, OLD_USAGE_HEX)).toEqual(usageBefore);

      const client = new PrismaClient({ adapter: createSqliteAdapter(url) });
      let sessionIds: string[];
      try {
        sessionIds = (await client.session.findMany({ select: { id: true } })).map((s) => s.id);
        const usage = await client.aiUsage.findMany();
        log(`${sessionIds.length} session(s), ${usage.length} AiUsage row(s)`);
        for (const r of usage) {
          expect(r).toMatchObject({
            rulesEnabled: false,
            rulesCount: 0,
            rulesIds: null,
            promptTokensUpperBound: null,
          });
        }
      } finally {
        await client.$disconnect();
      }
      const app = await startApp(url);
      try {
        for (const id of sessionIds) {
          const res = await api(app).get(`/api/sessions/${id}`);
          expect(res.status, id).toBe(200);
        }
      } finally {
        await stopApp(app);
      }
    });
  },
);
