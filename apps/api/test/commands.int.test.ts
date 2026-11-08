import type { INestApplication } from '@nestjs/common';
import { SessionCommandOkSchema } from '@bga/platform';
import { CommandOkSchema, GameEventSchema, GameStateSchema } from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SEEDED,
  advanceEnv,
  createSeededDb,
  dbSnapshot,
  expectError,
  movableIn,
  moveEnv,
  pieceIn,
  playerView,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, startApp, stopApp, type TestDb } from './support/test-app';

/**
 * SWR-005 W6a (Q-1): mock-v1 command behaviour is checked on the seeded SWR-004 row `empireAi`
 * (Empire vs AI/hard, v2, round 1 `assignment`, Empire active) — not on a session created through POST,
 * whose rules engine changes in SWR-005 W5. Versions are relative to the seeded version `V0`.
 */
const ROW = SEEDED.empireAi;
const V0 = ROW.version;

describe('POST /api/sessions/:sessionId/commands (TC-SES-12, seeded mock-v1 row)', () => {
  let db: TestDb;
  let app: INestApplication;
  const sessionId = ROW.id;
  const m = movableIn(ROW, 'empire');
  const r = movableIn(ROW, 'rebels');

  beforeEach(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  async function expectUnchanged(before: Awaited<ReturnType<typeof dbSnapshot>>) {
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  }

  it('TC-API-14: legal move → 200, version + 1, piece moved, PIECES_MOVED persisted', async () => {
    const res = await postCommand(
      app,
      sessionId,
      moveEnv('empire', V0, [m.pieceId], m.from, m.adjacent),
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['events', 'ok', 'view']); // Q-6: no gameId
    SessionCommandOkSchema.parse(res.body);
    const body = CommandOkSchema.parse(res.body);
    expect(body.view.version).toBe(V0 + 1);
    expect(pieceIn(playerView(body.view), m.pieceId)?.systemId).toBe(m.adjacent);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ seq: V0 + 1, type: 'PIECES_MOVED', actor: 'empire' });

    const { session, events } = await dbSnapshot(app, sessionId);
    expect(session?.version).toBe(V0 + 1);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: V0 + 1 }, (_, i) => i + 1));
    expect(events.at(-1)).toMatchObject({ type: 'PIECES_MOVED', actor: 'empire' });

    const got = await api(app).get(`/api/sessions/${sessionId}`);
    expect(got.body.view).toEqual(body.view);
  });

  it('TC-API-15: non-adjacent target → 422 errors.notAdjacent, nothing changes', async () => {
    const before = await dbSnapshot(app, sessionId);
    const res = await postCommand(
      app,
      sessionId,
      moveEnv('empire', V0, [m.pieceId], m.from, m.nonAdjacent),
    );
    expectError(res, 422, 'ILLEGAL_COMMAND', 'errors.notAdjacent');
    await expectUnchanged(before);
    const got = await api(app).get(`/api/sessions/${sessionId}`);
    expect(got.body.view.version).toBe(V0);
    expect(pieceIn(got.body.view, m.pieceId)?.systemId).toBe(m.from);
  });

  it.each([0, V0 - 1, V0 + 1])(
    `TC-API-16: expectedVersion %i ≠ ${V0} → 409 with currentVersion, nothing changes`,
    async (expectedVersion) => {
      const before = await dbSnapshot(app, sessionId);
      const res = await postCommand(
        app,
        sessionId,
        moveEnv('empire', expectedVersion, [m.pieceId], m.from, m.adjacent),
      );
      if (expectedVersion === 0) {
        // 0 is not a valid version at all (positive int) → schema error first (A-5: 400 before 409).
        expectError(res, 400, 'VALIDATION');
      } else {
        const err = expectError(res, 409, 'VERSION_CONFLICT', 'errors.versionConflict');
        expect(err.error.details).toEqual({ currentVersion: V0 });
      }
      await expectUnchanged(before);
    },
  );

  it('TC-API-16: stale version after a successful move → 409 currentVersion = V0 + 1', async () => {
    expect(
      (await postCommand(app, sessionId, moveEnv('empire', V0, [m.pieceId], m.from, m.adjacent)))
        .status,
    ).toBe(200);
    const before = await dbSnapshot(app, sessionId);
    const res = await postCommand(app, sessionId, advanceEnv('empire', V0));
    const err = expectError(res, 409, 'VERSION_CONFLICT');
    expect(err.error.details).toEqual({ currentVersion: V0 + 1 });
    await expectUnchanged(before);
  });

  describe('TC-API-17: malformed envelope → 400 VALIDATION, nothing changes', () => {
    const valid = () => moveEnv('empire', V0, [m.pieceId], m.from, m.adjacent);
    const cases: [string, () => unknown][] = [
      ['no command', () => ({ actor: 'empire', expectedVersion: V0 })],
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
      ['expectedVersion as string', () => ({ ...valid(), expectedVersion: String(V0) })],
      ['unknown actor', () => ({ ...valid(), actor: 'jedi' })],
      ['extra key', () => ({ ...valid(), extra: 1 })],
      ['empty body', () => ({})],
    ];
    it.each(cases)('%s', async (_name, body) => {
      const before = await dbSnapshot(app, sessionId);
      const res = await postCommand(app, sessionId, body());
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      await expectUnchanged(before);
    });

    it('malformed JSON', async () => {
      const before = await dbSnapshot(app, sessionId);
      const res = await api(app)
        .post(`/api/sessions/${sessionId}/commands`)
        .set('Content-Type', 'application/json')
        .send('{"actor":');
      expectError(res, 400, 'VALIDATION', 'errors.validation');
      expect(res.text).not.toMatch(/Unexpected|JSON at position|SyntaxError/);
      await expectUnchanged(before);
    });
  });

  it('TC-API-18: unknown session → 404 sessionNotFound for valid and schema-invalid bodies (404 first, A-5)', async () => {
    const ok = await postCommand(
      app,
      'unknown',
      moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent),
    );
    expectError(ok, 404, 'NOT_FOUND', 'errors.sessionNotFound');
    const bad = await postCommand(app, 'unknown', { nonsense: true });
    expectError(bad, 404, 'NOT_FOUND', 'errors.sessionNotFound');
    const long = await postCommand(app, 'x'.repeat(65), { nonsense: true });
    expectError(long, 404, 'NOT_FOUND', 'errors.sessionNotFound');
  });

  describe('TC-API-19: semantic rejections → 422 with messageKey, nothing changes', () => {
    const cases: [string, () => unknown, string][] = [
      [
        'enemy piece',
        () => moveEnv('empire', V0, [r.pieceId], r.from, r.adjacent),
        'errors.notOwner',
      ],
      [
        'unknown piece',
        () => moveEnv('empire', V0, ['no-such-piece'], m.from, m.adjacent),
        'errors.unknownPiece',
      ],
      ['from = to', () => moveEnv('empire', V0, [m.pieceId], m.from, m.from), 'errors.sameSystem'],
      ['not your side', () => advanceEnv('rebels', V0), 'errors.notYourSide'],
      [
        'unknown system',
        () => moveEnv('empire', V0, [m.pieceId], m.from, 'sys-nowhere'),
        'errors.unknownSystem',
      ],
      [
        'piece not in fromSystem',
        () => moveEnv('empire', V0, [m.pieceId], m.adjacent, m.from),
        'errors.notInFromSystem',
      ],
    ];
    it.each(cases)('%s', async (_name, body, messageKey) => {
      const before = await dbSnapshot(app, sessionId);
      const res = await postCommand(app, sessionId, body());
      expectError(res, 422, 'ILLEGAL_COMMAND', messageKey);
      await expectUnchanged(before);
    });
  });

  it('A-5 order: 409 wins over 422; 400 wins over 409', async () => {
    // stale version AND illegal move → 409
    const res409 = await postCommand(
      app,
      sessionId,
      moveEnv('empire', 5, [m.pieceId], m.from, m.nonAdjacent),
    );
    expectError(res409, 409, 'VERSION_CONFLICT');
    // stale version AND malformed command → 400
    const res400 = await postCommand(app, sessionId, {
      actor: 'empire',
      expectedVersion: 5,
      command: { type: 'MOVE_PIECES', pieceIds: [] },
    });
    expectError(res400, 400, 'VALIDATION');
    // not-your-side with stale version → 409
    const res409b = await postCommand(app, sessionId, advanceEnv('rebels', 7));
    expectError(res409b, 409, 'VERSION_CONFLICT');
  });

  it('TC-API-22: ADVANCE_PHASE ×3 cycles phases and round; MOVE accepted in any phase', async () => {
    const seen: [number, string][] = [];
    let version = V0;
    for (let i = 0; i < 3; i++) {
      const res = await postCommand(app, sessionId, advanceEnv('empire', version));
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
    expect(version).toBe(V0 + 3);

    // move in 'assignment' (round 2), then advance to 'command' and move back
    let res = await postCommand(
      app,
      sessionId,
      moveEnv('empire', V0 + 3, [m.pieceId], m.from, m.adjacent),
    );
    expect(res.status).toBe(200);
    res = await postCommand(app, sessionId, advanceEnv('empire', V0 + 4));
    expect(res.body.view.phase).toBe('command');
    res = await postCommand(
      app,
      sessionId,
      moveEnv('empire', V0 + 5, [m.pieceId], m.adjacent, m.from),
    );
    expect(res.status).toBe(200);
    expect(res.body.view.version).toBe(V0 + 6);
  });

  it('TC-API-26: Session.state.log equals SessionEvent rows (A-15)', async () => {
    expect(
      (await postCommand(app, sessionId, moveEnv('empire', V0, [m.pieceId], m.from, m.adjacent)))
        .status,
    ).toBe(200);
    expect((await postCommand(app, sessionId, advanceEnv('empire', V0 + 1))).status).toBe(200);
    expect((await postCommand(app, sessionId, advanceEnv('empire', V0 + 2))).status).toBe(200);

    const prisma = prismaOf(app);
    const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    const state = GameStateSchema.parse(JSON.parse(row.state));
    const rows = await prisma.sessionEvent.findMany({
      where: { sessionId },
      orderBy: { seq: 'asc' },
    });

    expect(state.version).toBe(row.version);
    expect(state.log).toHaveLength(V0 + 3);
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

    // @@unique([sessionId, seq])
    await expect(
      prisma.sessionEvent.create({
        data: { sessionId, seq: 2, type: 'X', actor: 'system', payload: '{}' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
