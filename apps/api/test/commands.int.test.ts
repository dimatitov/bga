import type { INestApplication } from '@nestjs/common';
import { CommandOkSchema, GameEventSchema, GameStateSchema } from '@swr/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  advanceEnv,
  createGame,
  dbSnapshot,
  expectError,
  movable,
  moveEnv,
  pieceIn,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

describe('POST /api/games/:id/commands', () => {
  let db: TestDb;
  let app: INestApplication;
  let gameId: string;
  const m = movable('empire');
  const r = movable('rebellion');

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url);
    gameId = (await createGame(app, EMPIRE_AI)).gameId;
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  async function expectUnchanged(before: Awaited<ReturnType<typeof dbSnapshot>>) {
    expect(await dbSnapshot(app, gameId)).toEqual(before);
  }

  it('TC-API-14: legal move → 200, version 2, piece moved, PIECES_MOVED persisted', async () => {
    const res = await postCommand(
      app,
      gameId,
      moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent),
    );
    expect(res.status).toBe(200);
    const body = CommandOkSchema.parse(res.body);
    expect(body.view.version).toBe(2);
    expect(pieceIn(body.view, m.pieceId)?.systemId).toBe(m.adjacent);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ seq: 2, type: 'PIECES_MOVED', actor: 'empire' });

    const { game, events } = await dbSnapshot(app, gameId);
    expect(game?.version).toBe(2);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events[1]).toMatchObject({ type: 'PIECES_MOVED', actor: 'empire' });

    const got = await api(app).get(`/api/games/${gameId}`);
    expect(got.body).toEqual(body.view);
  });

  it('TC-API-15: non-adjacent target → 422 errors.notAdjacent, nothing changes', async () => {
    const before = await dbSnapshot(app, gameId);
    const res = await postCommand(
      app,
      gameId,
      moveEnv('empire', 1, [m.pieceId], m.from, m.nonAdjacent),
    );
    expectError(res, 422, 'ILLEGAL_COMMAND', 'errors.notAdjacent');
    await expectUnchanged(before);
    const got = await api(app).get(`/api/games/${gameId}`);
    expect(got.body.version).toBe(1);
    expect(pieceIn(got.body, m.pieceId)?.systemId).toBe(m.from);
  });

  it.each([0, 2])(
    'TC-API-16: expectedVersion %i ≠ 1 → 409 with currentVersion, nothing changes',
    async (expectedVersion) => {
      const before = await dbSnapshot(app, gameId);
      const res = await postCommand(
        app,
        gameId,
        moveEnv('empire', expectedVersion, [m.pieceId], m.from, m.adjacent),
      );
      if (expectedVersion === 0) {
        // 0 is not a valid version at all (positive int) → schema error first (A-5: 400 before 409).
        expectError(res, 400, 'VALIDATION');
      } else {
        const err = expectError(res, 409, 'VERSION_CONFLICT', 'errors.versionConflict');
        expect(err.error.details).toEqual({ currentVersion: 1 });
      }
      await expectUnchanged(before);
    },
  );

  it('TC-API-16: stale version after a successful move → 409 currentVersion = 2', async () => {
    expect(
      (await postCommand(app, gameId, moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent)))
        .status,
    ).toBe(200);
    const before = await dbSnapshot(app, gameId);
    const res = await postCommand(app, gameId, advanceEnv('empire', 1));
    const err = expectError(res, 409, 'VERSION_CONFLICT');
    expect(err.error.details).toEqual({ currentVersion: 2 });
    await expectUnchanged(before);
  });

  describe('TC-API-17: malformed envelope → 400 VALIDATION, nothing changes', () => {
    const valid = () => moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent);
    const cases: [string, () => unknown][] = [
      ['no command', () => ({ actor: 'empire', expectedVersion: 1 })],
      ['unknown command type', () => ({ ...valid(), command: { type: 'FLY' } })],
      [
        'pieceIds not an array',
        () => ({ ...valid(), command: { ...valid().command, pieceIds: 'x' } }),
      ],
      ['empty pieceIds', () => ({ ...valid(), command: { ...valid().command, pieceIds: [] } })],
      [
        'duplicate pieceIds',
        () => ({ ...valid(), command: { ...valid().command, pieceIds: [m.pieceId, m.pieceId] } }),
      ],
      ['expectedVersion as string', () => ({ ...valid(), expectedVersion: '1' })],
      ['unknown actor', () => ({ ...valid(), actor: 'jedi' })],
      ['extra key', () => ({ ...valid(), extra: 1 })],
      ['empty body', () => ({})],
    ];
    it.each(cases)('%s', async (_name, body) => {
      const before = await dbSnapshot(app, gameId);
      const res = await postCommand(app, gameId, body());
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      await expectUnchanged(before);
    });

    it('malformed JSON', async () => {
      const before = await dbSnapshot(app, gameId);
      const res = await api(app)
        .post(`/api/games/${gameId}/commands`)
        .set('Content-Type', 'application/json')
        .send('{"actor":');
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      expect(res.text).not.toMatch(/Unexpected|JSON at position|SyntaxError/);
      await expectUnchanged(before);
    });
  });

  it('TC-API-18: unknown game → 404 for valid and schema-invalid bodies (404 first, A-5)', async () => {
    const ok = await postCommand(
      app,
      'unknown',
      moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent),
    );
    expectError(ok, 404, 'NOT_FOUND', 'errors.notFound');
    const bad = await postCommand(app, 'unknown', { nonsense: true });
    expectError(bad, 404, 'NOT_FOUND', 'errors.notFound');
  });

  describe('TC-API-19: semantic rejections → 422 with messageKey, nothing changes', () => {
    const cases: [string, () => unknown, string][] = [
      [
        'enemy piece',
        () => moveEnv('empire', 1, [r.pieceId], r.from, r.adjacent),
        'errors.notOwner',
      ],
      [
        'unknown piece',
        () => moveEnv('empire', 1, ['no-such-piece'], m.from, m.adjacent),
        'errors.unknownPiece',
      ],
      ['from = to', () => moveEnv('empire', 1, [m.pieceId], m.from, m.from), 'errors.sameSystem'],
      ['not your side', () => advanceEnv('rebellion', 1), 'errors.notYourSide'],
      [
        'unknown system',
        () => moveEnv('empire', 1, [m.pieceId], m.from, 'sys-nowhere'),
        'errors.unknownSystem',
      ],
      [
        'piece not in fromSystem',
        () => moveEnv('empire', 1, [m.pieceId], m.adjacent, m.from),
        'errors.notInFromSystem',
      ],
    ];
    it.each(cases)('%s', async (_name, body, messageKey) => {
      const before = await dbSnapshot(app, gameId);
      const res = await postCommand(app, gameId, body());
      expectError(res, 422, 'ILLEGAL_COMMAND', messageKey);
      await expectUnchanged(before);
    });
  });

  it('A-5 order: 409 wins over 422; 400 wins over 409', async () => {
    // stale version AND illegal move → 409
    const res409 = await postCommand(
      app,
      gameId,
      moveEnv('empire', 5, [m.pieceId], m.from, m.nonAdjacent),
    );
    expectError(res409, 409, 'VERSION_CONFLICT');
    // stale version AND malformed command → 400
    const res400 = await postCommand(app, gameId, {
      actor: 'empire',
      expectedVersion: 5,
      command: { type: 'MOVE_PIECES', pieceIds: [] },
    });
    expectError(res400, 400, 'VALIDATION');
    // not-your-side with stale version → 409
    const res409b = await postCommand(app, gameId, advanceEnv('rebellion', 7));
    expectError(res409b, 409, 'VERSION_CONFLICT');
  });

  it('TC-API-22: ADVANCE_PHASE ×3 cycles phases and round; MOVE accepted in any phase', async () => {
    const seen: [number, string][] = [];
    let version = 1;
    for (let i = 0; i < 3; i++) {
      const res = await postCommand(app, gameId, advanceEnv('empire', version));
      expect(res.status).toBe(200);
      const body = CommandOkSchema.parse(res.body);
      version = body.view.version;
      seen.push([body.view.round, body.view.phase]);
      expect(body.events).toHaveLength(1);
      expect(body.events[0]?.type).toBe('PHASE_ADVANCED');
    }
    expect(seen).toEqual([
      [1, 'command'],
      [1, 'refresh'],
      [2, 'assignment'],
    ]);
    expect(version).toBe(4);

    // move in 'assignment' (round 2), then advance to 'command' and move back
    let res = await postCommand(app, gameId, moveEnv('empire', 4, [m.pieceId], m.from, m.adjacent));
    expect(res.status).toBe(200);
    res = await postCommand(app, gameId, advanceEnv('empire', 5));
    expect(res.body.view.phase).toBe('command');
    res = await postCommand(app, gameId, moveEnv('empire', 6, [m.pieceId], m.adjacent, m.from));
    expect(res.status).toBe(200);
    expect(res.body.view.version).toBe(7);
  });

  it('TC-API-26: Game.state.log equals GameEvent rows (A-15)', async () => {
    expect(
      (await postCommand(app, gameId, moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent)))
        .status,
    ).toBe(200);
    expect((await postCommand(app, gameId, advanceEnv('empire', 2))).status).toBe(200);
    expect((await postCommand(app, gameId, advanceEnv('empire', 3))).status).toBe(200);

    const prisma = prismaOf(app);
    const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    const state = GameStateSchema.parse(JSON.parse(row.state));
    const rows = await prisma.gameEvent.findMany({ where: { gameId }, orderBy: { seq: 'asc' } });

    expect(state.version).toBe(row.version);
    expect(state.log).toHaveLength(4);
    const fromRows = rows.map((e) =>
      GameEventSchema.parse({
        seq: e.seq,
        type: e.type,
        actor: e.actor,
        payload: JSON.parse(e.payload),
        at: e.createdAt.toISOString(),
      }),
    );
    expect(fromRows).toEqual(state.log);

    // @@unique([gameId, seq])
    await expect(
      prisma.gameEvent.create({
        data: { gameId, seq: 2, type: 'X', actor: 'system', payload: '{}' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
