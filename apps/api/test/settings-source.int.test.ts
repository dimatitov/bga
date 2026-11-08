/**
 * Review #1 (SWR-004): single source of settings. `Session.setup` is rewritten in the current (v2) form
 * whenever the state is written, and the service checks that `publicSettings(parseStoredSetup(setup))`
 * equals the settings derived from the state — a mismatch is a server fault (500 INTERNAL, logged by
 * sessionId + code only, the row is skipped in the list and never written).
 */
import { Logger, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SessionResponseSchema } from '@bga/platform';
import { StoredRebellionSetupSchema, toStoredSetup } from '@bga/game-rebellion/schema';
import { upcastState } from '@bga/game-rebellion/server';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  EMPIRE_AI,
  R,
  SEEDED,
  advanceEnv,
  createRebellionSession,
  createSeededDb,
  dbSnapshot,
  expectError,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { legacyFactionValues } from './support/legacy-faction';
import { prisma } from './support/pre-migration-db';
import { createSwr003Db, type Swr003Db } from './support/swr003-db';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

describe(
  'review #1: Session.setup rewritten as v2 on a state write (migrated v1 row)',
  { timeout: 60_000 },
  () => {
    let db: Swr003Db | undefined;

    afterEach(() => {
      db?.remove();
      db = undefined;
    });

    it('before: setup column is v1; after a command: v2 equal to the state settings; GET settings unchanged', async () => {
      db = await createSwr003Db({ rows: 3 });
      prisma(db.url, ['migrate', 'deploy']);
      const app = await startApp(db.url);
      const client = new PrismaClient({ datasourceUrl: db.url });
      try {
        for (const row of db.sessions) {
          const before = await client.session.findUniqueOrThrow({ where: { id: row.id } });
          expect(JSON.parse(before.setup)).toHaveProperty('humanFaction');
          expect(JSON.parse(before.setup)).not.toHaveProperty('schemaVersion');

          const got = SessionResponseSchema.parse(
            (await api(app).get(`/api/sessions/${row.id}`)).body,
          );
          const actor = upcastState(JSON.parse(row.state)).settings.playerFaction;
          const res = await postCommand(app, row.id, advanceEnv(actor, row.version));
          expect(res.status, row.id).toBe(200);

          const after = await client.session.findUniqueOrThrow({ where: { id: row.id } });
          const stored = StoredRebellionSetupSchema.parse(JSON.parse(after.setup));
          expect(stored.schemaVersion).toBe(2);
          expect(legacyFactionValues(stored)).toEqual([]);
          const state = upcastState(JSON.parse(after.state));
          expect(stored).toEqual(toStoredSetup(state.settings));

          const reread = SessionResponseSchema.parse(
            (await api(app).get(`/api/sessions/${row.id}`)).body,
          );
          expect(reread.settings).toEqual(got.settings);
          expect(reread.settings).toEqual(state.settings);
        }
      } finally {
        await client.$disconnect();
        await stopApp(app);
      }
    });
  },
);

describe('review #1: Session.setup and state disagree → 500 INTERNAL', () => {
  let db: TestDb;
  let app: INestApplication;
  let errorLog: MockInstance<Logger['error']>;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url);
    // Captured and silenced: the expected 500s would otherwise print to the test output.
    errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    errorLog.mockRestore();
    await stopApp(app, db);
  });

  /** A valid v2 setup that differs from the state (difficulty changed behind the service's back). */
  async function tamper(sessionId: string): Promise<void> {
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
    const stored = StoredRebellionSetupSchema.parse(JSON.parse(row.setup));
    const other = { ...stored, aiDifficulty: stored.aiDifficulty === 'easy' ? 'hard' : 'easy' };
    await prismaOf(app).session.update({
      where: { id: sessionId },
      data: { setup: JSON.stringify(StoredRebellionSetupSchema.parse(other)) },
    });
  }

  it('GET :id and a command → 500 without internals; nothing written; list skips only that row', async () => {
    const bad = await createRebellionSession(app, EMPIRE_AI);
    const good = await createRebellionSession(app, EMPIRE_AI);
    await tamper(bad.sessionId);
    const before = await dbSnapshot(app, bad.sessionId);

    const get = await api(app).get(`/api/sessions/${bad.sessionId}`);
    expectError(get, 500, 'INTERNAL', 'errors.internal');
    expect(get.text).not.toMatch(/aiDifficulty|playerFaction|setup|prisma|stack/i);

    const cmd = await postCommand(app, bad.sessionId, advanceEnv('empire', 1));
    expectError(cmd, 500, 'INTERNAL', 'errors.internal');
    expect(await dbSnapshot(app, bad.sessionId)).toEqual(before);

    const list = await api(app).get(`/api/sessions?gameId=${R}`);
    expect(list.status).toBe(200);
    expect(list.body.map((s: { sessionId: string }) => s.sessionId)).toEqual([good.sessionId]);

    const lines = errorLog.mock.calls.map((c: unknown[]) => String(c[0]));
    const mismatch = lines.filter((l: string) => l.includes('code=SETTINGS_MISMATCH'));
    expect(mismatch.length).toBeGreaterThanOrEqual(2);
    for (const line of mismatch) {
      expect(line).toContain(`sessionId=${bad.sessionId}`);
      expect(line).not.toMatch(/aiDifficulty|easy|hard|playerFaction|empire|rebels/);
    }
  });

  it('a new session: setup column equals toStoredSetup(state.settings)', async () => {
    const s = await createRebellionSession(app, EMPIRE_AI);
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(StoredRebellionSetupSchema.parse(JSON.parse(row.setup))).toEqual(
      toStoredSetup(upcastState(JSON.parse(row.state)).settings),
    );
  });
});

/**
 * SWR-005 W5: the command part runs on a seeded mock-v1 row (`SEEDED.empireAi`, Empire active, v2 snapshot),
 * not on a POST-created session (new sessions are `core-v1`, where ADVANCE_PHASE is 422 commandUnavailable).
 */
describe('review #1: a command keeps Session.setup equal to the state settings (seeded mock-v1 row)', () => {
  let db: TestDb;
  let app: INestApplication;
  const ROW = SEEDED.empireAi;

  beforeEach(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('ADVANCE_PHASE → 200; setup column (v2) equals toStoredSetup(state.settings)', async () => {
    const res = await postCommand(app, ROW.id, advanceEnv('empire', ROW.version));
    expect(res.status).toBe(200);
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: ROW.id } });
    const stored = StoredRebellionSetupSchema.parse(JSON.parse(row.setup));
    expect(stored.schemaVersion).toBe(2);
    expect(stored).toEqual(toStoredSetup(upcastState(JSON.parse(row.state)).settings));
  });
});
