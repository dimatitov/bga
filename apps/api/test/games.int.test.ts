import type { INestApplication } from '@nestjs/common';
import {
  GameSetupSchema,
  GameSummarySchema,
  ListGamesResponseSchema,
  MAX_GAMES_LISTED,
  PlayerViewSchema,
} from '@swr/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  REBELLION_HUMAN,
  createGame,
  expectError,
  movable,
  moveEnv,
  postCommand,
  prismaOf,
  sequentialIds,
  tickingClock,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

describe('games endpoints', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, { clock: tickingClock(), idGenerator: sequentialIds() });
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-API-02: POST /api/games creates a game (empire vs AI) and persists Game + GAME_CREATED', async () => {
    const res = await api(app).post('/api/games').send(EMPIRE_AI);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['gameId', 'view']);
    const view = PlayerViewSchema.parse(res.body.view);
    expect(view.id).toBe(res.body.gameId);
    expect(view.version).toBe(1);
    expect(view.round).toBe(1);
    expect(view.phase).toBe('assignment');
    expect(view.log[0]).toMatchObject({ seq: 1, type: 'GAME_CREATED' });
    expect(view.legalActions.length).toBeGreaterThan(0);

    const prisma = prismaOf(app);
    const row = await prisma.game.findUnique({ where: { id: res.body.gameId } });
    expect(row?.version).toBe(1);
    const events = await prisma.gameEvent.findMany({ where: { gameId: res.body.gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ seq: 1, type: 'GAME_CREATED', actor: 'system' });
  });

  it('TC-API-03: rebellion vs human — view for rebellion, base visible, legal actions only for rebel pieces', async () => {
    const { view } = await createGame(app, REBELLION_HUMAN);
    expect(view.setup).toEqual({ humanFaction: 'rebellion', opponent: { kind: 'human' } });
    expect(view.rebelBase.systemId).not.toBeNull();
    const owners = new Set(
      view.legalActions
        .filter((a) => a.type === 'MOVE_PIECES')
        .map((a) => view.pieces.find((p) => p.id === a.pieceId)?.owner),
    );
    expect([...owners]).toEqual(['rebellion']);
  });

  describe('TC-API-04: invalid setup → 400 VALIDATION, nothing persisted', () => {
    const cases: [string, unknown][] = [
      ['empty body', {}],
      ['unknown faction', { humanFaction: 'sith', opponent: { kind: 'ai' } }],
      ['unknown opponent kind', { humanFaction: 'empire', opponent: { kind: 'robot' } }],
      [
        'unknown difficulty',
        { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'insane' } },
      ],
      ['extra key', { ...EMPIRE_AI, cheat: true }],
    ];
    it.each(cases)('%s', async (_name, body) => {
      const res = await api(app)
        .post('/api/games')
        .send(body as object);
      const err = expectError(res, 400, 'VALIDATION', 'errors.validation');
      expect(Array.isArray((err.error.details as { issues: unknown[] }).issues)).toBe(true);
      expect(await prismaOf(app).game.count()).toBe(0);
    });

    it('malformed JSON (no parser text in the body)', async () => {
      const res = await api(app)
        .post('/api/games')
        .set('Content-Type', 'application/json')
        .send('{"humanFaction": "empire",');
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      expect(res.text).not.toMatch(/Unexpected|JSON at position|SyntaxError|stack/i);
      expect(await prismaOf(app).game.count()).toBe(0);
    });
  });

  it('TC-API-05: AI without difficulty defaults to normal; human with difficulty → 400 (A-7)', async () => {
    const created = await createGame(app, { humanFaction: 'empire', opponent: { kind: 'ai' } });
    expect(created.view.setup.opponent).toEqual({ kind: 'ai', difficulty: 'normal' });
    const row = await prismaOf(app).game.findUnique({ where: { id: created.gameId } });
    expect(GameSetupSchema.parse(JSON.parse(row!.setup)).opponent).toEqual({
      kind: 'ai',
      difficulty: 'normal',
    });

    const res = await api(app)
      .post('/api/games')
      .send({ humanFaction: 'empire', opponent: { kind: 'human', difficulty: 'easy' } });
    expectError(res, 400, 'VALIDATION');
    expect(await prismaOf(app).game.count()).toBe(1);
  });

  it('TC-API-06: GET /api/games on an empty DB → []', async () => {
    const res = await api(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-API-07: summaries ordered by updatedAt desc, no state fields', async () => {
    const g1 = await createGame(app, EMPIRE_AI);
    const g2 = await createGame(app, REBELLION_HUMAN);
    let res = await api(app).get('/api/games');
    expect(res.body.map((s: { gameId: string }) => s.gameId)).toEqual([g2.gameId, g1.gameId]);

    const m = movable('empire');
    const moved = await postCommand(
      app,
      g1.gameId,
      moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent),
    );
    expect(moved.status).toBe(200);

    res = await api(app).get('/api/games');
    expect(res.status).toBe(200);
    const list = ListGamesResponseSchema.parse(res.body);
    expect(list.map((s) => s.gameId)).toEqual([g1.gameId, g2.gameId]);
    for (const item of res.body as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(['gameId', 'phase', 'round', 'setup', 'updatedAt']);
      GameSummarySchema.parse(item);
    }
    expect(res.text).not.toMatch(/"state"|"pieces"|"rebelBase"/);
  });

  it('TC-API-07 (review #1): a corrupt saved game is skipped, the list still works', async () => {
    const healthy = await createGame(app, EMPIRE_AI);
    const broken = await createGame(app, REBELLION_HUMAN);
    await prismaOf(app).game.update({
      where: { id: broken.gameId },
      data: { state: '{"broken":' },
    });

    const res = await api(app).get('/api/games');
    expect(res.status).toBe(200);
    const list = ListGamesResponseSchema.parse(res.body);
    expect(list.map((s) => s.gameId)).toEqual([healthy.gameId]);
    expect(res.text).not.toContain('broken');

    // Opening the corrupt game directly is still a server fault (500), not silently hidden.
    expectError(
      await api(app).get(`/api/games/${broken.gameId}`),
      500,
      'INTERNAL',
      'errors.internal',
    );
  });

  it('TC-API-07 (A-18): at most 20 games are listed (most recent first)', async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_GAMES_LISTED + 1; i++) ids.push((await createGame(app)).gameId);
    const res = await api(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(MAX_GAMES_LISTED);
    expect(res.body.map((s: { gameId: string }) => s.gameId)).toEqual(ids.slice(1).reverse());
  });

  it('TC-API-08: GET /api/games/:id → PlayerView of the human side', async () => {
    const { gameId, view: created } = await createGame(app, EMPIRE_AI);
    const res = await api(app).get(`/api/games/${gameId}`);
    expect(res.status).toBe(200);
    const view = PlayerViewSchema.parse(res.body);
    expect(view).toEqual(created);
    for (const action of view.legalActions) {
      if (action.type === 'MOVE_PIECES') {
        expect(view.pieces.find((p) => p.id === action.pieceId)?.owner).toBe('empire');
      }
    }
  });

  it('TC-API-09: unknown game → 404 NOT_FOUND (unified body)', async () => {
    const res = await api(app).get('/api/games/unknown-id');
    expectError(res, 404, 'NOT_FOUND', 'errors.notFound');
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' },
    });
  });

  it('TC-API-09: over-long id → 404 (malformed ids are unknown ids)', async () => {
    const res = await api(app).get(`/api/games/${'x'.repeat(65)}`);
    expectError(res, 404, 'NOT_FOUND');
  });

  it('TC-API-10: ?viewer=rebellion is ignored — still the empire view', async () => {
    const { gameId } = await createGame(app, EMPIRE_AI);
    const res = await api(app).get(`/api/games/${gameId}?viewer=rebellion`);
    expect(res.status).toBe(200);
    const view = PlayerViewSchema.parse(res.body);
    expect(view.setup.humanFaction).toBe('empire');
    expect(view.rebelBase.systemId).toBeNull();
    const hidden = view.pieces.filter((p) => p.owner === 'rebellion' && p.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    for (const p of hidden) expect(p.typeKey).toBe('unknown');
  });
});
