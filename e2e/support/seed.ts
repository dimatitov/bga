// SWR-005 TR-4 / Q-1 / Q-35: seeding of the e2e SQLite DB with stored sessions that cannot be created through the
// public API any more (every new session is `core-v1`):
// - legacy rows: the frozen SWR-004 v2 snapshot `apps/api/test/fixtures/v2/sessions.v2.json` (state `schemaVersion: 2`,
//   mock scenario) and the SWR-003 v1 snapshot `apps/api/test/fixtures/v1/sessions.v1.json` — they keep the mock rules
//   (`rulesEngine: 'mock-v1'`) covered in e2e;
// - `core-v1` rows "one activation before the reveal / the Empire's win": the W5 seeds
//   `packages/games/rebellion/test/fixtures/core/seeds/*.json` (scenarios 4 and 5b).
//
// WHY at test time, not in e2e-serve.mjs before the server starts: `00-empty-db.spec.ts` (TC-GP-13) needs an EMPTY DB
// for the "no sessions" game page; seeding before the server starts would make that check impossible. The rows are
// written into the same SQLite file the e2e API uses (`apps/api/.tmp/e2e.db`, see e2e-serve.mjs) through the API's own
// Prisma client, never through a test-only HTTP route (R-7). Every call clones the fixture under a NEW session id, so
// specs never share (and never mutate) the same seeded row and the order of specs does not matter. The fixture files
// themselves are read-only here.
//
// The oracle `readStoredState` reads `Session.state` straight from the DB: e2e learns the hidden rebel-base system of a
// fresh AI game without any Empire-facing API (test-cases.md TR-3, Q-35).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REBELLION } from './api';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_ROOT = path.join(REPO_ROOT, 'apps', 'api');
/** Same file as `apps/api/scripts/e2e-serve.mjs` (`.tmp/e2e.db`). */
export const E2E_DB_FILE = path.join(API_ROOT, '.tmp', 'e2e.db');

const V2_FILE = path.join(API_ROOT, 'test', 'fixtures', 'v2', 'sessions.v2.json');
const V1_FILE = path.join(API_ROOT, 'test', 'fixtures', 'v1', 'sessions.v1.json');
const CORE_SEEDS_DIR = path.join(
  REPO_ROOT,
  'packages',
  'games',
  'rebellion',
  'test',
  'fixtures',
  'core',
  'seeds',
);

interface StoredEvent {
  seq: number;
  type: string;
  actor: string;
  payload: unknown;
  at: string;
}

/** Minimal surface of the API's generated Prisma client used here (the root workspace does not depend on it). */
interface PrismaLike {
  session: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findUnique(args: {
      where: { id: string };
      select: Record<string, boolean>;
    }): Promise<{ state: string; status: string; version: number } | null>;
  };
  sessionEvent: { createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> };
  $disconnect(): Promise<void>;
}

function prismaClient(): PrismaLike {
  const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));
  const { PrismaClient } = requireFromApi('@prisma/client') as {
    PrismaClient: new (options: { datasourceUrl: string }) => PrismaLike;
  };
  return new PrismaClient({ datasourceUrl: `file:${E2E_DB_FILE}` });
}

async function withDb<T>(fn: (db: PrismaLike) => Promise<T>): Promise<T> {
  const db = prismaClient();
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

/** Replaces every JSON string equal to `from` by `to` (the session id lives in `state.id` and nowhere else). */
function renameId<T>(value: T, from: string, to: string): T {
  return JSON.parse(JSON.stringify(value), (_k, v: unknown) => (v === from ? to : v)) as T;
}

interface Row {
  id: string;
  setup: unknown;
  state: unknown;
  version: number;
  status: string;
  events: StoredEvent[];
}

/**
 * Inserts one session row (+ its `SessionEvent` mirror) with `updatedAt = now` (+ `ageMs` older), so a seeded row is
 * the newest session of the game unless asked otherwise.
 */
async function insert(row: Row, ageMs = 0): Promise<void> {
  const at = new Date(Date.now() - ageMs);
  await withDb(async (db) => {
    await db.session.create({
      data: {
        id: row.id,
        gameId: REBELLION,
        setup: JSON.stringify(row.setup),
        state: JSON.stringify(row.state),
        version: row.version,
        status: row.status,
        createdAt: at,
        updatedAt: at,
      },
    });
    if (row.events.length > 0) {
      await db.sessionEvent.createMany({
        data: row.events.map((e) => ({
          sessionId: row.id,
          seq: e.seq,
          type: e.type,
          actor: e.actor,
          payload: JSON.stringify(e.payload),
          createdAt: new Date(e.at),
        })),
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Legacy (mock-v1) rows
// ---------------------------------------------------------------------------------------------------------------

interface V2Fixture {
  id: string;
  setup: unknown;
  state: Record<string, unknown>;
  version: number;
  status: string;
  events: StoredEvent[];
}

/**
 * The frozen v2 rows (SWR-004 code, mock scenario):
 * - `rebelsAi` — Rebels vs AI (normal), round 1, phase `command`, one move made, version 3;
 * - `empireAi` — Empire vs AI (hard), round 1, phase `assignment`, version 2 (closest to an SWR-004 "new" game);
 * - `rebelsHumanHandoff` — Rebels vs second player, END_TURN done, handoff to the Empire pending, version 3.
 */
export const LEGACY_V2 = { rebelsAi: 0, empireAi: 1, rebelsHumanHandoff: 2 } as const;
export type LegacyV2Row = keyof typeof LEGACY_V2;

export interface SeededSession {
  sessionId: string;
  /** Version stored in the row (the view's `version` before any command). */
  version: number;
}

/** Clones a frozen v2 row under a new id into the e2e DB. */
export async function seedLegacyV2(
  which: LegacyV2Row,
  options: { ageMs?: number } = {},
): Promise<SeededSession> {
  const all = (JSON.parse(readFileSync(V2_FILE, 'utf8')) as { sessions: V2Fixture[] }).sessions;
  const src = all[LEGACY_V2[which]];
  if (!src) throw new Error(`v2 fixture row ${which} is missing in ${V2_FILE}`);
  const id = randomUUID();
  await insert(
    {
      id,
      setup: src.setup,
      state: renameId(src.state, src.id, id),
      version: src.version,
      status: src.status,
      events: src.events,
    },
    options.ageMs,
  );
  return { sessionId: id, version: src.version };
}

interface V1Fixture {
  id: string;
  setup: unknown;
  state: Record<string, unknown>;
  version: number;
  events: StoredEvent[];
}

/** Clones the first frozen v1 row (SWR-003 shape: Empire vs AI hard, no `schemaVersion`) under a new id. */
export async function seedLegacyV1(options: { ageMs?: number } = {}): Promise<SeededSession> {
  const all = (JSON.parse(readFileSync(V1_FILE, 'utf8')) as { sessions: V1Fixture[] }).sessions;
  const src = all[0];
  if (!src) throw new Error(`v1 fixture row is missing in ${V1_FILE}`);
  const id = randomUUID();
  await insert(
    {
      id,
      setup: src.setup,
      state: renameId(src.state, src.id, id),
      version: src.version,
      // SWR-003 rows had no status column; the SWR-004 migration backfilled 'prototype'.
      status: 'prototype',
      events: src.events,
    },
    options.ageMs,
  );
  return { sessionId: id, version: src.version };
}

// ---------------------------------------------------------------------------------------------------------------
// core-v1 seeds (W5)
// ---------------------------------------------------------------------------------------------------------------

export type CoreSeedName = 'ai-empire-before-reveal' | 'hotseat-empire-before-win';

export interface CoreSeedCommand {
  actor: 'rebels' | 'empire';
  command: Record<string, unknown> & { type: string };
}

interface CoreSeedFile {
  description: string;
  sessionId: string;
  rebelBaseSystemId: string;
  row: { id: string; status: string; version: number; setup: unknown };
  nextCommands: CoreSeedCommand[];
  expectAfter: { revealed: boolean; outcome: { winner: string; reason: string } | null };
  state: Record<string, unknown> & { log: StoredEvent[] };
}

export interface SeededCoreSession extends SeededSession {
  /** Secret of the seed (the test knows it from the fixture, Q-35) — never read from an Empire-facing response. */
  rebelBaseSystemId: string;
  nextCommands: CoreSeedCommand[];
  expectAfter: CoreSeedFile['expectAfter'];
  description: string;
}

/** Reads a W5 seed (read-only). */
export function readCoreSeed(name: CoreSeedName): CoreSeedFile {
  return JSON.parse(
    readFileSync(path.join(CORE_SEEDS_DIR, `${name}.json`), 'utf8'),
  ) as CoreSeedFile;
}

/**
 * Clones a W5 `core-v1` seed under a new id. The row is always written with {@link REBELLION} (the seed's
 * `row.gameId` is the same catalogue id `star-wars-rebellion`).
 */
export async function seedCore(name: CoreSeedName): Promise<SeededCoreSession> {
  const seed = readCoreSeed(name);
  const id = randomUUID();
  await insert({
    id,
    setup: seed.row.setup,
    state: renameId(seed.state, seed.sessionId, id),
    version: seed.row.version,
    status: seed.row.status,
    events: seed.state.log,
  });
  return {
    sessionId: id,
    version: seed.row.version,
    rebelBaseSystemId: seed.rebelBaseSystemId,
    nextCommands: renameId(seed.nextCommands, seed.sessionId, id),
    expectAfter: seed.expectAfter,
    description: seed.description,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------------------------------------------

export interface StoredRow {
  status: string;
  version: number;
  state: {
    schemaVersion?: number;
    rulesEngine?: string;
    rebelBase?: { systemId: string; revealed: boolean };
    [key: string]: unknown;
  };
}

/** `Session` row as stored (full state, incl. secrets) — test oracle only, never shown to the page. */
export async function readStoredRow(sessionId: string): Promise<StoredRow> {
  return withDb(async (db) => {
    const row = await db.session.findUnique({
      where: { id: sessionId },
      select: { state: true, status: true, version: true },
    });
    if (!row) throw new Error(`session ${sessionId} is not in the e2e DB`);
    return {
      status: row.status,
      version: row.version,
      state: JSON.parse(row.state) as StoredRow['state'],
    };
  });
}

/** Hidden rebel-base system of a stored `core-v1` session (TR-3 oracle). */
export async function storedRebelBase(sessionId: string): Promise<string> {
  const { state } = await readStoredRow(sessionId);
  const base = state.rebelBase?.systemId;
  if (!base) throw new Error(`session ${sessionId} has no rebelBase.systemId in its stored state`);
  return base;
}
