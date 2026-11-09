import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import { PlayerViewSchema } from '@bga/game-rebellion/schema';
import { rebellionServerModule, upcastState } from '@bga/game-rebellion/server';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ROOT } from './global-setup';
import { R, advanceEnv, postCommand } from './support/fixtures';
import {
  INIT_MIGRATION,
  SESSIONS_MIGRATION,
  createPreMigrationDb,
  prisma,
  type PreMigrationDb,
} from './support/pre-migration-db';
import { api, startApp, stopApp } from './support/test-app';

interface RawRow {
  [key: string]: unknown;
}

/** Raw rows (no Prisma model mapping): exactly what is stored. */
async function raw(url: string, sql: string): Promise<RawRow[]> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    return await client.$queryRawUnsafe<RawRow[]>(sql);
  } finally {
    await client.$disconnect();
  }
}

function deploy(url: string): string {
  return prisma(url, ['migrate', 'deploy']);
}

/**
 * Per-test timeout of the Prisma-CLI-heavy tests (pre-migration DB + `migrate deploy` spawn the Prisma CLI):
 * > 20 s only under the parallel `pnpm -r test` load (SWR-005 INTEGRATION decision). The global api
 * `testTimeout` is unchanged.
 */
const PRISMA_CLI_TIMEOUT = { timeout: 60_000 };

describe('migration 20261108120000_sessions (AC-7, TR-6)', () => {
  let db: PreMigrationDb | undefined;

  afterEach(() => {
    db?.remove();
    db = undefined;
  });

  it('TC-MIG-06: the init migration is unchanged since SWR-002', () => {
    const sql = readFileSync(
      join(API_ROOT, 'prisma', 'migrations', INIT_MIGRATION, 'migration.sql'),
    );
    expect(createHash('sha256').update(sql).digest('hex')).toBe(
      '4915407ea5c0ff1b41885db1a41aa0171024732465d67d47efb00adcdf7a6a13',
    );
  });

  it(
    'TC-MIG-01/05: 3 SWR-002 games → Session rows byte-equal + gameId backfill; events kept; re-deploy is a no-op',
    PRISMA_CLI_TIMEOUT,
    async () => {
      db = await createPreMigrationDb({ rows: 3 });
      const gamesBefore = await raw(db.url, 'SELECT * FROM "Game" ORDER BY "id"');
      const eventsBefore = await raw(db.url, 'SELECT * FROM "GameEvent" ORDER BY "id"');
      expect(gamesBefore).toHaveLength(3);
      expect(eventsBefore).toHaveLength(db.events.length);
      expect(eventsBefore.length).toBe(1 + 5 + 1);

      deploy(db.url);

      const sessions = await raw(
        db.url,
        'SELECT "id", "setup", "state", "version", "createdAt", "updatedAt", "gameId" FROM "Session" ORDER BY "id"',
      );
      expect(sessions.map(({ gameId: _g, ...rest }) => rest)).toEqual(gamesBefore);
      expect(sessions.every((s) => s.gameId === R)).toBe(true);

      const events = await raw(
        db.url,
        'SELECT "id", "sessionId" AS "gameId", "seq", "type", "actor", "payload", "createdAt" FROM "SessionEvent" ORDER BY "id"',
      );
      expect(events).toEqual(eventsBefore);

      const tables = await raw(
        db.url,
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'Game%'`,
      );
      expect(tables).toEqual([]);
      const migrations = await raw(
        db.url,
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name',
      );
      // SWR-004: the whole chain is applied in one deploy (TC-M-06; columns checked in migration-swr004).
      expect(migrations.map((m) => m.migration_name)).toEqual([
        INIT_MIGRATION,
        SESSIONS_MIGRATION,
        '20261108200000_session_status_idempotency',
        // SWR-005B: AiUsage (CREATE only; checked in migration-swr005b).
        '20261108230000_ai_usage',
      ]);
      expect(await raw(db.url, 'PRAGMA foreign_key_check')).toEqual([]);
      expect(await raw(db.url, 'PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);

      // TC-MIG-05: second deploy — nothing pending, data unchanged.
      expect(deploy(db.url)).toMatch(/No pending migrations/);
      expect(
        await raw(
          db.url,
          'SELECT "id", "setup", "state", "version", "createdAt", "updatedAt", "gameId" FROM "Session" ORDER BY "id"',
        ),
      ).toEqual(sessions);
    },
  );

  it(
    'TC-MIG-02: the migrated sessions work through the API (order, views, next command)',
    PRISMA_CLI_TIMEOUT,
    async () => {
      db = await createPreMigrationDb({ rows: 3 });
      deploy(db.url);
      const app = await startApp(db.url);
      try {
        const byUpdatedDesc = [...db.games].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
        );
        const list = await api(app).get(`/api/sessions?gameId=${R}`);
        expect(list.status).toBe(200);
        const summaries = ListSessionsResponseSchema.parse(list.body);
        expect(summaries.map((s) => s.sessionId)).toEqual(byUpdatedDesc.map((g) => g.id));
        for (const [i, s] of summaries.entries()) {
          const game = byUpdatedDesc[i]!;
          expect(s).toMatchObject({
            gameId: R,
            version: game.version,
            createdAt: game.createdAt.toISOString(),
            updatedAt: game.updatedAt.toISOString(),
          });
        }
        expect((await api(app).get('/api/sessions')).body).toEqual(list.body);

        for (const game of db.games) {
          const res = await api(app).get(`/api/sessions/${game.id}`);
          expect(res.status).toBe(200);
          const body = SessionResponseSchema.parse(res.body);
          // SWR-004: the stored v1 snapshot is upcast lazily on read.
          const state = upcastState(JSON.parse(game.state));
          expect(body.gameId).toBe(R);
          expect(body.status).toBe('prototype');
          expect(body.view).toEqual(
            PlayerViewSchema.parse(
              rebellionServerModule.toPlayerView(state, { status: 'prototype' }),
            ),
          );
        }

        const played = db.games.find((g) => g.version > 1)!;
        const actor = upcastState(JSON.parse(played.state)).settings.playerFaction;
        const res = await postCommand(app, played.id, advanceEnv(actor, played.version));
        expect(res.status).toBe(200);
        expect(res.body.view.version).toBe(played.version + 1);
        const rows = await raw(
          db.url,
          `SELECT "seq" FROM "SessionEvent" WHERE "sessionId" = '${played.id}' ORDER BY "seq"`,
        );
        expect(rows.map((r) => Number(r.seq))).toEqual(
          Array.from({ length: played.version + 1 }, (_, i) => i + 1),
        );
      } finally {
        await stopApp(app);
      }
    },
  );

  it(
    'TC-MIG-03: NOT NULL gameId, (gameId, updatedAt) index, (sessionId, seq) unique, cascade delete',
    PRISMA_CLI_TIMEOUT,
    async () => {
      db = await createPreMigrationDb({ rows: 3 });
      deploy(db.url);
      const client = new PrismaClient({ datasourceUrl: db.url });
      try {
        await expect(
          client.$executeRawUnsafe(
            `INSERT INTO "Session" ("id", "setup", "state", "version", "updatedAt") VALUES ('x', '{}', '{}', 1, 0)`,
          ),
        ).rejects.toThrow(/NOT NULL/);

        const indexes = await client.$queryRawUnsafe<RawRow[]>(`PRAGMA index_list('Session')`);
        const names = indexes.map((i) => i.name);
        expect(names).toEqual(
          expect.arrayContaining(['Session_gameId_updatedAt_idx', 'Session_updatedAt_idx']),
        );
        const cols = await client.$queryRawUnsafe<RawRow[]>(
          `PRAGMA index_info('Session_gameId_updatedAt_idx')`,
        );
        expect(cols.map((c) => c.name)).toEqual(['gameId', 'updatedAt']);
        const eventIdx = await client.$queryRawUnsafe<RawRow[]>(
          `PRAGMA index_list('SessionEvent')`,
        );
        const unique = eventIdx.find((i) => i.name === 'SessionEvent_sessionId_seq_key');
        expect(Number(unique?.unique)).toBe(1);

        const played = db.games.find((g) => g.version > 1)!;
        await expect(
          client.sessionEvent.create({
            data: { sessionId: played.id, seq: 1, type: 'X', actor: 'system', payload: '{}' },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });

        await client.session.delete({ where: { id: played.id } });
        expect(await client.sessionEvent.count({ where: { sessionId: played.id } })).toBe(0);
        expect(await client.sessionEvent.count()).toBeGreaterThan(0);
      } finally {
        await client.$disconnect();
      }
    },
  );

  it(
    'TC-MIG-04: an empty SWR-002 DB migrates to empty Session / SessionEvent',
    PRISMA_CLI_TIMEOUT,
    async () => {
      db = await createPreMigrationDb({ rows: 0 });
      deploy(db.url);
      expect(await raw(db.url, 'SELECT count(*) AS n FROM "Session"')).toEqual([{ n: 0n }]);
      expect(await raw(db.url, 'SELECT count(*) AS n FROM "SessionEvent"')).toEqual([{ n: 0n }]);
    },
  );
});
