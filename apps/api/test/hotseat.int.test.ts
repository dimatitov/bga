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
  HIDDEN_REBEL,
  R,
  REBEL_BASE_SYSTEM,
  SEEDED,
  acceptHandoffEnv,
  advanceEnv,
  createSeededDb,
  dbSnapshot,
  endTurnEnv,
  expectError,
  movableIn,
  moveEnv,
  playerView,
  postCommand,
} from './support/fixtures';
import { prisma } from './support/pre-migration-db';
import { createSwr003Db, type Swr003Db } from './support/swr003-db';
import { api, removeTestDb, startApp, stopApp, type TestDb } from './support/test-app';

const HANDOFF_KEYS = [
  'activeSide',
  'id',
  'kind',
  'phase',
  'round',
  'rulesEngine',
  'sessionStatus',
  'version',
];
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

/**
 * SWR-005 W6a (Q-1): the mock-v1 hot-seat flow runs on the seeded SWR-004 row `hotseat` (Rebels vs human,
 * v3, already in a handoff to the Empire after the Rebels' END_TURN) and the AI row `empireAi`; core-v1
 * hot-seat is covered by W6b (TC-HS-*).
 */
const HS = SEEDED.hotseat;
const HS_V = HS.version;

describe('hot-seat (human vs human on one device, seeded mock-v1 row)', () => {
  let db: TestDb;
  let app: INestApplication;
  const sessionId = HS.id;

  beforeEach(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-I-25 / TC-I-26 / TC-I-27: END_TURN → bare handoff view (POST, GET, ?viewer=, list)', async () => {
    // The seeded row is stored in a handoff to the Empire: GET shows only the handoff screen (TC-M-08).
    const seeded = await api(app).get(`/api/sessions/${sessionId}`);
    expect(seeded.status).toBe(200);
    expect(
      expectBareHandoff(seeded, SessionResponseSchema.parse(seeded.body).view, 'empire'),
    ).toMatchObject({ version: HS_V, id: sessionId });

    // The Empire takes the seat and ends its turn → the next handoff (to the Rebels).
    expect((await postCommand(app, sessionId, acceptHandoffEnv('empire', HS_V))).status).toBe(200);
    const res = await postCommand(app, sessionId, endTurnEnv('empire', HS_V + 1));
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    const handoff = expectBareHandoff(res, res.body.view, 'rebels');
    expect(handoff).toMatchObject({
      version: HS_V + 2,
      round: 1,
      phase: 'assignment',
      id: sessionId,
      rulesEngine: 'mock-v1',
    });
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
      expectBareHandoff(got, body.view, 'rebels');
    }

    const list = await api(app).get(`/api/sessions?gameId=${R}`);
    const summary = ListSessionsResponseSchema.parse(list.body).find(
      (s) => s.sessionId === sessionId,
    );
    expect(summary?.details).toMatchObject({
      round: 1,
      phase: 'assignment',
      playerFaction: 'rebels',
    });
    expect(BOARD_TOKENS.filter((t) => list.text.includes(`"${t}"`))).toEqual([]);
  });

  it('TC-I-28: during a handoff — other side → notYourTurn; active side non-ACCEPT → handoffPending; nothing changes', async () => {
    const before = await dbSnapshot(app, sessionId);
    const r = movableIn(HS, 'rebels');
    const e = movableIn(HS, 'empire');
    const cases: [unknown, string][] = [
      [acceptHandoffEnv('rebels', HS_V), 'errors.notYourTurn'],
      [moveEnv('rebels', HS_V, [r.pieceId], r.from, r.adjacent), 'errors.notYourTurn'],
      [moveEnv('empire', HS_V, [e.pieceId], e.from, e.adjacent), 'errors.handoffPending'],
      [advanceEnv('empire', HS_V), 'errors.handoffPending'],
      [endTurnEnv('empire', HS_V), 'errors.handoffPending'],
    ];
    for (const [env, key] of cases) {
      const res = await postCommand(app, sessionId, env);
      const err = expectError(res, 422, 'ILLEGAL_COMMAND', key);
      expect(JSON.stringify(err)).not.toMatch(/systemId|typeKey|rebelBase/);
    }
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  });

  it('TC-I-29: ACCEPT_HANDOFF by the Empire → Empire player view; base and hidden rebel types masked', async () => {
    const res = await postCommand(app, sessionId, acceptHandoffEnv('empire', HS_V));
    expect(res.status).toBe(200);
    const view = playerView(res.body.view);
    expect(view).toMatchObject({ viewer: 'empire', activeSide: 'empire', version: HS_V + 1 });
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
    expect((await postCommand(app, sessionId, acceptHandoffEnv('empire', HS_V))).status).toBe(200);
    const before = await dbSnapshot(app, sessionId);
    const r = movableIn(HS, 'rebels');
    expectError(
      await postCommand(
        app,
        sessionId,
        moveEnv('rebels', HS_V + 1, [r.pieceId], r.from, r.adjacent),
      ),
      422,
      'ILLEGAL_COMMAND',
      'errors.notYourTurn',
    );
    expectError(
      await postCommand(app, sessionId, acceptHandoffEnv('empire', HS_V + 1)),
      422,
      'ILLEGAL_COMMAND',
      'errors.handoffNotAvailable',
    );
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
  });

  it('TC-I-32: two parallel ACCEPT_HANDOFF with one expectedVersion → exactly one 200 and one 409', async () => {
    const results = await Promise.all([
      postCommand(app, sessionId, acceptHandoffEnv('empire', HS_V)),
      postCommand(app, sessionId, acceptHandoffEnv('empire', HS_V)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const { session, events } = await dbSnapshot(app, sessionId);
    expect(session?.version).toBe(HS_V + 1);
    expect(events.map((e) => e.type)).toEqual([
      ...HS.events.map((e) => e.type),
      'HANDOFF_ACCEPTED',
    ]);
    expect(events.map((e) => e.type).slice(-2)).toEqual(['TURN_ENDED', 'HANDOFF_ACCEPTED']);
  });
});

describe('TC-I-31: END_TURN / ACCEPT_HANDOFF in an AI game → 422 handoffNotAvailable (seeded mock-v1 row)', () => {
  it('rejected, nothing changes; the AI side → notYourSide', async () => {
    const db = await createSeededDb();
    const app = await startApp(db.url);
    try {
      const { id: sessionId, version } = SEEDED.empireAi;
      const before = await dbSnapshot(app, sessionId);
      expectError(
        await postCommand(app, sessionId, endTurnEnv('empire', version)),
        422,
        'ILLEGAL_COMMAND',
        'errors.handoffNotAvailable',
      );
      expectError(
        await postCommand(app, sessionId, acceptHandoffEnv('empire', version)),
        422,
        'ILLEGAL_COMMAND',
        'errors.handoffNotAvailable',
      );
      expectError(
        await postCommand(app, sessionId, endTurnEnv('rebels', version)),
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
    // Seeded DB: the mock-v1 moves run on seeded rows; the POST part is engine-independent.
    const db = await createSeededDb();
    try {
      const key = '7d0f6c2e-5f7a-4d55-9a53-0c8f3c6f9e11';
      const app1 = await startApp(db.url);
      const created = await api(app1)
        .post('/api/sessions')
        .set('Idempotency-Key', key)
        .send({ gameId: R, setup: DEF });
      expect(created.status).toBe(201);
      const ai = SEEDED.rebelsAi;
      const m = movableIn(ai, 'rebels');
      expect(
        (
          await postCommand(
            app1,
            ai.id,
            moveEnv('rebels', ai.version, [m.pieceId], m.from, m.adjacent),
          )
        ).status,
      ).toBe(200);
      const human = HS.id;
      expect((await postCommand(app1, human, acceptHandoffEnv('empire', HS_V))).status).toBe(200);
      expect((await postCommand(app1, human, endTurnEnv('empire', HS_V + 1))).status).toBe(200);
      const before = {
        created: (await api(app1).get(`/api/sessions/${created.body.sessionId}`)).body,
        ai: (await api(app1).get(`/api/sessions/${ai.id}`)).body,
        human: (await api(app1).get(`/api/sessions/${human}`)).body,
        list: (await api(app1).get('/api/sessions')).body,
      };
      expect(before.created).toEqual(created.body);
      expect(before.human.view.kind).toBe('handoff');
      await stopApp(app1);

      const app2 = await startApp(db.url);
      try {
        expect((await api(app2).get(`/api/sessions/${created.body.sessionId}`)).body).toEqual(
          before.created,
        );
        expect((await api(app2).get(`/api/sessions/${ai.id}`)).body).toEqual(before.ai);
        expect((await api(app2).get(`/api/sessions/${human}`)).body).toEqual(before.human);
        expect((await api(app2).get('/api/sessions')).body).toEqual(before.list);
        const replay = await api(app2)
          .post('/api/sessions')
          .set('Idempotency-Key', key)
          .send({ gameId: R, setup: DEF });
        expect(replay.status).toBe(200);
        expect(replay.body).toEqual(before.created);
        // hot-seat continues after the restart
        expect((await postCommand(app2, human, acceptHandoffEnv('rebels', HS_V + 2))).status).toBe(
          200,
        );
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
