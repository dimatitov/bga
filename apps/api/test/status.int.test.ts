/**
 * SWR-005 W4 (AM-BE-1, AC-07, AC-13): `Session.status` after a command comes from `module.statusOf(newState)`,
 * is written in the same commit as the state, and is what the response view, GET and the list show.
 * Game-independent: driven by the fake game (`FINISH` → 'completed'); Rebellion is only checked for
 * conformance (mock-v1 → 'prototype').
 */
import { Logger, type INestApplication } from '@nestjs/common';
import {
  ListSessionsResponseSchema,
  SessionResponseSchema,
  defineServerGameModule,
  type ServerGameModule,
} from '@bga/platform';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionsRepository } from '../src/sessions/sessions.repository';
import {
  EMPIRE_AI,
  createSession,
  dbSnapshot,
  expectError,
  postCommand,
  sequentialIds,
  tickingClock,
} from './support/fixtures';
import {
  FAKE_FINISHED_STATUS,
  FAKE_GAME_ID,
  FAKE_SECRET,
  FAKE_STATUS,
  fakeGameDefinition,
  fakeGameModule,
} from './support/fake-game';
import { v2Sessions } from './support/swr004-db';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

function cmd(type: 'INC' | 'FINISH', expectedVersion: number) {
  return { actor: 'player', expectedVersion, command: { type } };
}

async function startFakeApp(db: TestDb, module: ServerGameModule = fakeGameModule) {
  return startApp(db.url, {
    clock: tickingClock(),
    idGenerator: sequentialIds(),
    gameModules: [module],
    gameDefinitions: [fakeGameDefinition],
  });
}

describe('session status after a command (fake game)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startFakeApp(db);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await stopApp(app, db);
  });

  it('a finishing command → response view, row, GET and list show status completed; log has only the transition', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const { sessionId, status } = await createSession(app, FAKE_GAME_ID, { start: 0 });
    expect(status).toBe(FAKE_STATUS);

    // A command that does not change the status: no STATUS_CHANGED line, status stays.
    const inc = await postCommand(app, sessionId, cmd('INC', 1));
    expect(inc.status).toBe(200);
    expect(inc.body.view).toEqual({ count: 1, version: 2, status: FAKE_STATUS });
    expect((await dbSnapshot(app, sessionId)).session?.status).toBe(FAKE_STATUS);

    const fin = await postCommand(app, sessionId, cmd('FINISH', 2));
    expect(fin.status).toBe(200);
    expect(fin.body).toEqual({
      ok: true,
      view: { count: 1, version: 3, status: FAKE_FINISHED_STATUS },
      events: [{ seq: 3, type: 'FINISHED', count: 1 }],
    });

    const snap = await dbSnapshot(app, sessionId);
    expect(snap.session).toMatchObject({ version: 3, status: FAKE_FINISHED_STATUS });
    expect(snap.events.map((e) => e.seq)).toEqual([1, 2, 3]);

    const got = SessionResponseSchema.parse(
      (await api(app).get(`/api/sessions/${sessionId}`)).body,
    );
    expect(got.status).toBe(FAKE_FINISHED_STATUS);
    expect(got.view).toEqual({ count: 1, version: 3, status: FAKE_FINISHED_STATUS });

    const list = ListSessionsResponseSchema.parse(
      (await api(app).get(`/api/sessions?gameId=${FAKE_GAME_ID}`)).body,
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sessionId, status: FAKE_FINISHED_STATUS, version: 3 });

    const statusLines = logSpy.mock.calls
      .map(([message]) => String(message))
      .filter((m) => m.includes('STATUS_CHANGED'));
    expect(statusLines).toEqual([
      `sessionId=${sessionId} gameId=${FAKE_GAME_ID} code=STATUS_CHANGED ${FAKE_STATUS}→${FAKE_FINISHED_STATUS}`,
    ]);
    for (const [message] of logSpy.mock.calls) expect(String(message)).not.toContain(FAKE_SECRET);
  });

  it('a lost version race (commit conflict) → 409 and the status of the winning write stays', async () => {
    const { sessionId } = await createSession(app, FAKE_GAME_ID, { start: 0 });
    const repo = app.get(SessionsRepository);
    const original = repo.commit.bind(repo);
    // The competitor commits INC (status stays 'active') between our read and our commit of FINISH.
    vi.spyOn(repo, 'commit').mockImplementationOnce(async (update) => {
      const competitor = await original({
        id: sessionId,
        expectedVersion: 1,
        setup: update.setup,
        state: JSON.stringify({
          id: sessionId,
          count: 1,
          version: 2,
          secret: FAKE_SECRET,
          setup: JSON.parse(update.setup) as unknown,
        }),
        version: 2,
        status: FAKE_STATUS,
        events: [{ seq: 2, type: 'INCREMENTED', actor: 'player', at: update.now, payload: {} }],
        now: update.now,
      });
      expect(competitor).toEqual({ ok: true });
      expect(update.status).toBe(FAKE_FINISHED_STATUS);
      return original(update);
    });

    const lost = await postCommand(app, sessionId, cmd('FINISH', 1));
    expect(expectError(lost, 409, 'VERSION_CONFLICT').error.details).toEqual({
      currentVersion: 2,
    });
    const snap = await dbSnapshot(app, sessionId);
    expect(snap.session).toMatchObject({ version: 2, status: FAKE_STATUS });
    expect(JSON.parse(snap.session!.state)).not.toHaveProperty('finished');
    expect(snap.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(
      SessionResponseSchema.parse((await api(app).get(`/api/sessions/${sessionId}`)).body).status,
    ).toBe(FAKE_STATUS);
  });

  it('a rejected command (422) does not touch the status', async () => {
    const { sessionId } = await createSession(app, FAKE_GAME_ID, { start: 3 });
    const before = await dbSnapshot(app, sessionId);
    expectError(await postCommand(app, sessionId, cmd('INC', 1)), 422, 'ILLEGAL_COMMAND');
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  });
});

describe('a module returning an invalid status', () => {
  it('→ 500 INTERNAL, nothing is written', async () => {
    const bogus = defineServerGameModule({
      ...(fakeGameModule as ServerGameModule<unknown, unknown, never>),
      statusOf: () => 'bogus' as never,
    });
    const db = createTestDb();
    const app = await startFakeApp(db, bogus);
    try {
      const { sessionId } = await createSession(app, FAKE_GAME_ID, { start: 0 });
      const before = await dbSnapshot(app, sessionId);
      expectError(await postCommand(app, sessionId, cmd('FINISH', 1)), 500, 'INTERNAL');
      expect(await dbSnapshot(app, sessionId)).toEqual(before);
    } finally {
      await stopApp(app, db);
    }
  });
});

describe('Rebellion statusOf (conformance)', () => {
  it('mock-v1 states (upcast frozen v2 rows) → prototype', () => {
    const rows = v2Sessions();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const state = rebellionServerModule.parseState(row.state, {
        sessionId: row.id,
        version: row.version,
      });
      expect(rebellionServerModule.statusOf(state)).toBe('prototype');
    }
  });

  it('a new session (any engine, no result yet) → prototype, same as initialStatus', () => {
    const setup = rebellionServerModule.parseSetup(EMPIRE_AI);
    expect(setup.ok).toBe(true);
    if (!setup.ok) return;
    const { state } = rebellionServerModule.createInitialState(setup.value, {
      sessionId: 'status-1',
      now: '2026-01-01T00:00:00.000Z',
    });
    expect(rebellionServerModule.statusOf(state)).toBe('prototype');
    expect(rebellionServerModule.initialStatus(setup.value)).toBe('prototype');
  });

  it('core-v1: a recorded result → completed, none → prototype (field-level check of the ≤ 5-line method)', () => {
    const base = { rulesEngine: 'core-v1' };
    const result = { winner: 'rebels', reason: 'timeReachedReputation' };
    expect(rebellionServerModule.statusOf({ ...base, outcome: null })).toBe('prototype');
    expect(rebellionServerModule.statusOf({ ...base, outcome: result })).toBe('completed');
  });
});
