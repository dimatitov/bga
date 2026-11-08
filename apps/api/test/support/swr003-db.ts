/**
 * TR-4a (SWR-004 R0): a SQLite DB in the SWR-003 shape — migrations `20261107235651_init` and
 * `20261108120000_sessions` applied — with `Session` / `SessionEvent` rows from the frozen v1 snapshot
 * `test/fixtures/v1/sessions.v1.json` (setup/state/actors still carry the legacy faction id).
 * Same technique as `createPreMigrationDb`; generated per run, no binary .db committed.
 */
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { REBELLION_GAME_ID } from '@bga/game-rebellion/definition';
import { TMP_DIR } from '../global-setup';
import {
  INIT_MIGRATION,
  SESSIONS_MIGRATION,
  prisma,
  v1Rows,
  type PreMigrationEvent,
  type PreMigrationGame,
} from './pre-migration-db';

export interface Swr003Db {
  file: string;
  url: string;
  /** Rows as stored (`Session` without `gameId`, which is always Rebellion). */
  sessions: PreMigrationGame[];
  /** `gameId` holds the `sessionId`. */
  events: PreMigrationEvent[];
  remove(): void;
}

export async function createSwr003Db(options: { rows: number }): Promise<Swr003Db> {
  const file = join(TMP_DIR, `test-swr003-${randomUUID()}.db`);
  const url = `file:${file}`;
  const remove = () => {
    for (const suffix of ['', '-journal']) rmSync(`${file}${suffix}`, { force: true });
  };
  for (const migration of [INIT_MIGRATION, SESSIONS_MIGRATION]) {
    prisma(url, [
      'db',
      'execute',
      '--url',
      url,
      '--file',
      join('prisma', 'migrations', migration, 'migration.sql'),
    ]);
  }
  for (const migration of [INIT_MIGRATION, SESSIONS_MIGRATION]) {
    prisma(url, ['migrate', 'resolve', '--applied', migration]);
  }

  const { games: sessions, events } = v1Rows(options.rows);
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    for (const s of [...sessions].reverse()) {
      await client.$executeRaw`INSERT INTO "Session" ("id", "gameId", "setup", "state", "version", "createdAt", "updatedAt")
        VALUES (${s.id}, ${REBELLION_GAME_ID}, ${s.setup}, ${s.state}, ${s.version}, ${BigInt(s.createdAt.getTime())}, ${BigInt(s.updatedAt.getTime())})`;
    }
    for (const e of events) {
      await client.$executeRaw`INSERT INTO "SessionEvent" ("id", "sessionId", "seq", "type", "actor", "payload", "createdAt")
        VALUES (${e.id}, ${e.gameId}, ${e.seq}, ${e.type}, ${e.actor}, ${e.payload}, ${BigInt(e.createdAt.getTime())})`;
    }
  } finally {
    await client.$disconnect();
  }
  return { file, url, sessions, events, remove };
}
