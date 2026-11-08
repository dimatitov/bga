/**
 * TC-I-34 (TR-3): database failures → 500 with the unified body and no internals; a failed creation stores
 * nothing (not even the idempotency key). Failure injection without production hooks:
 * (a) `vi.spyOn` on the repository resolved from the Nest container;
 * (b) a real constraint failure inside the creation transaction (a module emitting duplicate event seqs);
 * (c) an app started on an unmigrated (empty) SQLite file.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IDEMPOTENCY_KEY_HEADER,
  defineServerGameModule,
  type ServerGameModule,
} from '@bga/platform';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionsRepository } from '../src/sessions/sessions.repository';
import { TMP_DIR } from './global-setup';
import { prismaOf } from './support/fixtures';
import { FAKE_GAME_ID, fakeGameDefinition, fakeGameModule } from './support/fake-game';
import { prisma } from './support/pre-migration-db';
import {
  api,
  createTestDb,
  removeTestDb,
  startApp,
  stopApp,
  type TestDb,
} from './support/test-app';

const BODY = { gameId: FAKE_GAME_ID, setup: { start: 0 } };
const FAKE_OPTIONS = { gameModules: [fakeGameModule], gameDefinitions: [fakeGameDefinition] };
/** Anything that would reveal the storage layer or a stack trace. */
const INTERNALS = /prisma|sqlite|no such table|P20\d\d|SQLITE|stack|at \w+ \(|\.ts:\d+/i;

function expectInternal(res: { status: number; body: unknown; text: string }) {
  expect(res.body).toEqual({
    ok: false,
    error: { code: 'INTERNAL', messageKey: 'errors.internal' },
  });
  expect(res.status).toBe(500);
  expect(res.text).not.toMatch(INTERNALS);
}

function prismaError(message: string, code: string) {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: '6.19.3' });
}

describe('TC-I-34: repository failures (spy on the container repository)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, FAKE_OPTIONS);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await stopApp(app, db);
  });

  it('insert / findByIdempotencyKey / listRecent / findById throwing → 500 INTERNAL without internals', async () => {
    const repo = app.get(SessionsRepository);
    const created = await api(app).post('/api/sessions').send(BODY);
    expect(created.status).toBe(201);

    vi.spyOn(repo, 'insert').mockRejectedValueOnce(
      prismaError('SQLITE_BUSY: database is locked (prisma)', 'P1008'),
    );
    expectInternal(await api(app).post('/api/sessions').send(BODY));

    vi.spyOn(repo, 'findByIdempotencyKey').mockRejectedValueOnce(
      prismaError('no such table: main.Session', 'P2021'),
    );
    expectInternal(
      await api(app).post('/api/sessions').set(IDEMPOTENCY_KEY_HEADER, randomUUID()).send(BODY),
    );

    vi.spyOn(repo, 'listRecent').mockRejectedValueOnce(new Error('SQLITE_IOERR at prisma.ts:1'));
    expectInternal(await api(app).get('/api/sessions'));

    vi.spyOn(repo, 'findById').mockRejectedValueOnce(new Error('disk I/O error'));
    expectInternal(await api(app).get(`/api/sessions/${created.body.sessionId}`));

    // only the first session exists; the failed POST stored nothing
    expect(await prismaOf(app).session.count()).toBe(1);
  });

  it('after a failed insert the same Idempotency-Key still creates the session (201, key not stored)', async () => {
    const repo = app.get(SessionsRepository);
    const key = randomUUID();
    vi.spyOn(repo, 'insert').mockRejectedValueOnce(prismaError('database is locked', 'P1008'));
    expectInternal(
      await api(app).post('/api/sessions').set(IDEMPOTENCY_KEY_HEADER, key).send(BODY),
    );
    expect(await prismaOf(app).session.count()).toBe(0);

    const retry = await api(app).post('/api/sessions').set(IDEMPOTENCY_KEY_HEADER, key).send(BODY);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replay']).toBeUndefined();
  });
});

/** The fake game whose initial events collide on (sessionId, seq): `SessionEvent.createMany` fails in the transaction. */
const brokenEventsModule: ServerGameModule = defineServerGameModule({
  ...(fakeGameModule as ServerGameModule<unknown, unknown, never>),
  createInitialState(setup, ctx) {
    const { state, events } = fakeGameModule.createInitialState(setup, ctx);
    return { state, events: [...events, ...events] as never[] };
  },
});

describe('TC-I-34: a failure inside the creation transaction rolls everything back', () => {
  it('SessionEvent insert fails → 500, 0 Session rows, key not stored; a healthy app then creates with the same key', async () => {
    const db = createTestDb();
    try {
      const key = randomUUID();
      const broken = await startApp(db.url, {
        gameModules: [brokenEventsModule],
        gameDefinitions: [fakeGameDefinition],
      });
      try {
        // P2002 on SessionEvent is NOT an idempotency conflict (no row holds the key) → rethrown → 500.
        expectInternal(
          await api(broken).post('/api/sessions').set(IDEMPOTENCY_KEY_HEADER, key).send(BODY),
        );
        expect(await prismaOf(broken).session.count()).toBe(0);
        expect(await prismaOf(broken).sessionEvent.count()).toBe(0);
      } finally {
        await stopApp(broken);
      }

      const healthy = await startApp(db.url, FAKE_OPTIONS);
      try {
        const res = await api(healthy)
          .post('/api/sessions')
          .set(IDEMPOTENCY_KEY_HEADER, key)
          .send(BODY);
        expect(res.status).toBe(201);
        expect(await prismaOf(healthy).session.count()).toBe(1);
      } finally {
        await stopApp(healthy);
      }
    } finally {
      removeTestDb(db);
    }
  });
});

describe('TC-I-34: unmigrated (empty) database file', () => {
  it('POST / GET list / GET by id → 500 without internals; after migrate deploy the same key → 201', async () => {
    const file = join(TMP_DIR, `test-empty-${randomUUID()}.db`);
    const db: TestDb = { file, url: `file:${file}` };
    const key = randomUUID();
    try {
      const app = await startApp(db.url, FAKE_OPTIONS);
      try {
        expectInternal(
          await api(app).post('/api/sessions').set(IDEMPOTENCY_KEY_HEADER, key).send(BODY),
        );
        expectInternal(await api(app).post('/api/sessions').send(BODY));
        expectInternal(await api(app).get('/api/sessions'));
        expectInternal(await api(app).get(`/api/sessions/${randomUUID()}`));
      } finally {
        await stopApp(app);
      }

      prisma(db.url, ['migrate', 'deploy']);
      const recovered = await startApp(db.url, FAKE_OPTIONS);
      try {
        const res = await api(recovered)
          .post('/api/sessions')
          .set(IDEMPOTENCY_KEY_HEADER, key)
          .send(BODY);
        expect(res.status).toBe(201);
      } finally {
        await stopApp(recovered);
      }
    } finally {
      removeTestDb(db);
    }
  });
});
