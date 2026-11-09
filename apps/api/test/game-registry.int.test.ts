import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  GameDefinitionSchema,
  ListSessionsResponseSchema,
  SessionDetailsSchema,
  SessionResponseSchema,
  SessionStatusSchema,
  type GameDefinition,
  type ServerGameModule,
} from '@bga/platform';
import { forbiddenStarsDefinition } from '@bga/game-forbidden-stars/definition';
import { rebellionDefinition } from '@bga/game-rebellion/definition';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory';
import { GAME_DEFINITIONS } from '../src/game-registry/definitions';
import { createGameRegistry, validateRegistry } from '../src/game-registry/game-registry';
import { SERVER_GAME_MODULES } from '../src/game-registry/registry';
import { API_ROOT } from './global-setup';
import {
  EMPIRE_AI,
  FS,
  R,
  createRebellionSession,
  createSession,
  dbSnapshot,
  expectError,
  postCommand,
  prismaOf,
  sequentialIds,
  tickingClock,
} from './support/fixtures';
import {
  FAKE_GAME_ID,
  FAKE_LIMIT,
  FAKE_SECRET,
  FAKE_SOON_ID,
  FAKE_STATUS,
  fakeGameDefinition,
  fakeGameModule,
  fakeSoonDefinition,
} from './support/fake-game';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';
import { testConfig } from './support/test-config';

const ALL_DEFINITIONS = [
  rebellionDefinition,
  forbiddenStarsDefinition,
  fakeGameDefinition,
  fakeSoonDefinition,
];
const ALL_MODULES = [rebellionServerModule, fakeGameModule];

function inc(expectedVersion: number) {
  return { actor: 'player', expectedVersion, command: { type: 'INC' } };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('server game registry (unit)', () => {
  it('TC-FS-03 / TC-ARCH-04: modules = [Rebellion]; definitions = [Rebellion, Forbidden Stars] (catalogue order)', () => {
    expect(SERVER_GAME_MODULES.map((m) => m.definition.id)).toEqual([R]);
    expect(GAME_DEFINITIONS.map((d) => d.id)).toEqual([R, FS]);
    expect(GAME_DEFINITIONS.find((d) => d.id === FS)?.status).toBe('coming_soon');
    expect(() =>
      validateRegistry({ modules: SERVER_GAME_MODULES, definitions: GAME_DEFINITIONS }),
    ).not.toThrow();
  });

  it('TC-ARCH-04: registries are static arrays — no runtime registration or computed imports in src', () => {
    for (const file of sourceFiles(join(API_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(
        /\bregister\(|\.push\(\s*\w*Module|require\(|createRequire|readdirSync/,
      );
      expect(text).not.toMatch(/import\(\s*[^'"\s]/);
    }
  });

  const invalid: [string, readonly ServerGameModule[], readonly GameDefinition[]][] = [
    [
      'duplicate definition id',
      [rebellionServerModule],
      [rebellionDefinition, rebellionDefinition],
    ],
    ['duplicate module', [rebellionServerModule, rebellionServerModule], [rebellionDefinition]],
    ['module without definition', [rebellionServerModule, fakeGameModule], [rebellionDefinition]],
    [
      'module for a coming_soon game',
      [
        rebellionServerModule,
        { ...fakeGameModule, definition: { ...fakeGameDefinition, status: 'coming_soon' } },
      ],
      [rebellionDefinition, { ...fakeGameDefinition, status: 'coming_soon' }],
    ],
    [
      'available game without module',
      [rebellionServerModule],
      [rebellionDefinition, fakeGameDefinition],
    ],
    [
      'module definition differs from the catalogue',
      [rebellionServerModule],
      [{ ...rebellionDefinition, name: 'Other name' }],
    ],
    [
      'invalid definition',
      [rebellionServerModule],
      [rebellionDefinition, { ...fakeSoonDefinition, id: 'Not Kebab' }],
    ],
  ];
  it.each(invalid)('validateRegistry throws: %s', (_name, modules, definitions) => {
    expect(() => validateRegistry({ modules, definitions })).toThrow(/game registry/);
  });

  it('an inconsistent registry fails the app start (createApp throws)', async () => {
    await expect(
      createApp({
        config: testConfig({ databaseUrl: 'file:./never-opened.db' }),
        logger: false,
        gameModules: [rebellionServerModule],
        gameDefinitions: [rebellionDefinition, fakeGameDefinition],
      }),
    ).rejects.toThrow(/has no server module/);
  });

  it('requireAvailable: unknown → 404 gameNotFound; coming_soon → 422 GAME_UNAVAILABLE', () => {
    const registry = createGameRegistry({ modules: ALL_MODULES, definitions: ALL_DEFINITIONS });
    expect(registry.requireAvailable(FAKE_GAME_ID)).toBe(fakeGameModule);
    expect(() => registry.requireAvailable('nope')).toThrow(
      expect.objectContaining({ status: 404, messageKey: 'errors.gameNotFound' }),
    );
    for (const id of [FS, FAKE_SOON_ID]) {
      expect(() => registry.requireAvailable(id)).toThrow(
        expect.objectContaining({ status: 422, code: 'GAME_UNAVAILABLE' }),
      );
    }
  });

  describe.each(SERVER_GAME_MODULES.map((m) => [m.definition.id, m] as const))(
    'conformance of server module %s',
    (_id, module) => {
      const setupFor: Record<string, unknown> = { [R]: EMPIRE_AI };
      const ctx = { sessionId: 'conf-1', now: '2026-01-01T00:00:00.000Z' };

      it('definition is valid and available', () => {
        expect(GameDefinitionSchema.parse(module.definition)).toEqual(module.definition);
        expect(module.definition.status).toBe('available');
      });

      it('createInitialState → version ≥ 1 (AM-BE-2), events seq ≥ 1; summarize is flat; statusOf is a SessionStatus; parseState(JSON roundtrip) ≡ state', () => {
        const setup = module.parseSetup(setupFor[module.definition.id]);
        expect(setup.ok).toBe(true);
        if (!setup.ok) return;
        const { state, events } = module.createInitialState(setup.value, ctx);
        const version = module.version(state);
        expect(version).toBeGreaterThanOrEqual(1);
        expect(events.length).toBeGreaterThan(0);
        for (const e of events) expect(e.seq).toBeGreaterThanOrEqual(1);
        SessionDetailsSchema.parse(module.summarize(state));
        // SWR-005 AM-BE-1: required, pure, returns a valid status for any parsed state.
        SessionStatusSchema.parse(module.statusOf(state));
        const restored = module.parseState(JSON.parse(JSON.stringify(state)), {
          sessionId: ctx.sessionId,
          version,
        });
        expect(restored).toEqual(state);
        expect(() =>
          module.parseState(JSON.parse(JSON.stringify(state)), { sessionId: 'other', version }),
        ).toThrow();
        const rejected = module.applyCommand(state, {}, { now: ctx.now });
        expect(rejected.ok).toBe(false);
        if (!rejected.ok) expect(rejected.error.code).toBe('VALIDATION');
      });

      it('parseSetup rejects garbage with issues', () => {
        const res = module.parseSetup({ garbage: true });
        expect(res.ok).toBe(false);
      });
    },
  );
});

describe('session service with a fake game (AC-5(a), TR-3)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, {
      clock: tickingClock(),
      idGenerator: sequentialIds(),
      gameModules: ALL_MODULES,
      gameDefinitions: ALL_DEFINITIONS,
    });
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-EXT-01/02: create, get and list a fake-game session; no secret leaves the server', async () => {
    const res = await api(app)
      .post('/api/sessions')
      .send({ gameId: FAKE_GAME_ID, setup: { start: 0 } });
    expect(res.status).toBe(201);
    const created = SessionResponseSchema.parse(res.body);
    expect(created).toEqual({
      sessionId: 'session-001',
      gameId: FAKE_GAME_ID,
      status: FAKE_STATUS,
      settings: { start: 0, mode: 'normal' },
      view: { count: 0, version: 1, status: FAKE_STATUS },
    });
    expect(res.text).not.toContain(FAKE_SECRET);

    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: created.sessionId } });
    expect(row.gameId).toBe(FAKE_GAME_ID);
    expect(row.state).toContain(FAKE_SECRET);
    expect(JSON.parse(row.setup)).toEqual({ start: 0, mode: 'normal' });
    expect(row.status).toBe(FAKE_STATUS);

    const got = await api(app).get(`/api/sessions/${created.sessionId}`);
    expect(got.status).toBe(200);
    expect(got.body).toEqual(created);
    expect(got.text).not.toContain(FAKE_SECRET);

    const list = await api(app).get(`/api/sessions?gameId=${FAKE_GAME_ID}`);
    expect(list.status).toBe(200);
    const summaries = ListSessionsResponseSchema.parse(list.body);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      sessionId: created.sessionId,
      gameId: FAKE_GAME_ID,
      status: FAKE_STATUS,
      version: 1,
      details: { count: 0 },
    });
    expect(list.text).not.toContain(FAKE_SECRET);
  });

  it('TC-EXT-03: commands of the fake game — 200, 409, 422 errors.fakeLimit, 400, 404; order 404→400→409→422', async () => {
    const { sessionId } = await createSession(app, FAKE_GAME_ID, { start: 0 });

    const ok = await postCommand(app, sessionId, inc(1));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      ok: true,
      view: { count: 1, version: 2, status: FAKE_STATUS },
      events: [{ seq: 2, type: 'INCREMENTED', count: 1 }],
    });

    const stale = await postCommand(app, sessionId, inc(1));
    expect(
      expectError(stale, 409, 'VERSION_CONFLICT', 'errors.versionConflict').error.details,
    ).toEqual({
      currentVersion: 2,
    });

    expect((await postCommand(app, sessionId, inc(2))).status).toBe(200);
    expect((await postCommand(app, sessionId, inc(3))).status).toBe(200);
    const before = await dbSnapshot(app, sessionId);
    const limit = await postCommand(app, sessionId, inc(4));
    expectError(limit, 422, 'ILLEGAL_COMMAND', 'errors.fakeLimit');
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
    expect(before.session?.version).toBe(FAKE_LIMIT + 1);
    expect(before.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);

    expectError(
      await postCommand(app, sessionId, { ...inc(4), command: { type: 'BAD' } }),
      400,
      'VALIDATION',
    );
    expectError(
      await postCommand(app, 'no-such-session', inc(4)),
      404,
      'NOT_FOUND',
      'errors.sessionNotFound',
    );

    // order: 404 beats 400; 400 (frame and module schema) beats 409; 409 beats 422.
    expectError(await postCommand(app, 'no-such-session', { bad: true }), 404, 'NOT_FOUND');
    expectError(
      await postCommand(app, sessionId, { ...inc(1), command: { type: 'BAD' } }),
      400,
      'VALIDATION',
    );
    expectError(
      await postCommand(app, sessionId, { actor: 'player', expectedVersion: 0, command: {} }),
      400,
      'VALIDATION',
    );
    expectError(await postCommand(app, sessionId, inc(1)), 409, 'VERSION_CONFLICT');
  });

  it('TC-EXT-04: invalid fake setup → 400 from parseSetup (path under setup), nothing saved', async () => {
    const res = await api(app)
      .post('/api/sessions')
      .send({ gameId: FAKE_GAME_ID, setup: { start: 'x' } });
    const err = expectError(res, 400, 'VALIDATION', 'errors.validation');
    expect((err.error.details as { issues: { path: unknown[] }[] }).issues[0]?.path).toEqual([
      'setup',
      'start',
    ]);
    expect(await prismaOf(app).session.count()).toBe(0);
  });

  it('TC-EXT-05 / TC-SES-05 / AC-6: coming_soon games (fake-soon, forbidden-stars) → 422 GAME_UNAVAILABLE; unknown → 404', async () => {
    for (const gameId of [FAKE_SOON_ID, FS]) {
      const res = await api(app).post('/api/sessions').send({ gameId, setup: {} });
      expectError(res, 422, 'GAME_UNAVAILABLE', 'errors.gameUnavailable');
    }
    const unknown = await api(app)
      .post('/api/sessions')
      .send({ gameId: 'unknown-game', setup: {} });
    expectError(unknown, 404, 'NOT_FOUND', 'errors.gameNotFound');
    expect(await prismaOf(app).session.count()).toBe(0);
    for (const gameId of [FAKE_SOON_ID, FS, 'unknown-game']) {
      const list = await api(app).get(`/api/sessions?gameId=${gameId}`);
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
    }
  });

  it('TC-GP-11: the list filter is per game (the newest session of another game does not leak)', async () => {
    const r1 = await createRebellionSession(app, EMPIRE_AI);
    const f1 = await createSession(app, FAKE_GAME_ID, { start: 2 });

    const rebellion = await api(app).get(`/api/sessions?gameId=${R}`);
    expect(rebellion.body.map((s: { sessionId: string }) => s.sessionId)).toEqual([r1.sessionId]);
    const fake = await api(app).get(`/api/sessions?gameId=${FAKE_GAME_ID}`);
    expect(fake.body.map((s: { sessionId: string }) => s.sessionId)).toEqual([f1.sessionId]);
    const all = await api(app).get('/api/sessions');
    expect(ListSessionsResponseSchema.parse(all.body).map((s) => [s.sessionId, s.gameId])).toEqual([
      [f1.sessionId, FAKE_GAME_ID],
      [r1.sessionId, R],
    ]);
  });

  it('TC-SES-17 (Q-7): a stored session of a game without a server module — skipped in lists, GET/command → 422', async () => {
    const r1 = await createRebellionSession(app, EMPIRE_AI);
    const prisma = prismaOf(app);
    const orphanState = JSON.stringify({ id: 'orphan-1', version: 1, secret: 'ORPHAN-SECRET' });
    // removed-game: not in the catalogue at all; fake-soon: in the catalogue, but coming_soon.
    for (const [id, gameId] of [
      ['orphan-1', 'removed-game'],
      ['orphan-2', FAKE_SOON_ID],
    ] as const) {
      await prisma.session.create({
        data: {
          id,
          gameId,
          setup: '{}',
          state: orphanState,
          version: 1,
          createdAt: new Date('2030-01-01T00:00:00.000Z'),
          updatedAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      });
    }

    const list = await api(app).get('/api/sessions');
    expect(list.status).toBe(200);
    expect(list.body.map((s: { sessionId: string }) => s.sessionId)).toEqual([r1.sessionId]);
    const filtered = await api(app).get('/api/sessions?gameId=removed-game');
    expect(filtered.status).toBe(200);
    expect(filtered.body).toEqual([]);

    for (const id of ['orphan-1', 'orphan-2']) {
      const got = await api(app).get(`/api/sessions/${id}`);
      expectError(got, 422, 'GAME_UNAVAILABLE', 'errors.gameUnavailable');
      expect(got.text).not.toContain('ORPHAN-SECRET');
      const cmd = await postCommand(app, id, inc(1));
      expectError(cmd, 422, 'GAME_UNAVAILABLE', 'errors.gameUnavailable');
      // 400 (frame) still comes before 422 (D-6)
      expectError(await postCommand(app, id, { nonsense: true }), 400, 'VALIDATION');
    }
  });
});
