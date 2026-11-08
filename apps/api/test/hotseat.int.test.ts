/**
 * SWR-004 hot-seat through the API (AC-14, TC-I-24..32, TC-M-04): after END_TURN the server sends only the
 * handoff view — no board data, journal or legal actions — until the new active side accepts.
 */
import type { INestApplication } from '@nestjs/common';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import { HandoffViewSchema, UNKNOWN_TYPE_KEY } from '@bga/game-rebellion/schema';
import { mockScenario } from '@bga/game-rebellion/scenario';
import { upcastState } from '@bga/game-rebellion/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEF,
  EMPIRE_AI,
  HIDDEN_REBEL,
  R,
  REBELS_HUMAN,
  REBEL_BASE_SYSTEM,
  acceptHandoffEnv,
  advanceEnv,
  createRebellionSession,
  dbSnapshot,
  endTurnEnv,
  expectError,
  movable,
  moveEnv,
  playerView,
  postCommand,
} from './support/fixtures';
import { prisma } from './support/pre-migration-db';
import { createSwr003Db, type Swr003Db } from './support/swr003-db';
import {
  api,
  createTestDb,
  removeTestDb,
  startApp,
  stopApp,
  type TestDb,
} from './support/test-app';

const HANDOFF_KEYS = ['activeSide', 'id', 'kind', 'phase', 'round', 'sessionStatus', 'version'];
/** Every system / piece id and typeKey of the scenario — none may appear in a handoff response. */
const BOARD_TOKENS = [
  ...mockScenario.systems.map((s) => s.id),
  ...mockScenario.pieces.flatMap((p) => [p.id, p.typeKey]),
];

function expectBareHandoff(res: { text: string }, view: unknown, activeSide: string) {
  const handoff = HandoffViewSchema.parse(view);
  expect(Object.keys(view as object).sort()).toEqual(HANDOFF_KEYS);
  expect(handoff).toMatchObject({ kind: 'handoff', activeSide, sessionStatus: 'prototype' });
  const leaked = BOARD_TOKENS.filter((token) => res.text.includes(`"${token}"`));
  expect(leaked).toEqual([]);
  expect(res.text).not.toMatch(
    /"systems"|"pieces"|"log"|"legalActions"|"rebelBase"|"setup"|"typeKey"/,
  );
  return handoff;
}

describe('hot-seat (human vs human on one device)', () => {
  let db: TestDb;
  let app: INestApplication;
  let sessionId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url);
    sessionId = (await createRebellionSession(app, REBELS_HUMAN)).sessionId;
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-I-25 / TC-I-26 / TC-I-27: END_TURN → bare handoff view (POST, GET, ?viewer=, list)', async () => {
    const res = await postCommand(app, sessionId, endTurnEnv('rebels', 1));
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    const handoff = expectBareHandoff(res, res.body.view, 'empire');
    expect(handoff).toMatchObject({ version: 2, round: 1, phase: 'assignment', id: sessionId });
    console.log(
      `[hotseat-leak] checked ${BOARD_TOKENS.length} scenario ids/typeKeys: none in the handoff body`,
    );

    for (const url of [
      `/api/sessions/${sessionId}`,
      `/api/sessions/${sessionId}?viewer=rebels`,
      `/api/sessions/${sessionId}?viewer=empire`,
    ]) {
      const got = await api(app).get(url);
      expect(got.status).toBe(200);
      const body = SessionResponseSchema.parse(got.body);
      expect(body.status).toBe('prototype');
      expect(body.settings).toMatchObject({ opponentType: 'human', aiDifficulty: null });
      expectBareHandoff(got, body.view, 'empire');
    }

    const list = await api(app).get(`/api/sessions?gameId=${R}`);
    const [summary] = ListSessionsResponseSchema.parse(list.body);
    expect(summary?.details).toMatchObject({
      round: 1,
      phase: 'assignment',
      playerFaction: 'rebels',
    });
    expect(BOARD_TOKENS.filter((t) => list.text.includes(`"${t}"`))).toEqual([]);
  });

  it('TC-I-28: during a handoff — other side → notYourTurn; active side non-ACCEPT → handoffPending; nothing changes', async () => {
    expect((await postCommand(app, sessionId, endTurnEnv('rebels', 1))).status).toBe(200);
    const before = await dbSnapshot(app, sessionId);
    const r = movable('rebels');
    const e = movable('empire');
    const cases: [unknown, string][] = [
      [acceptHandoffEnv('rebels', 2), 'errors.notYourTurn'],
      [moveEnv('rebels', 2, [r.pieceId], r.from, r.adjacent), 'errors.notYourTurn'],
      [moveEnv('empire', 2, [e.pieceId], e.from, e.adjacent), 'errors.handoffPending'],
      [advanceEnv('empire', 2), 'errors.handoffPending'],
      [endTurnEnv('empire', 2), 'errors.handoffPending'],
    ];
    for (const [env, key] of cases) {
      const res = await postCommand(app, sessionId, env);
      const err = expectError(res, 422, 'ILLEGAL_COMMAND', key);
      expect(JSON.stringify(err)).not.toMatch(/systemId|typeKey|rebelBase/);
    }
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  });

  it('TC-I-29: ACCEPT_HANDOFF by the Empire → Empire player view; base and hidden rebel types masked', async () => {
    expect((await postCommand(app, sessionId, endTurnEnv('rebels', 1))).status).toBe(200);
    const res = await postCommand(app, sessionId, acceptHandoffEnv('empire', 2));
    expect(res.status).toBe(200);
    const view = playerView(res.body.view);
    expect(view).toMatchObject({ viewer: 'empire', activeSide: 'empire', version: 3 });
    expect(view.rebelBase.systemId).toBeNull();
    expect(view.pieces.find((p) => p.id === HIDDEN_REBEL.id)?.typeKey).toBe(UNKNOWN_TYPE_KEY);
    expect(res.text).not.toContain(HIDDEN_REBEL.typeKey);
    expect(res.text).not.toContain(`"rebelBase":{"systemId":"${REBEL_BASE_SYSTEM}"`);
    for (const action of view.legalActions) {
      if (action.type === 'MOVE_PIECES') {
        expect(view.pieces.find((p) => p.id === action.pieceId)?.owner).toBe('empire');
      }
    }
    expect(view.legalActions.some((a) => a.type === 'END_TURN')).toBe(true);
    expect((await api(app).get(`/api/sessions/${sessionId}`)).body.view).toEqual(res.body.view);
  });

  it('TC-I-30: Empire active, no handoff — a Rebels command → 422 notYourTurn, state unchanged', async () => {
    await postCommand(app, sessionId, endTurnEnv('rebels', 1));
    await postCommand(app, sessionId, acceptHandoffEnv('empire', 2));
    const before = await dbSnapshot(app, sessionId);
    const r = movable('rebels');
    expectError(
      await postCommand(app, sessionId, moveEnv('rebels', 3, [r.pieceId], r.from, r.adjacent)),
      422,
      'ILLEGAL_COMMAND',
      'errors.notYourTurn',
    );
    expectError(
      await postCommand(app, sessionId, acceptHandoffEnv('empire', 3)),
      422,
      'ILLEGAL_COMMAND',
      'errors.handoffNotAvailable',
    );
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  });

  it('TC-I-32: two parallel ACCEPT_HANDOFF with one expectedVersion → exactly one 200 and one 409', async () => {
    await postCommand(app, sessionId, endTurnEnv('rebels', 1));
    const results = await Promise.all([
      postCommand(app, sessionId, acceptHandoffEnv('empire', 2)),
      postCommand(app, sessionId, acceptHandoffEnv('empire', 2)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const { session, events } = await dbSnapshot(app, sessionId);
    expect(session?.version).toBe(3);
    expect(events.map((e) => e.type)).toEqual(['GAME_CREATED', 'TURN_ENDED', 'HANDOFF_ACCEPTED']);
  });
});

describe('TC-I-31: END_TURN / ACCEPT_HANDOFF in an AI game → 422 handoffNotAvailable', () => {
  it('rejected, nothing changes; the AI side → notYourSide', async () => {
    const db = createTestDb();
    const app = await startApp(db.url);
    try {
      const { sessionId } = await createRebellionSession(app, EMPIRE_AI);
      const before = await dbSnapshot(app, sessionId);
      expectError(
        await postCommand(app, sessionId, endTurnEnv('empire', 1)),
        422,
        'ILLEGAL_COMMAND',
        'errors.handoffNotAvailable',
      );
      expectError(
        await postCommand(app, sessionId, acceptHandoffEnv('empire', 1)),
        422,
        'ILLEGAL_COMMAND',
        'errors.handoffNotAvailable',
      );
      expectError(
        await postCommand(app, sessionId, endTurnEnv('rebels', 1)),
        422,
        'ILLEGAL_COMMAND',
        'errors.notYourSide',
      );
      expect(await dbSnapshot(app, sessionId)).toEqual(before);
    } finally {
      await stopApp(app, db);
    }
  });
});

describe('TC-I-24: restart on the same DB file (AI game + human game in handoff + idempotent replay)', () => {
  it('app#2 returns identical settings/status/views; the list is the same; the key replays the same session', async () => {
    const db = createTestDb();
    try {
      const key = '7d0f6c2e-5f7a-4d55-9a53-0c8f3c6f9e11';
      const app1 = await startApp(db.url);
      const ai = await api(app1)
        .post('/api/sessions')
        .set('Idempotency-Key', key)
        .send({ gameId: R, setup: DEF });
      expect(ai.status).toBe(201);
      const m = movable('rebels');
      expect(
        (
          await postCommand(
            app1,
            ai.body.sessionId,
            moveEnv('rebels', 1, [m.pieceId], m.from, m.adjacent),
          )
        ).status,
      ).toBe(200);
      const human = await createRebellionSession(app1, REBELS_HUMAN);
      expect((await postCommand(app1, human.sessionId, endTurnEnv('rebels', 1))).status).toBe(200);
      const before = {
        ai: (await api(app1).get(`/api/sessions/${ai.body.sessionId}`)).body,
        human: (await api(app1).get(`/api/sessions/${human.sessionId}`)).body,
        list: (await api(app1).get('/api/sessions')).body,
      };
      expect(before.human.view.kind).toBe('handoff');
      await stopApp(app1);

      const app2 = await startApp(db.url);
      try {
        expect((await api(app2).get(`/api/sessions/${ai.body.sessionId}`)).body).toEqual(before.ai);
        expect((await api(app2).get(`/api/sessions/${human.sessionId}`)).body).toEqual(
          before.human,
        );
        expect((await api(app2).get('/api/sessions')).body).toEqual(before.list);
        const replay = await api(app2)
          .post('/api/sessions')
          .set('Idempotency-Key', key)
          .send({ gameId: R, setup: DEF });
        expect(replay.status).toBe(200);
        expect(replay.body).toEqual(before.ai);
        // hot-seat continues after the restart
        expect(
          (await postCommand(app2, human.sessionId, acceptHandoffEnv('empire', 2))).status,
        ).toBe(200);
      } finally {
        await stopApp(app2);
      }
    } finally {
      removeTestDb(db);
    }
  });
});

describe(
  'TC-M-04: a migrated SWR-003 human game supports hot-seat (Q-17)',
  { timeout: 60_000 },
  () => {
    let swr: Swr003Db | undefined;
    afterEach(() => swr?.remove());

    it('END_TURN → handoff → ACCEPT_HANDOFF on an upcast v1 row', async () => {
      swr = await createSwr003Db({ rows: 3 });
      prisma(swr.url, ['migrate', 'deploy']);
      const row = swr.sessions.find(
        (s) => upcastState(JSON.parse(s.state)).settings.opponentType === 'human',
      );
      expect(row).toBeDefined();
      const state = upcastState(JSON.parse(row!.state));
      expect(state.activeSide).toBe(state.settings.playerFaction);
      const side = state.activeSide;
      const other = state.settings.opponentFaction;
      const app = await startApp(swr.url);
      try {
        const ended = await postCommand(app, row!.id, endTurnEnv(side, row!.version));
        expect(ended.status).toBe(200);
        expectBareHandoff(ended, ended.body.view, other);
        const accepted = await postCommand(app, row!.id, acceptHandoffEnv(other, row!.version + 1));
        expect(accepted.status).toBe(200);
        expect(playerView(accepted.body.view).viewer).toBe(other);
      } finally {
        await stopApp(app);
      }
    });
  },
);
