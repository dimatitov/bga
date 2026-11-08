/**
 * TR-6: a SQLite DB in the SWR-002 shape — only migration `20261107235651_init` applied — with `Game` /
 * `GameEvent` rows. Generated per run (no binary .db committed). SWR-004 R0: the rows come from the frozen
 * v1 snapshot `test/fixtures/v1/sessions.v1.json` (built by the SWR-003 rules; the current rules no longer
 * produce v1 data, TR-4). Its `'rebellion'` values are the input of the upgrade and are never renamed.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { API_ROOT, TMP_DIR } from '../global-setup';

export const INIT_MIGRATION = '20261107235651_init';
export const SESSIONS_MIGRATION = '20261108120000_sessions';

/** One stored v1 session of the snapshot (setup/state are the JSON the SWR-003 repository wrote). */
export interface V1SessionFixture {
  id: string;
  setupInput: unknown;
  setup: unknown;
  /** v1 `GameState` (no `schemaVersion`; `setup.humanFaction`, owners and actors may be the legacy faction). */
  state: { id: string; version: number; setup: { humanFaction: string } } & Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  events: { seq: number; type: string; actor: string; payload: unknown; at: string }[];
}

/** Frozen v1 rows: EMP/ai/hard; legacy-rebel/human with a move + 3×ADVANCE_PHASE (v5, round 2); EMP/ai without difficulty. */
export function v1Sessions(): V1SessionFixture[] {
  const file = join(API_ROOT, 'test', 'fixtures', 'v1', 'sessions.v1.json');
  return (JSON.parse(readFileSync(file, 'utf8')) as { sessions: V1SessionFixture[] }).sessions;
}

export interface PreMigrationGame {
  id: string;
  setup: string;
  state: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreMigrationEvent {
  id: number;
  gameId: string;
  seq: number;
  type: string;
  actor: string;
  payload: string;
  createdAt: Date;
}

export interface PreMigrationDb {
  file: string;
  url: string;
  games: PreMigrationGame[];
  events: PreMigrationEvent[];
  remove(): void;
}

/** Runs the Prisma CLI of apps/api against `url`; returns stdout. Throws on a non-zero exit. */
export function prisma(url: string, args: string[]): string {
  return execFileSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

/** Row/event values exactly as the SWR-002/003 repositories wrote them (JSON text, Date). */
export function v1Rows(count: number): { games: PreMigrationGame[]; events: PreMigrationEvent[] } {
  const sessions = v1Sessions().slice(0, count);
  const games: PreMigrationGame[] = sessions.map((s) => ({
    id: s.id,
    setup: JSON.stringify(s.setup),
    state: JSON.stringify(s.state),
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  }));
  // Insert in an order different from `updatedAt` so that ordering is really checked.
  const insertOrder = [...sessions].reverse();
  const events: PreMigrationEvent[] = [];
  let eventId = 0;
  for (const s of insertOrder) {
    for (const e of s.events) {
      events.push({
        id: ++eventId,
        gameId: s.id,
        seq: e.seq,
        type: e.type,
        actor: e.actor,
        payload: JSON.stringify(e.payload),
        createdAt: new Date(e.at),
      });
    }
  }
  return { games, events };
}

/**
 * Empty file → SQL of the init migration (`prisma db execute`) → `migrate resolve --applied init` →
 * raw inserts of `Game` / `GameEvent` rows exactly as the SWR-002 repository wrote them.
 */
export async function createPreMigrationDb(options: { rows: number }): Promise<PreMigrationDb> {
  const file = join(TMP_DIR, `test-premigration-${randomUUID()}.db`);
  const url = `file:${file}`;
  const remove = () => {
    for (const suffix of ['', '-journal']) rmSync(`${file}${suffix}`, { force: true });
  };
  prisma(url, [
    'db',
    'execute',
    '--url',
    url,
    '--file',
    join('prisma', 'migrations', INIT_MIGRATION, 'migration.sql'),
  ]);
  prisma(url, ['migrate', 'resolve', '--applied', INIT_MIGRATION]);

  const { games, events } = v1Rows(options.rows);
  // DateTime columns hold unix milliseconds (INTEGER), as Prisma wrote them in SWR-002 (checked on dev.db).
  const insertOrder = [...games].reverse();

  const client = new PrismaClient({ datasourceUrl: url });
  try {
    for (const g of insertOrder) {
      await client.$executeRaw`INSERT INTO "Game" ("id", "setup", "state", "version", "createdAt", "updatedAt")
        VALUES (${g.id}, ${g.setup}, ${g.state}, ${g.version}, ${BigInt(g.createdAt.getTime())}, ${BigInt(g.updatedAt.getTime())})`;
    }
    for (const e of events) {
      await client.$executeRaw`INSERT INTO "GameEvent" ("id", "gameId", "seq", "type", "actor", "payload", "createdAt")
        VALUES (${e.id}, ${e.gameId}, ${e.seq}, ${e.type}, ${e.actor}, ${e.payload}, ${BigInt(e.createdAt.getTime())})`;
    }
  } finally {
    await client.$disconnect();
  }
  return { file, url, games, events, remove };
}
