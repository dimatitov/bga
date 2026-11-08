import type { INestApplication } from '@nestjs/common';
import {
  ListSessionsResponseSchema,
  MAX_SESSIONS_LISTED,
  SessionResponseSchema,
  SessionSummarySchema,
} from '@bga/platform';
import {
  GameStateSchema,
  PlayerViewPlayerSchema,
  RebellionSessionDetailsSchema,
  StoredRebellionSetupSchema,
} from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  FS,
  R,
  REBELS_HUMAN,
  DEF,
  SEEDED,
  createRebellionSession,
  createSeededDb,
  expectError,
  movableIn,
  moveEnv,
  playerView,
  postCommand,
  prismaOf,
  sequentialIds,
  tickingClock,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

function ids(list: { sessionId: string }[]): string[] {
  return list.map((s) => s.sessionId);
}

describe('sessions endpoints (Rebellion, real registry)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, { clock: tickingClock(), idGenerator: sequentialIds() });
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-SES-01: POST /api/sessions creates a Rebellion session; Session.gameId + GAME_CREATED persisted', async () => {
    const res = await api(app).post('/api/sessions').send({ gameId: R, setup: EMPIRE_AI });
    expect(res.status).toBe(201);
    const body = SessionResponseSchema.parse(res.body);
    expect(Object.keys(res.body).sort()).toEqual([
      'gameId',
      'sessionId',
      'settings',
      'status',
      'view',
    ]);
    expect(body.gameId).toBe(R);
    expect(body.sessionId).toBe('session-001');
    // SWR-005 W6a: engine-independent fields only (the mock-v1 initial position — version 1, round 1,
    // `assignment` — is a property of the mock rules, checked on seeded rows / in the rebellion package).
    const view = PlayerViewPlayerSchema.parse(body.view);
    expect(view).toMatchObject({ kind: 'player', id: body.sessionId, viewer: 'empire' });
    expect(view.log[0]).toMatchObject({ seq: 1, type: 'GAME_CREATED' });
    expect(view.legalActions.length).toBeGreaterThan(0);

    const prisma = prismaOf(app);
    const row = await prisma.session.findUniqueOrThrow({ where: { id: body.sessionId } });
    expect(row).toMatchObject({ gameId: R, version: view.version });
    const events = await prisma.sessionEvent.findMany({
      where: { sessionId: body.sessionId },
      orderBy: { seq: 'asc' },
    });
    // SWR-005 W6b (W5 accepted): "one event per version" (A-15) does not hold for core-v1 — event rows are
    // consecutive from seq 1 and mirror the stored log; every engine command is version + 1. Empire vs AI:
    // creation (version 1: GAME_CREATED + two PHASE_STARTED) + the AI Rebels' automatic pass (version 2).
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events[0]).toMatchObject({ seq: 1, type: 'GAME_CREATED', actor: 'system' });
    expect(events.map((e) => [e.type, e.actor])).toEqual([
      ['GAME_CREATED', 'system'],
      ['PHASE_STARTED', 'system'],
      ['PHASE_STARTED', 'system'],
      ['PASSED', 'rebels'],
    ]);
    expect(JSON.parse(events[3]!.payload)).toEqual({ auto: true });
    expect(view.version).toBe(2);
    expect(view.log.map((e) => e.seq)).toEqual(events.map((e) => e.seq));
  });

  it('TC-SES-01 (TC-API-03): rebellion vs human — settings, base visible (legal actions: seeded block below)', async () => {
    const { view } = await createRebellionSession(app, REBELS_HUMAN);
    expect(view.settings).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect(view.viewer).toBe('rebels');
    expect(view.rebelBase.systemId).not.toBeNull();
  });

  describe('TC-SES-02: invalid Rebellion setup → 400 VALIDATION with paths under setup, nothing persisted', () => {
    const cases: [string, unknown][] = [
      ['empty setup', {}],
      ['setup not an object', 'empire'],
      ['unknown faction', { ...EMPIRE_AI, playerFaction: 'sith' }],
      ['legacy faction id', { ...EMPIRE_AI, playerFaction: 'rebellion' }],
      ['unknown opponent type', { ...EMPIRE_AI, opponentType: 'robot' }],
      ['unknown difficulty', { ...EMPIRE_AI, aiDifficulty: 'insane' }],
      ['extra key', { ...EMPIRE_AI, cheat: true }],
      ['SWR-003 setup shape', { humanFaction: 'empire', opponent: { kind: 'ai' } }],
      ['human with difficulty (A-7)', { ...REBELS_HUMAN, aiDifficulty: 'easy' }],
    ];
    it.each(cases)('%s', async (_name, setup) => {
      const res = await api(app).post('/api/sessions').send({ gameId: R, setup });
      const err = expectError(res, 400, 'VALIDATION', 'errors.validation');
      const issues = (err.error.details as { issues: { path: unknown[] }[] }).issues;
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) expect(issue.path[0]).toBe('setup');
      expect(await prismaOf(app).session.count()).toBe(0);
    });
  });

  describe('TC-SES-03: malformed body → 400 VALIDATION, nothing persisted', () => {
    const cases: [string, unknown][] = [
      ['empty body', {}],
      ['no gameId', { setup: EMPIRE_AI }],
      ['gameId is a number', { gameId: 1, setup: EMPIRE_AI }],
      ['gameId empty', { gameId: '', setup: EMPIRE_AI }],
      ['gameId malformed', { gameId: 'Star Wars', setup: EMPIRE_AI }],
      ['extra key', { gameId: R, setup: EMPIRE_AI, extra: 1 }],
      ['SWR-002 body (setup only)', EMPIRE_AI],
    ];
    it.each(cases)('%s', async (_name, body) => {
      const res = await api(app)
        .post('/api/sessions')
        .send(body as object);
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      expect(await prismaOf(app).session.count()).toBe(0);
    });

    it('no setup key → 400 from the body schema, before the game lookup (Q-3)', async () => {
      for (const gameId of [R, 'unknown-game', FS]) {
        const res = await api(app).post('/api/sessions').send({ gameId });
        const err = expectError(res, 400, 'VALIDATION', 'errors.validation');
        expect(err.error.details).toMatchObject({ issues: [{ path: ['setup'] }] });
      }
      expect(await prismaOf(app).session.count()).toBe(0);
    });

    it('malformed JSON (no parser text in the body)', async () => {
      const res = await api(app)
        .post('/api/sessions')
        .set('Content-Type', 'application/json')
        .send('{"gameId": "star-wars-rebellion",');
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      expect(res.text).not.toMatch(/Unexpected|JSON at position|SyntaxError|stack/i);
      expect(await prismaOf(app).session.count()).toBe(0);
    });
  });

  it('TC-SES-04/05/06: unknown game → 404 gameNotFound; Forbidden Stars → 422 GAME_UNAVAILABLE (before setup validation)', async () => {
    for (const setup of [EMPIRE_AI, { nonsense: true }]) {
      const unknown = await api(app).post('/api/sessions').send({ gameId: 'unknown-game', setup });
      expect(unknown.body).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', messageKey: 'errors.gameNotFound' },
      });
      expect(unknown.status).toBe(404);
    }
    for (const setup of [EMPIRE_AI, {}, { nonsense: true }]) {
      const soon = await api(app).post('/api/sessions').send({ gameId: FS, setup });
      expectError(soon, 422, 'GAME_UNAVAILABLE', 'errors.gameUnavailable');
    }
    expect(await prismaOf(app).session.count()).toBe(0);
    expect(await prismaOf(app).sessionEvent.count()).toBe(0);
  });

  it('TC-API-05: AI without difficulty defaults to normal (A-7), stored setup is the parsed v2 form (SWR-004)', async () => {
    const { aiDifficulty: _omitted, ...withoutDifficulty } = EMPIRE_AI;
    const created = await createRebellionSession(app, withoutDifficulty);
    expect(created.view.settings.aiDifficulty).toBe('normal');
    expect(created.settings.aiDifficulty).toBe('normal');
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: created.sessionId } });
    expect(StoredRebellionSetupSchema.parse(JSON.parse(row.setup))).toEqual({
      schemaVersion: 2,
      playerFaction: 'empire',
      opponentFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      ruleset: 'base',
      gameMode: 'digital',
    });
    // The rules engine of a new session changes in SWR-005 W5; mock-v1 rows: upcast-v2.int.test.ts.
    expect(GameStateSchema.parse(JSON.parse(row.state)).schemaVersion).toBe(3);
  });

  it('TC-SES-07: GET /api/sessions/:id → { sessionId, gameId, view }; unknown / over-long id → 404 sessionNotFound', async () => {
    const { sessionId, view: created } = await createRebellionSession(app, EMPIRE_AI);
    const res = await api(app).get(`/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const body = SessionResponseSchema.parse(res.body);
    expect(body).toEqual({
      sessionId,
      gameId: R,
      status: 'prototype',
      settings: created.settings,
      view: created,
    });
    // MOVE_PIECES legal actions of the mock board: seeded block below (TC-SES-07 seeded).

    for (const id of ['unknown-id', 'x'.repeat(65), 'x'.repeat(1000)]) {
      const missing = await api(app).get(`/api/sessions/${id}`);
      expect(missing.body).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' },
      });
      expect(missing.status).toBe(404);
    }
  });

  it('TC-SES-08: GET /api/sessions → strict SessionSummary list, updatedAt desc, no state', async () => {
    const empty = await api(app).get('/api/sessions');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const s1 = await createRebellionSession(app, EMPIRE_AI);
    const s2 = await createRebellionSession(app, REBELS_HUMAN);
    const s3 = await createRebellionSession(app, { ...DEF, aiDifficulty: undefined });
    const res = await api(app).get('/api/sessions');
    expect(res.status).toBe(200);
    const list = ListSessionsResponseSchema.parse(res.body);
    expect(ids(list)).toEqual([s3.sessionId, s2.sessionId, s1.sessionId]);
    for (const item of res.body as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'details',
        'gameId',
        'sessionId',
        'status',
        'updatedAt',
        'version',
      ]);
      const summary = SessionSummarySchema.parse(item);
      expect(summary.gameId).toBe(R);
      expect(summary.status).toBe('prototype');
      for (const value of Object.values(summary.details)) {
        expect(value === null || ['string', 'number', 'boolean'].includes(typeof value)).toBe(true);
      }
      RebellionSessionDetailsSchema.parse(summary.details);
    }
    // Engine-independent part; the exact mock-v1 details (round/phase/rulesEngine/reputation): seeded block.
    expect(list[2]?.details).toMatchObject({
      playerFaction: 'empire',
      opponentFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'hard',
      ruleset: 'base',
      gameMode: 'digital',
      winner: null,
    });
    expect(list[1]?.details).toMatchObject({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
      winner: null,
    });
    expect(list[0]?.details).toMatchObject({ playerFaction: 'rebels', aiDifficulty: 'normal' });
    expect(res.text).not.toMatch(/"state"|"view"|"setup"|"pieces"|"rebelBase"/);
  });

  it('TC-SES-09 (A-18): at most 20 sessions listed, most recent first — with and without gameId', async () => {
    const created: string[] = [];
    for (let i = 0; i < MAX_SESSIONS_LISTED + 2; i++) {
      created.push((await createRebellionSession(app)).sessionId);
    }
    const expected = created.slice(2).reverse();
    for (const url of ['/api/sessions', `/api/sessions?gameId=${R}`]) {
      const res = await api(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(MAX_SESSIONS_LISTED);
      expect(ids(res.body)).toEqual(expected);
    }
  });

  it('TC-SES-10 (Q-5, R-2): gameId filter edge cases', async () => {
    const s1 = await createRebellionSession(app);
    const all = [s1.sessionId];
    const cases: [string, number, string[] | null][] = [
      [`?gameId=${R}`, 200, all],
      [`?gameId=${FS}`, 200, []],
      ['?gameId=unknown', 200, []],
      ['?gameId=', 200, all],
      ['?other=1', 200, all],
      [`?gameId=${R}&gameId=${FS}`, 400, null],
      ['?gameId=Foo%20Bar', 400, null],
      [`?gameId=${'a'.repeat(65)}`, 400, null],
    ];
    for (const [query, status, expected] of cases) {
      const res = await api(app).get(`/api/sessions${query}`);
      if (expected === null) {
        expectError(res, status, 'VALIDATION', 'errors.validation');
      } else {
        expect([query, res.status]).toEqual([query, status]);
        expect(ids(res.body)).toEqual(expected);
      }
    }
  });

  it('TC-SES-16 (review #1): a corrupt saved session is skipped in the list; GET → 500', async () => {
    const healthy = await createRebellionSession(app, EMPIRE_AI);
    const broken = await createRebellionSession(app, REBELS_HUMAN);
    await prismaOf(app).session.update({
      where: { id: broken.sessionId },
      data: { state: '{"broken":' },
    });

    const res = await api(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(ids(ListSessionsResponseSchema.parse(res.body))).toEqual([healthy.sessionId]);
    expect(res.text).not.toContain('broken');

    expectError(
      await api(app).get(`/api/sessions/${broken.sessionId}`),
      500,
      'INTERNAL',
      'errors.internal',
    );
  });

  it('TC-SES-18 (TC-API-10): ?viewer=rebels is ignored — still the empire view', async () => {
    const { sessionId } = await createRebellionSession(app, EMPIRE_AI);
    const res = await api(app).get(`/api/sessions/${sessionId}?viewer=rebels`);
    expect(res.status).toBe(200);
    const view = PlayerViewPlayerSchema.parse(SessionResponseSchema.parse(res.body).view);
    expect(view.viewer).toBe('empire');
    expect(view.rebelBase.systemId).toBeNull();
  });
});

/**
 * SWR-005 W6a (Q-1): mock-v1 boards, details and commands on the seeded SWR-004 rows (frozen v2 snapshot;
 * real clock — the seeded `updatedAt` values are in the past).
 */
describe('sessions endpoints on seeded mock-v1 rows', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it("TC-SES-01 (TC-API-03, seeded): legal MOVE_PIECES actions only for the viewer's own pieces", async () => {
    for (const row of [SEEDED.rebelsAi, SEEDED.empireAi]) {
      const res = await api(app).get(`/api/sessions/${row.id}`);
      expect(res.status).toBe(200);
      const view = playerView(res.body.view);
      const owners = new Set(
        view.legalActions
          .filter((a) => a.type === 'MOVE_PIECES')
          .map((a) => view.pieces.find((p) => p.id === a.pieceId)?.owner),
      );
      expect([...owners]).toEqual([view.viewer]);
    }
  });

  it('TC-SES-07 (seeded): GET → { sessionId, gameId, status, settings, view }; MOVE_PIECES only empire pieces', async () => {
    const row = SEEDED.empireAi;
    const res = await api(app).get(`/api/sessions/${row.id}`);
    expect(res.status).toBe(200);
    const body = SessionResponseSchema.parse(res.body);
    expect(Object.keys(res.body).sort()).toEqual([
      'gameId',
      'sessionId',
      'settings',
      'status',
      'view',
    ]);
    expect(body).toMatchObject({ sessionId: row.id, gameId: R, status: 'prototype' });
    const view = playerView(body.view);
    expect(body.settings).toEqual(view.settings);
    expect(view.version).toBe(row.version);
    for (const action of view.legalActions) {
      if (action.type === 'MOVE_PIECES') {
        expect(view.pieces.find((p) => p.id === action.pieceId)?.owner).toBe('empire');
      }
    }
  });

  it('TC-SES-08 (seeded): exact mock-v1 details, updatedAt desc', async () => {
    const res = await api(app).get('/api/sessions');
    const list = ListSessionsResponseSchema.parse(res.body);
    expect(ids(list)).toEqual([SEEDED.hotseat.id, SEEDED.empireAi.id, SEEDED.rebelsAi.id]);
    const mock = {
      rulesEngine: 'mock-v1',
      winner: null,
      reputation: null,
      ruleset: 'base',
      gameMode: 'digital',
    };
    expect(list[0]?.details).toEqual({
      ...mock,
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      round: 1,
      phase: 'assignment',
    });
    expect(list[1]?.details).toEqual({
      ...mock,
      playerFaction: 'empire',
      opponentFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'hard',
      round: 1,
      phase: 'assignment',
    });
    expect(list[2]?.details).toEqual({
      ...mock,
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      round: 1,
      phase: 'command',
    });
    expect(res.text).not.toMatch(/"state"|"view"|"setup"|"pieces"|"rebelBase"/);
  });

  it('TC-SES-11: a command moves the older session to the top; version + 1', async () => {
    const older = SEEDED.rebelsAi;
    let res = await api(app).get('/api/sessions');
    expect(ids(res.body).at(-1)).toBe(older.id);

    const m = movableIn(older, 'rebels');
    const moved = await postCommand(
      app,
      older.id,
      moveEnv('rebels', older.version, [m.pieceId], m.from, m.adjacent),
    );
    expect(moved.status).toBe(200);

    res = await api(app).get('/api/sessions');
    const list = ListSessionsResponseSchema.parse(res.body);
    expect(ids(list)).toEqual([older.id, SEEDED.hotseat.id, SEEDED.empireAi.id]);
    expect(list[0]?.version).toBe(older.version + 1);
    expect(Date.parse(list[0]!.updatedAt)).toBeGreaterThan(Date.parse(list[0]!.createdAt));
  });

  it('TC-SES-18 (TC-API-10, seeded): ?viewer=rebels is ignored — still the empire view, hidden types masked', async () => {
    const res = await api(app).get(`/api/sessions/${SEEDED.empireAi.id}?viewer=rebels`);
    expect(res.status).toBe(200);
    const view = playerView(SessionResponseSchema.parse(res.body).view);
    expect(view.viewer).toBe('empire');
    expect(view.rebelBase.systemId).toBeNull();
    const hidden = view.pieces.filter((p) => p.owner === 'rebels' && p.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    for (const p of hidden) expect(p.typeKey).toBe('unknown');
  });
});
