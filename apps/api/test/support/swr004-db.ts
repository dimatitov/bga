/**
 * SWR-005 (plan-backend §1.4): a SQLite DB in the SWR-004 shape — all three migrations applied with
 * `migrate deploy` — with `Session` / `SessionEvent` rows from the frozen v2 snapshot
 * `test/fixtures/v2/sessions.v2.json` (state `schemaVersion: 2`, mock scenario, written by the SWR-004 code).
 * Used to keep the mock-v1 rules covered once new sessions run on `core-v1`. Generated per run (no binary .db).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { API_ROOT, TMP_DIR } from '../global-setup';
import { prisma } from './pre-migration-db';

/** One stored v2 session of the snapshot (setup/state exactly as the SWR-004 repository wrote them). */
export interface V2SessionFixture {
  id: string;
  gameId: string;
  setup: unknown;
  /** v2 `GameState` (`schemaVersion: 2`, no `rulesEngine`). */
  state: { id: string; version: number; schemaVersion: 2 } & Record<string, unknown>;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  events: { seq: number; type: string; actor: string; payload: unknown; at: string }[];
}

/** Frozen v2 rows: rebels/ai (move + ADVANCE_PHASE, v3); empire/ai/hard (move, v2); rebels/human in handoff (move + END_TURN, v3). */
export function v2Sessions(): V2SessionFixture[] {
  const file = join(API_ROOT, 'test', 'fixtures', 'v2', 'sessions.v2.json');
  return (JSON.parse(readFileSync(file, 'utf8')) as { sessions: V2SessionFixture[] }).sessions;
}

export interface Swr004Db {
  file: string;
  url: string;
  sessions: V2SessionFixture[];
  remove(): void;
}

/** Empty file → `prisma migrate deploy` → raw inserts of `Session` / `SessionEvent` rows (first `rows` of the snapshot). */
export async function createSwr004Db(options: { rows?: number } = {}): Promise<Swr004Db> {
  const file = join(TMP_DIR, `test-swr004-${randomUUID()}.db`);
  const url = `file:${file}`;
  const remove = () => {
    for (const suffix of ['', '-journal']) rmSync(`${file}${suffix}`, { force: true });
  };
  prisma(url, ['migrate', 'deploy']);

  const all = v2Sessions();
  const sessions = all.slice(0, options.rows ?? all.length);
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    // Insert in an order different from `updatedAt` so that ordering is really checked.
    for (const s of [...sessions].reverse()) {
      await client.$executeRaw`INSERT INTO "Session" ("id", "gameId", "setup", "state", "version", "status", "createdAt", "updatedAt")
        VALUES (${s.id}, ${s.gameId}, ${JSON.stringify(s.setup)}, ${JSON.stringify(s.state)}, ${s.version}, ${s.status}, ${BigInt(new Date(s.createdAt).getTime())}, ${BigInt(new Date(s.updatedAt).getTime())})`;
      for (const e of s.events) {
        await client.$executeRaw`INSERT INTO "SessionEvent" ("sessionId", "seq", "type", "actor", "payload", "createdAt")
          VALUES (${s.id}, ${e.seq}, ${e.type}, ${e.actor}, ${JSON.stringify(e.payload)}, ${BigInt(new Date(e.at).getTime())})`;
      }
    }
  } finally {
    await client.$disconnect();
  }
  return { file, url, sessions, remove };
}
