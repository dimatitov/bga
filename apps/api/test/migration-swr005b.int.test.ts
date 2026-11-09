/**
 * SWR-005B migration `20261108230000_ai_usage` (plan-backend §7, W3; TC-UC-19, TC-UC-17/TC-S-10 schema part):
 * CREATE only — a new `AiUsage` table + index; `Session` / `SessionEvent` (schema objects and rows) untouched.
 * Cost is stored as integer micro-USD (Q-15); `pricingVersion` per row (AM-BE-7); no prompt/response text columns.
 */
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ROOT, TMP_DIR } from './global-setup';
import { INIT_MIGRATION, SESSIONS_MIGRATION, prisma } from './support/pre-migration-db';
import { v2Sessions, type V2SessionFixture } from './support/swr004-db';

const SWR004_MIGRATION = '20261108200000_session_status_idempotency';
const SWR005B_MIGRATION = '20261108230000_ai_usage';
const MIGRATIONS_DIR = join(API_ROOT, 'prisma', 'migrations');

type RawRow = Record<string, unknown>;

async function raw(url: string, sql: string): Promise<RawRow[]> {
  const client = new PrismaClient({ datasourceUrl: url });
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

interface TempDb {
  url: string;
  remove(): void;
}

/** Empty SQLite file → `migrate deploy` of the real migrations folder (the current chain). */
function createCleanDb(): TempDb {
  const file = join(TMP_DIR, `test-swr005b-clean-${randomUUID()}.db`);
  const url = `file:${file}`;
  prisma(url, ['migrate', 'deploy']);
  return {
    url,
    remove: () => {
      for (const suffix of ['', '-journal']) rmSync(`${file}${suffix}`, { force: true });
    },
  };
}

interface Swr005ShapeDb extends TempDb {
  sessions: V2SessionFixture[];
}

/**
 * A DB in the SWR-005 shape (= before SWR-005B): only the three earlier migrations are deployed — from a temp copy
 * of the migrations folder without `20261108230000_ai_usage` — then `Session` / `SessionEvent` rows of the frozen
 * v2 snapshot are inserted raw. The real migrations folder is then deployed on top, as on a dev DB.
 */
async function createSwr005ShapeDb(): Promise<Swr005ShapeDb> {
  const id = randomUUID();
  const dir = join(TMP_DIR, `test-swr005-shape-${id}`);
  const file = join(TMP_DIR, `test-swr005-shape-${id}.db`);
  const url = `file:${file}`;
  const remove = () => {
    rmSync(dir, { recursive: true, force: true });
    for (const suffix of ['', '-journal']) rmSync(`${file}${suffix}`, { force: true });
  };
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  cpSync(join(API_ROOT, 'prisma', 'schema.prisma'), join(dir, 'schema.prisma'));
  for (const entry of readdirSync(MIGRATIONS_DIR)) {
    if (entry === SWR005B_MIGRATION) continue;
    cpSync(join(MIGRATIONS_DIR, entry), join(dir, 'migrations', entry), { recursive: true });
  }
  prisma(url, ['migrate', 'deploy', '--schema', join(dir, 'schema.prisma')]);

  const sessions = v2Sessions();
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    for (const s of [...sessions].reverse()) {
      await client.$executeRaw`INSERT INTO "Session" ("id", "gameId", "setup", "state", "version", "status", "createdAt", "updatedAt")
        VALUES (${s.id}, ${s.gameId}, ${JSON.stringify(s.setup)}, ${JSON.stringify(s.state)}, ${s.version}, ${s.status}, ${BigInt(new Date(s.createdAt).getTime())}, ${BigInt(new Date(s.updatedAt).getTime())})`;
      for (const e of s.events) {
        await client.$executeRaw`INSERT INTO "SessionEvent" ("sessionId", "seq", "type", "actor", "payload", "createdAt")
          VALUES (${s.id}, ${e.seq}, ${e.type}, ${e.actor}, ${JSON.stringify(e.payload)}, ${BigInt(new Date(e.at).getTime())})`;
      }
    }
    // one session created through an idempotent POST in SWR-004/005 (key + hash set)
    await client.$executeRaw`UPDATE "Session" SET "idempotencyKey" = 'k-1', "idempotencyHash" = 'h-1' WHERE "id" = ${sessions[0]!.id}`;
  } finally {
    await client.$disconnect();
  }
  return { url, sessions, remove };
}

/** Byte-level dump of the existing tables: every column as hex, so any rewrite of the stored JSON is visible. */
const SESSION_HEX = `SELECT hex("id") AS id, hex("gameId") AS gameId, hex("setup") AS setup, hex("state") AS state,
  "version", hex("createdAt") AS createdAt, hex("updatedAt") AS updatedAt, hex("status") AS status,
  hex("idempotencyKey") AS idempotencyKey, hex("idempotencyHash") AS idempotencyHash FROM "Session" ORDER BY "id"`;
const EVENT_HEX = `SELECT "id", hex("sessionId") AS sessionId, "seq", hex("type") AS type, hex("actor") AS actor,
  hex("payload") AS payload, hex("createdAt") AS createdAt FROM "SessionEvent" ORDER BY "id"`;
const SCHEMA_OBJECTS = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY type, name`;

/** `PRAGMA table_info('AiUsage')` expected after the migration (§7.2 with Q-15 integer micro-USD). */
const AI_USAGE_COLUMNS = [
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

// Several Prisma CLI runs per test: slow when the whole suite runs in parallel.
describe(`migration ${SWR005B_MIGRATION}`, { timeout: 60_000 }, () => {
  let db: TempDb | undefined;

  afterEach(() => {
    db?.remove();
    db = undefined;
  });

  it('SQL of earlier migrations is unchanged; the new SQL is CREATE-only, no game words, no prompt/response columns', () => {
    expect(sha(migrationSql(INIT_MIGRATION))).toBe(
      '4915407ea5c0ff1b41885db1a41aa0171024732465d67d47efb00adcdf7a6a13',
    );
    expect(sha(migrationSql(SESSIONS_MIGRATION))).toBe(
      'fdc537c6a6841eeee30c9185911b154c38773a6a0684beac4c56417639ae62f8',
    );
    expect(sha(migrationSql(SWR004_MIGRATION))).toBe(
      '9bd55de2b2c6102b4ff3764787ae3d2c566351b99972c2064b0cf573dc7d432d',
    );
    expect(
      readdirSync(MIGRATIONS_DIR)
        .filter((e) => e !== 'migration_lock.toml')
        .sort(),
    ).toEqual([INIT_MIGRATION, SESSIONS_MIGRATION, SWR004_MIGRATION, SWR005B_MIGRATION]);

    const sql = migrationSql(SWR005B_MIGRATION).toString('utf8');
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^CREATE TABLE "AiUsage" \(/);
    expect(statements[1]).toMatch(/^CREATE INDEX "AiUsage_budgetKey_createdAt_idx" ON "AiUsage"/);
    expect(sql).not.toMatch(/\b(DROP|ALTER|INSERT|UPDATE|DELETE|PRAGMA)\b/i);
    expect(sql).not.toMatch(/"Session"|"SessionEvent"/);
    expect(sql).not.toMatch(/rebel|empire|faction|rebellion|forbidden|leader|planet|imperial/i);
    expect(statements.join('\n')).not.toMatch(
      /prompt|response|"text"|content|message|apiKey|secret/i,
    );
  });

  it('clean DB: AiUsage columns, defaults and (budgetKey, createdAt) index; integer micro-USD sums are exact', async () => {
    db = createCleanDb();
    const columns = await raw(db.url, `PRAGMA table_info('AiUsage')`);
    expect(
      columns.map((c) => ({
        name: c.name,
        type: c.type,
        notnull: Number(c.notnull),
        dflt_value: c.dflt_value,
        pk: Number(c.pk),
      })),
    ).toEqual(AI_USAGE_COLUMNS);

    const indexes = await raw(db.url, `PRAGMA index_list('AiUsage')`);
    const idx = indexes.find((i) => i.name === 'AiUsage_budgetKey_createdAt_idx');
    expect(Number(idx?.unique)).toBe(0);
    expect(
      (await raw(db.url, `PRAGMA index_info('AiUsage_budgetKey_createdAt_idx')`)).map(
        (c) => c.name,
      ),
    ).toEqual(['budgetKey', 'createdAt']);

    const client = new PrismaClient({ datasourceUrl: db.url });
    try {
      // mock row: only the required fields → defaults (0 tokens, cost 0, createdAt now)
      const mock = await client.aiUsage.create({
        data: {
          id: randomUUID(),
          budgetKey: 'dev-diagnostics',
          provider: 'mock',
          model: 'mock-deterministic-v1',
          role: 'tactical',
          status: 'ok',
          attempts: 1,
          pricingVersion: 'test-v1',
          durationMs: 3,
        },
      });
      expect(mock).toMatchObject({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        estimatedCostMicroUsd: 0,
        errorCode: null,
      });
      expect(mock.createdAt).toBeInstanceOf(Date);

      // budget refusal: 0 attempts, no paid call
      await client.aiUsage.create({
        data: {
          id: randomUUID(),
          budgetKey: 'dev-diagnostics',
          provider: 'openai',
          model: 'some-model',
          role: 'strategy',
          status: 'budget_exceeded',
          attempts: 0,
          pricingVersion: 'test-v1',
          durationMs: 0,
          errorCode: 'AI_BUDGET_EXCEEDED',
        },
      });

      // 0.10 + 0.15 USD as micro-USD: exactly 250 000 (no 0.25000000000000003, TC-B-04)
      for (const cost of [100_000, 150_000]) {
        await client.aiUsage.create({
          data: {
            id: randomUUID(),
            budgetKey: 'dev-diagnostics',
            provider: 'openai',
            model: 'some-model',
            role: 'tactical',
            status: 'ok',
            attempts: 1,
            inputTokens: 1200,
            cachedInputTokens: 200,
            outputTokens: 50,
            reasoningTokens: 10,
            estimatedCostMicroUsd: cost,
            pricingVersion: 'test-v1',
            durationMs: 900,
          },
        });
      }
      const sum = await client.aiUsage.aggregate({
        where: { budgetKey: 'dev-diagnostics' },
        _sum: { estimatedCostMicroUsd: true },
        _count: true,
      });
      expect(sum._count).toBe(4);
      expect(sum._sum.estimatedCostMicroUsd).toBe(250_000);
      expect(
        Number.isInteger(
          (await client.aiUsage.findFirstOrThrow({ where: { status: 'budget_exceeded' } }))
            .estimatedCostMicroUsd,
        ),
      ).toBe(true);

      // NOT NULL guards on the columns the service must always fill
      await expect(
        client.$executeRawUnsafe(
          `INSERT INTO "AiUsage" ("id", "budgetKey", "provider", "model", "role", "status", "attempts", "durationMs") VALUES ('x', 'k', 'mock', 'm', 'tactical', 'ok', 1, 1)`,
        ),
      ).rejects.toThrow(/NOT NULL/);
    } finally {
      await client.$disconnect();
    }
  });

  it('TC-UC-19: SWR-005-shape DB with sessions → deploy adds only AiUsage; Session/SessionEvent rows and schema byte-equal; re-deploy no-op', async () => {
    const shaped = await createSwr005ShapeDb();
    db = shaped;
    const before = {
      sessions: await raw(shaped.url, SESSION_HEX),
      events: await raw(shaped.url, EVENT_HEX),
      schema: await raw(shaped.url, SCHEMA_OBJECTS),
    };
    expect(before.sessions).toHaveLength(shaped.sessions.length);
    expect(before.events).toHaveLength(shaped.sessions.reduce((n, s) => n + s.events.length, 0));
    expect(before.schema.some((o) => o.name === 'AiUsage')).toBe(false);

    const out = prisma(shaped.url, ['migrate', 'deploy']);
    expect(out).toContain(SWR005B_MIGRATION);
    expect(out).not.toContain(SWR004_MIGRATION);

    expect(await raw(shaped.url, SESSION_HEX)).toEqual(before.sessions);
    expect(await raw(shaped.url, EVENT_HEX)).toEqual(before.events);
    const after = await raw(shaped.url, SCHEMA_OBJECTS);
    const added = after.filter((o) => !before.schema.some((b) => b.name === o.name));
    expect(after.filter((o) => before.schema.some((b) => b.name === o.name))).toEqual(
      before.schema,
    );
    expect(added.map((o) => `${o.type}:${o.name}`).sort()).toEqual([
      'index:AiUsage_budgetKey_createdAt_idx',
      'table:AiUsage',
    ]);
    expect(await raw(shaped.url, 'SELECT count(*) AS n FROM "AiUsage"')).toEqual([{ n: 0n }]);

    const migrations = await raw(
      shaped.url,
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    expect(migrations.map((m) => m.migration_name)).toEqual([
      INIT_MIGRATION,
      SESSIONS_MIGRATION,
      SWR004_MIGRATION,
      SWR005B_MIGRATION,
    ]);
    expect(await raw(shaped.url, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(await raw(shaped.url, 'PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);

    expect(prisma(shaped.url, ['migrate', 'deploy'])).toMatch(/No pending migrations/);
    expect(await raw(shaped.url, SESSION_HEX)).toEqual(before.sessions);
    expect(await raw(shaped.url, EVENT_HEX)).toEqual(before.events);
  });
});
