/**
 * SWR-004 migration `20261108200000_session_status_idempotency` (AC-15, TC-M-*): platform columns only,
 * data-preserving (ALTER TABLE ADD COLUMN, no table rebuild); the JSON in setup/state is not rewritten.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import { upcastState } from '@bga/game-rebellion/server';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ROOT } from './global-setup';
import { R, advanceEnv, postCommand } from './support/fixtures';
import { legacyFactionValues } from './support/legacy-faction';
import {
  INIT_MIGRATION,
  SESSIONS_MIGRATION,
  createPreMigrationDb,
  prisma,
  type PreMigrationDb,
} from './support/pre-migration-db';
import { createSwr003Db, type Swr003Db } from './support/swr003-db';
import { api, startApp, stopApp } from './support/test-app';

const SWR004_MIGRATION = '20261108200000_session_status_idempotency';
/** SWR-005B: applied by the same deploy (CREATE only, see migration-swr005b). */
const SWR005B_MIGRATION = '20261108230000_ai_usage';

type RawRow = Record<string, unknown>;

async function raw(url: string, sql: string): Promise<RawRow[]> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    return await client.$queryRawUnsafe<RawRow[]>(sql);
  } finally {
    await client.$disconnect();
  }
}

const DATA_COLUMNS = '"id", "gameId", "setup", "state", "version", "createdAt", "updatedAt"';

function migrationSha(name: string): string {
  const sql = readFileSync(join(API_ROOT, 'prisma', 'migrations', name, 'migration.sql'));
  return createHash('sha256').update(sql).digest('hex');
}

// Several Prisma CLI runs per test (fixture DB + deploys): slow when the whole suite runs in parallel.
describe(`migration ${SWR004_MIGRATION}`, { timeout: 60_000 }, () => {
  let db: Swr003Db | PreMigrationDb | undefined;

  afterEach(() => {
    db?.remove();
    db = undefined;
  });

  it('TC-M-07: earlier migrations are unchanged (SWR-002 init, SWR-003 sessions); SWR-004 SQL is locked too', () => {
    expect(migrationSha(INIT_MIGRATION)).toBe(
      '4915407ea5c0ff1b41885db1a41aa0171024732465d67d47efb00adcdf7a6a13',
    );
    expect(migrationSha(SESSIONS_MIGRATION)).toBe(
      'fdc537c6a6841eeee30c9185911b154c38773a6a0684beac4c56417639ae62f8',
    );
    expect(migrationSha(SWR004_MIGRATION)).toBe(
      '9bd55de2b2c6102b4ff3764787ae3d2c566351b99972c2064b0cf573dc7d432d',
    );
    const sql = readFileSync(
      join(API_ROOT, 'prisma', 'migrations', SWR004_MIGRATION, 'migration.sql'),
      'utf8',
    );
    // platform columns only — no table rebuild, no data rewrite, no game knowledge
    expect(sql).not.toMatch(/DROP|INSERT|UPDATE|DELETE|CREATE TABLE|rebels|empire|faction/i);
  });

  it('TC-M-01: SWR-003 DB (3 v1 sessions) → deploy: status = prototype, key/hash NULL, unique index; data and events unchanged; re-deploy no-op', async () => {
    db = await createSwr003Db({ rows: 3 });
    const sessionsBefore = await raw(db.url, `SELECT ${DATA_COLUMNS} FROM "Session" ORDER BY "id"`);
    const eventsBefore = await raw(db.url, 'SELECT * FROM "SessionEvent" ORDER BY "id"');
    expect(sessionsBefore).toHaveLength(3);
    expect(eventsBefore.length).toBe(db.events.length);

    const out = prisma(db.url, ['migrate', 'deploy']);
    expect(out).toContain(SWR004_MIGRATION);

    expect(await raw(db.url, `SELECT ${DATA_COLUMNS} FROM "Session" ORDER BY "id"`)).toEqual(
      sessionsBefore,
    );
    expect(await raw(db.url, 'SELECT * FROM "SessionEvent" ORDER BY "id"')).toEqual(eventsBefore);
    expect(
      await raw(
        db.url,
        'SELECT "status", "idempotencyKey", "idempotencyHash" FROM "Session" ORDER BY "id"',
      ),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        status: 'prototype',
        idempotencyKey: null,
        idempotencyHash: null,
      })),
    );

    const columns = await raw(db.url, `PRAGMA table_info('Session')`);
    const col = (name: string) => columns.find((c) => c.name === name);
    expect(col('status')).toMatchObject({ type: 'TEXT', dflt_value: "'prototype'" });
    expect(Number(col('status')?.notnull)).toBe(1);
    expect(Number(col('idempotencyKey')?.notnull)).toBe(0);
    expect(Number(col('idempotencyHash')?.notnull)).toBe(0);

    const indexes = await raw(db.url, `PRAGMA index_list('Session')`);
    const unique = indexes.find((i) => i.name === 'Session_idempotencyKey_key');
    expect(Number(unique?.unique)).toBe(1);
    expect(
      (await raw(db.url, `PRAGMA index_info('Session_idempotencyKey_key')`)).map((c) => c.name),
    ).toEqual(['idempotencyKey']);
    // earlier indexes survive (no table rebuild)
    expect(indexes.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Session_gameId_updatedAt_idx', 'Session_updatedAt_idx']),
    );

    expect(await raw(db.url, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(await raw(db.url, 'PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    const migrations = await raw(
      db.url,
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    expect(migrations.map((m) => m.migration_name)).toEqual([
      INIT_MIGRATION,
      SESSIONS_MIGRATION,
      SWR004_MIGRATION,
      SWR005B_MIGRATION,
    ]);

    expect(prisma(db.url, ['migrate', 'deploy'])).toMatch(/No pending migrations/);
    expect(await raw(db.url, `SELECT ${DATA_COLUMNS} FROM "Session" ORDER BY "id"`)).toEqual(
      sessionsBefore,
    );
  });

  it('unique index: a second row with the same key fails, NULL keys may repeat', async () => {
    db = await createSwr003Db({ rows: 3 });
    prisma(db.url, ['migrate', 'deploy']);
    const client = new PrismaClient({ datasourceUrl: db.url });
    try {
      const [a, b] = db.sessions;
      await client.session.update({ where: { id: a!.id }, data: { idempotencyKey: 'k' } });
      await expect(
        client.session.update({ where: { id: b!.id }, data: { idempotencyKey: 'k' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(await client.session.count({ where: { idempotencyKey: null } })).toBe(2);
    } finally {
      await client.$disconnect();
    }
  });

  it('TC-M-02/03/05: migrated sessions through the API — status prototype, no legacy faction, a command works, rereads are stable', async () => {
    db = await createSwr003Db({ rows: 3 });
    prisma(db.url, ['migrate', 'deploy']);
    const app = await startApp(db.url);
    try {
      const list = await api(app).get(`/api/sessions?gameId=${R}`);
      expect(list.status).toBe(200);
      const summaries = ListSessionsResponseSchema.parse(list.body);
      expect(summaries.map((s) => s.sessionId).sort()).toEqual(db.sessions.map((s) => s.id).sort());
      expect(summaries.every((s) => s.status === 'prototype')).toBe(true);
      expect(legacyFactionValues(list.body)).toEqual([]);

      for (const row of db.sessions) {
        const res = await api(app).get(`/api/sessions/${row.id}`);
        expect(res.status, row.id).toBe(200);
        const body = SessionResponseSchema.parse(res.body);
        expect(body.status).toBe('prototype');
        expect(legacyFactionValues(res.body)).toEqual([]);
        expect(body.settings).toMatchObject({ ruleset: 'base', gameMode: 'digital' });
      }

      for (const row of db.sessions) {
        const actor = upcastState(JSON.parse(row.state)).settings.playerFaction;
        const res = await postCommand(app, row.id, advanceEnv(actor, row.version));
        expect(res.status, row.id).toBe(200);
        expect(res.body.view.version).toBe(row.version + 1);
        expect(legacyFactionValues(res.body)).toEqual([]);
        const reread = await api(app).get(`/api/sessions/${row.id}`);
        expect(reread.body.view).toEqual(res.body.view);
        expect(reread.body.status).toBe('prototype');
      }
    } finally {
      await stopApp(app);
    }
  });

  it('TC-M-06: SWR-002 → SWR-003 → SWR-004 in one deploy; every row prototype and readable', async () => {
    db = await createPreMigrationDb({ rows: 3 });
    const gamesBefore = await raw(
      db.url,
      'SELECT "id", "setup", "state", "version", "createdAt", "updatedAt" FROM "Game" ORDER BY "id"',
    );
    prisma(db.url, ['migrate', 'deploy']);
    const sessions = await raw(
      db.url,
      `SELECT "id", "setup", "state", "version", "createdAt", "updatedAt", "status", "idempotencyKey" FROM "Session" ORDER BY "id"`,
    );
    expect(sessions.map(({ status: _s, idempotencyKey: _k, ...rest }) => rest)).toEqual(
      gamesBefore,
    );
    expect(sessions.every((s) => s.status === 'prototype' && s.idempotencyKey === null)).toBe(true);
    const app = await startApp(db.url);
    try {
      for (const g of db.games) {
        const res = await api(app).get(`/api/sessions/${g.id}`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('prototype');
        expect(legacyFactionValues(res.body)).toEqual([]);
      }
    } finally {
      await stopApp(app);
    }
  });
});
