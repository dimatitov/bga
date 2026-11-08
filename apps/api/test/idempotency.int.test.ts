/**
 * SWR-004 idempotent session creation (Q-1..Q-5, Q-25, TR-8) — game-independent, through the fake game
 * (TC-I-36). Rebellion-shaped cases live in `rebellion-contract.int.test.ts`.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAY_HEADER,
  SessionResponseSchema,
} from '@bga/platform';
import { forbiddenStarsDefinition } from '@bga/game-forbidden-stars/definition';
import { rebellionDefinition } from '@bga/game-rebellion/definition';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idempotencyHash } from '../src/sessions/idempotency';
import { SessionsRepository } from '../src/sessions/sessions.repository';
import {
  FS,
  dbSnapshot,
  expectError,
  postCommand,
  prismaOf,
  tickingClock,
} from './support/fixtures';
import {
  FAKE_GAME_ID,
  FAKE_SOON_ID,
  FAKE_STATUS,
  FAKE_UNSUPPORTED_KEY,
  fakeGameDefinition,
  fakeGameModule,
  fakeSoonDefinition,
} from './support/fake-game';
import {
  api,
  createTestDb,
  removeTestDb,
  startApp,
  stopApp,
  type TestDb,
} from './support/test-app';

const OPTIONS = {
  gameModules: [rebellionServerModule, fakeGameModule],
  gameDefinitions: [
    rebellionDefinition,
    forbiddenStarsDefinition,
    fakeGameDefinition,
    fakeSoonDefinition,
  ],
} as const;

const A = { gameId: FAKE_GAME_ID, setup: { start: 0 } };
const B = { gameId: FAKE_GAME_ID, setup: { start: 2 } };

function post(app: INestApplication, body: unknown, key?: string | string[]) {
  const req = api(app).post('/api/sessions');
  if (key !== undefined) req.set(IDEMPOTENCY_KEY_HEADER, key as string);
  return req.send(body as object);
}

async function sessionCount(app: INestApplication): Promise<number> {
  return prismaOf(app).session.count();
}

describe('POST /api/sessions — Idempotency-Key (fake game)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, { clock: tickingClock(), ...OPTIONS });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await stopApp(app, db);
  });

  it('TC-I-15 (Q-1): same key + same body → 201, then 200 + Idempotent-Replay with the same envelope; one row', async () => {
    const key = randomUUID();
    const first = await post(app, A, key);
    expect(first.status).toBe(201);
    expect(first.headers['idempotent-replay']).toBeUndefined();
    const created = SessionResponseSchema.parse(first.body);
    expect(created.status).toBe(FAKE_STATUS);

    const again = await post(app, A, key);
    expect(again.status).toBe(200);
    expect(again.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(Object.keys(again.body).sort()).toEqual(
      ['gameId', 'sessionId', 'settings', 'status', 'view'].sort(),
    );

    expect(await sessionCount(app)).toBe(1);
    const row = await prismaOf(app).session.findUniqueOrThrow({
      where: { id: created.sessionId },
    });
    expect(row.idempotencyKey).toBe(key);
    expect(row.idempotencyHash).toBe(idempotencyHash(A));
    expect(row.status).toBe(FAKE_STATUS);
    expect(await prismaOf(app).sessionEvent.count()).toBe(1);
  });

  it('Q-1: a replay returns the CURRENT state of the session (same as GET), not a creation snapshot', async () => {
    const key = randomUUID();
    const { sessionId } = SessionResponseSchema.parse((await post(app, A, key)).body);
    const cmd = await postCommand(app, sessionId, {
      actor: 'player',
      expectedVersion: 1,
      command: { type: 'INC' },
    });
    expect(cmd.status).toBe(200);

    const replay = await post(app, A, key);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual((await api(app).get(`/api/sessions/${sessionId}`)).body);
    expect(replay.body.view).toEqual({ count: 1, version: 2, status: FAKE_STATUS });
  });

  it('TC-I-16: same key + other body / other game → 409 IDEMPOTENCY_KEY_REUSED (no details); original unchanged', async () => {
    const key = randomUUID();
    const { sessionId } = SessionResponseSchema.parse((await post(app, A, key)).body);
    const before = await dbSnapshot(app, sessionId);

    for (const body of [B, { gameId: rebellionDefinition.id, setup: { start: 0 } }]) {
      const res = await post(app, body, key);
      const err = expectError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'errors.idempotencyKeyReused');
      expect(err.error.details).toBeUndefined();
      expect(res.text).not.toContain(sessionId);
      expect(res.headers['idempotent-replay']).toBeUndefined();
    }
    expect(await sessionCount(app)).toBe(1);
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  });

  it('TC-I-17 (AM-BE-7): only key order is normalised — permuted keys replay; omitted vs default → 409', async () => {
    const key = randomUUID();
    const explicit = { gameId: FAKE_GAME_ID, setup: { start: 1, mode: 'normal' } };
    const first = await post(app, explicit, key);
    expect(first.status).toBe(201);

    const permuted = await post(
      app,
      { setup: { mode: 'normal', start: 1 }, gameId: FAKE_GAME_ID },
      key,
    );
    expect(permuted.status).toBe(200);
    expect(permuted.body.sessionId).toBe(first.body.sessionId);

    // `mode` omitted is the same game setup after defaults, but a different request body.
    const omitted = await post(app, { gameId: FAKE_GAME_ID, setup: { start: 1 } }, key);
    expectError(omitted, 409, 'IDEMPOTENCY_KEY_REUSED');
    expect(await sessionCount(app)).toBe(1);
  });

  describe('TC-I-18 (Q-2): malformed Idempotency-Key → 400 VALIDATION at headers.idempotency-key, nothing stored', () => {
    const cases: [string, string | string[]][] = [
      ['not a uuid', 'not-a-uuid'],
      ['empty', ''],
      ['two headers', [randomUUID(), randomUUID()]],
      ['two values in one header', `${randomUUID()}, ${randomUUID()}`],
      ['over-long', `${randomUUID()}${'a'.repeat(170)}`],
      ['uuid with braces', `{${randomUUID()}}`],
    ];
    it.each(cases)('%s', async (_name, key) => {
      const res = await post(app, A, key);
      const err = expectError(res, 400, 'VALIDATION', 'errors.validation');
      const issues = (err.error.details as { issues: { path: unknown[] }[] }).issues;
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) expect(issue.path).toEqual(['headers', 'idempotency-key']);
      expect(await sessionCount(app)).toBe(0);
    });

    it('a malformed key is a request-form error: 400 even for an unknown / unavailable game', async () => {
      for (const gameId of ['unknown-game', FAKE_SOON_ID, FS]) {
        expectError(await post(app, { gameId, setup: {} }, 'nope'), 400, 'VALIDATION');
      }
    });
  });

  it('TC-I-19 (Q-2): no key → plain creation every time; idempotencyKey/Hash stay null', async () => {
    expect((await post(app, A)).status).toBe(201);
    expect((await post(app, A)).status).toBe(201);
    const rows = await prismaOf(app).session.findMany();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.idempotencyKey).toBeNull();
      expect(row.idempotencyHash).toBeNull();
    }
  });

  it('TC-I-04: different keys → different sessions', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) ids.add((await post(app, A, randomUUID())).body.sessionId);
    expect(ids.size).toBe(3);
    expect(await sessionCount(app)).toBe(3);
  });

  it('TC-I-20 (TR-8): 10 parallel identical requests ×5 → one row per key, one sessionId, never 500', async () => {
    for (let round = 0; round < 5; round++) {
      const key = randomUUID();
      const responses = await Promise.all(Array.from({ length: 10 }, () => post(app, A, key)));
      const statuses = responses.map((r) => r.status);
      expect(
        statuses.filter((s) => s === 201),
        `round ${round}: ${statuses}`,
      ).toHaveLength(1);
      expect(
        statuses.every((s) => s === 201 || s === 200),
        `round ${round}: ${statuses}`,
      ).toBe(true);
      for (const r of responses.filter((x) => x.status === 200)) {
        expect(r.headers['idempotent-replay']).toBe('true');
      }
      expect(new Set(responses.map((r) => r.body.sessionId)).size).toBe(1);
      expect(await prismaOf(app).session.count({ where: { idempotencyKey: key } })).toBe(1);
    }
    expect(await sessionCount(app)).toBe(5);
    expect(await prismaOf(app).sessionEvent.count()).toBe(5);
  });

  it('TC-I-21: parallel different bodies with one key → one row; 201 for the winner, 409 for the other; never 500', async () => {
    for (let round = 0; round < 5; round++) {
      const key = randomUUID();
      const responses = await Promise.all([post(app, A, key), post(app, B, key)]);
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses, `round ${round}`).toEqual([201, 409]);
      const winner = responses.find((r) => r.status === 201)!;
      const row = await prismaOf(app).session.findUniqueOrThrow({ where: { idempotencyKey: key } });
      expect(row.id).toBe(winner.body.sessionId);
    }
    expect(await sessionCount(app)).toBe(5);
  });

  it('TC-I-22 (Q-3): a key used by a request rejected with 400 (setup) is not burnt', async () => {
    const key = randomUUID();
    const bad = await post(app, { gameId: FAKE_GAME_ID, setup: { start: 'x' } }, key);
    expect(expectError(bad, 400, 'VALIDATION').error.details).toMatchObject({
      issues: [{ path: ['setup', 'start'] }],
    });
    expect(await sessionCount(app)).toBe(0);
    expect((await post(app, A, key)).status).toBe(201);
  });

  it('TC-I-23 (Q-3) + generic 422 SETUP_UNSUPPORTED: the game key and details pass through; the key is not burnt', async () => {
    const key = randomUUID();
    const res = await post(
      app,
      { gameId: FAKE_GAME_ID, setup: { start: 0, mode: 'unsupported' } },
      key,
    );
    const err = expectError(res, 422, 'SETUP_UNSUPPORTED', FAKE_UNSUPPORTED_KEY);
    expect(err.error.details).toEqual({ unsupported: ['mode'] });
    expect(await sessionCount(app)).toBe(0);
    expect((await post(app, A, key)).status).toBe(201);
  });

  it('TC-I-14 (generic): order 400 body → 404 → 422 GAME_UNAVAILABLE → idempotency → 400 setup → 422 SETUP_UNSUPPORTED', async () => {
    const key = randomUUID();
    expect((await post(app, A, key)).status).toBe(201);

    // body form beats everything, even with a used key
    expectError(await post(app, { gameId: FAKE_GAME_ID }, key), 400, 'VALIDATION');
    // 404 / 422 GAME_UNAVAILABLE beat the idempotency check (key of another game's session)
    expectError(await post(app, { gameId: 'unknown-game', setup: {} }, key), 404, 'NOT_FOUND');
    for (const gameId of [FAKE_SOON_ID, FS]) {
      expectError(await post(app, { gameId, setup: {} }, key), 422, 'GAME_UNAVAILABLE');
    }
    // idempotency beats setup validation / support: a used key with an invalid or unsupported setup → 409
    expectError(
      await post(app, { gameId: FAKE_GAME_ID, setup: { start: 'x' } }, key),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
    expectError(
      await post(app, { gameId: FAKE_GAME_ID, setup: { start: 0, mode: 'unsupported' } }, key),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
    // fresh key: 400 setup before 422 unsupported
    const fresh = randomUUID();
    expectError(
      await post(app, { gameId: FAKE_GAME_ID, setup: { start: 'x', mode: 'unsupported' } }, fresh),
      400,
      'VALIDATION',
    );
    expectError(
      await post(app, { gameId: FAKE_GAME_ID, setup: { start: 0, mode: 'unsupported' } }, fresh),
      422,
      'SETUP_UNSUPPORTED',
    );
    expect(await sessionCount(app)).toBe(1);
  });

  it('Q-4 (deterministic race): the pre-check misses, insert hits the unique key → replay 200 / 409, no extra rows', async () => {
    const key = randomUUID();
    const { sessionId } = SessionResponseSchema.parse((await post(app, A, key)).body);
    const repo = app.get(SessionsRepository);
    const find = vi.spyOn(repo, 'findByIdempotencyKey');
    const insert = vi.spyOn(repo, 'insert');

    find.mockResolvedValueOnce(null);
    const same = await post(app, A, key);
    expect(same.status).toBe(200);
    expect(same.headers['idempotent-replay']).toBe('true');
    expect(same.body.sessionId).toBe(sessionId);
    expect(insert).toHaveBeenCalledTimes(1);
    await expect(insert.mock.results[0]!.value).resolves.toEqual({
      ok: false,
      reason: 'IDEMPOTENCY_KEY_TAKEN',
    });

    find.mockResolvedValueOnce(null);
    expectError(await post(app, B, key), 409, 'IDEMPOTENCY_KEY_REUSED');

    expect(await sessionCount(app)).toBe(1);
    expect(await prismaOf(app).sessionEvent.count()).toBe(1);
  });

  it('TC-I-36 / TC-I-38: the status comes from the module, is stored, and commands do not change it', async () => {
    const { sessionId, status } = SessionResponseSchema.parse((await post(app, A)).body);
    expect(status).toBe(FAKE_STATUS);
    const cmd = await postCommand(app, sessionId, {
      actor: 'player',
      expectedVersion: 1,
      command: { type: 'INC' },
    });
    expect(cmd.body.view.status).toBe(FAKE_STATUS);
    expect((await api(app).get(`/api/sessions/${sessionId}`)).body.status).toBe(FAKE_STATUS);
    const list = await api(app).get(`/api/sessions?gameId=${FAKE_GAME_ID}`);
    expect(list.body[0].status).toBe(FAKE_STATUS);
    expect(
      (await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } })).status,
    ).toBe(FAKE_STATUS);
  });

  it('a corrupt Session.status is a server fault: GET / command → 500, skipped in the list', async () => {
    const ok = SessionResponseSchema.parse((await post(app, A)).body);
    const bad = SessionResponseSchema.parse((await post(app, B)).body);
    await prismaOf(app).session.update({
      where: { id: bad.sessionId },
      data: { status: 'archived' },
    });

    expectError(
      await api(app).get(`/api/sessions/${bad.sessionId}`),
      500,
      'INTERNAL',
      'errors.internal',
    );
    expectError(
      await postCommand(app, bad.sessionId, {
        actor: 'player',
        expectedVersion: 1,
        command: { type: 'INC' },
      }),
      500,
      'INTERNAL',
    );
    const list = await api(app).get('/api/sessions');
    expect(list.status).toBe(200);
    expect(list.body.map((s: { sessionId: string }) => s.sessionId)).toEqual([ok.sessionId]);
  });

  it('TC-I-35 (generic): no response carries idempotencyKey/Hash, setup, state or the secret', async () => {
    const key = randomUUID();
    const bodies = [
      await post(app, A, key),
      await post(app, A, key),
      await post(app, B, key),
      await api(app).get('/api/sessions'),
    ];
    const { sessionId } = bodies[0]!.body as { sessionId: string };
    bodies.push(await api(app).get(`/api/sessions/${sessionId}`));
    bodies.push(
      await postCommand(app, sessionId, {
        actor: 'player',
        expectedVersion: 1,
        command: { type: 'INC' },
      }),
    );
    for (const res of bodies) {
      expect(res.text).not.toMatch(
        /"idempotencyKey"|"idempotencyHash"|"setup"|"state"|FAKE-SECRET/,
      );
      expect(res.text).not.toContain(key);
    }
  });
});

describe('idempotency survives an app restart on the same DB file (TC-I-24, platform part)', () => {
  it('app#2 replays the key stored by app#1; GET identical', async () => {
    const db = createTestDb();
    try {
      const key = randomUUID();
      const app1 = await startApp(db.url, OPTIONS);
      const created = await post(app1, A, key);
      expect(created.status).toBe(201);
      await stopApp(app1);

      const app2 = await startApp(db.url, OPTIONS);
      try {
        const replay = await post(app2, A, key);
        expect(replay.status).toBe(200);
        expect(replay.headers['idempotent-replay']).toBe('true');
        expect(replay.body).toEqual(created.body);
        expect((await api(app2).get(`/api/sessions/${created.body.sessionId}`)).body).toEqual(
          created.body,
        );
        expectError(await post(app2, B, key), 409, 'IDEMPOTENCY_KEY_REUSED');
        expect(await prismaOf(app2).session.count()).toBe(1);
      } finally {
        await stopApp(app2);
      }
    } finally {
      removeTestDb(db);
    }
  });
});
