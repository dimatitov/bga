/**
 * SWR-004 Session API with the real Rebellion module (TC-I-01..14, TC-I-35, TC-I-38 + Rebellion idempotency).
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  IDEMPOTENCY_KEY_HEADER,
  ListSessionsResponseSchema,
  SessionResponseSchema,
} from '@bga/platform';
import {
  GameStateSchema,
  PlayerViewPlayerSchema,
  RebellionSessionDetailsSchema,
  StoredRebellionSetupSchema,
  opponentOf,
} from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEF,
  EMPIRE_AI,
  FS,
  R,
  REBELS_HUMAN,
  SEEDED,
  acceptHandoffEnv,
  advanceEnv,
  createSeededDb,
  endTurnEnv,
  expectError,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

const SETTINGS_KEYS = [
  'aiDifficulty',
  'gameMode',
  'opponentFaction',
  'opponentType',
  'playerFaction',
  'ruleset',
];

function post(app: INestApplication, setup: unknown, key?: string, gameId: string = R) {
  const req = api(app).post('/api/sessions');
  if (key !== undefined) req.set(IDEMPOTENCY_KEY_HEADER, key);
  return req.send({ gameId, setup });
}

/** Keys that must never appear in a public response (state internals, stored setup, idempotency, AI profile). */
const FORBIDDEN_KEYS = [
  'state',
  'setup',
  'schemaVersion',
  'handoffPending',
  'idempotencyKey',
  'idempotencyHash',
  'aiFaction',
  'candidateActionLimit',
  'goalWeights',
  'exploration',
];

function forbiddenKeysIn(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenKeysIn(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(FORBIDDEN_KEYS.includes(k) ? [`${path}.${k}`] : []),
      ...forbiddenKeysIn(v, `${path}.${k}`),
    ]);
  }
  return [];
}

describe('Session API × Rebellion (SWR-004 contract)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  async function count() {
    return prismaOf(app).session.count();
  }

  it('TC-I-01: defaults → 201 {sessionId, gameId, status, settings, view}; row status/key/v2 state; GAME_CREATED', async () => {
    const key = randomUUID();
    const res = await post(app, DEF, key);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'gameId',
      'sessionId',
      'settings',
      'status',
      'view',
    ]);
    const body = SessionResponseSchema.parse(res.body);
    expect(body.status).toBe('prototype');
    expect(body.settings).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      ruleset: 'base',
      gameMode: 'digital',
    });
    // SWR-005 W6a: engine-independent — the board of the player's side (either rules engine).
    const view = PlayerViewPlayerSchema.parse(body.view);
    expect(view).toMatchObject({ kind: 'player', viewer: 'rebels', activeSide: 'rebels' });

    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: body.sessionId } });
    expect(row).toMatchObject({ status: 'prototype', idempotencyKey: key });
    expect(row.idempotencyHash).toMatch(/^[0-9a-f]{64}$/);
    // v3 snapshot; which engine a new session gets changes in SWR-005 W5 (mock-v1 rows: upcast-v2.int).
    expect(GameStateSchema.parse(JSON.parse(row.state)).schemaVersion).toBe(3);
    expect(StoredRebellionSetupSchema.parse(JSON.parse(row.setup))).toEqual({
      schemaVersion: 2,
      ...body.settings,
    });
    const events = await prismaOf(app).sessionEvent.findMany({
      where: { sessionId: body.sessionId },
      orderBy: { seq: 'asc' },
    });
    // SWR-005 W6b (W5 accepted): a new core-v1 game logs creation + the empty assignment phase + the command
    // phase (D-2) at version 1 — several events per version; rows are consecutive from seq 1.
    expect(events.map((e) => [e.seq, e.type, e.actor])).toEqual([
      [1, 'GAME_CREATED', 'system'],
      [2, 'PHASE_STARTED', 'system'],
      [3, 'PHASE_STARTED', 'system'],
    ]);
    expect(events.map((e) => JSON.parse(e.payload))).toEqual([
      { scenarioId: 'rebellion-base-v1' },
      { round: 1, phase: 'assignment' },
      { round: 1, phase: 'command' },
    ]);
    expect(row.version).toBe(1); // Rebels vs AI: the Rebels start, no automatic move at creation
  });

  it('TC-I-02 / TC-I-05 / TC-I-06: opponentFaction = opponentOf(playerFaction) in POST, GET and list details', async () => {
    for (const playerFaction of ['rebels', 'empire'] as const) {
      const res = await post(app, { ...DEF, playerFaction });
      expect(res.status).toBe(201);
      expect(res.body.settings.opponentFaction).toBe(opponentOf(playerFaction));
      const got = await api(app).get(`/api/sessions/${res.body.sessionId}`);
      expect(got.body).toEqual(res.body);
    }
    const list = await api(app).get(`/api/sessions?gameId=${R}`);
    const summaries = ListSessionsResponseSchema.parse(list.body);
    expect(summaries).toHaveLength(2);
    for (const s of summaries) {
      expect(s.status).toBe('prototype');
      const details = RebellionSessionDetailsSchema.parse(s.details);
      expect(details.opponentFaction).toBe(opponentOf(details.playerFaction));
      expect(Object.keys(s.details).sort()).toEqual(
        [...SETTINGS_KEYS, 'phase', 'round', 'rulesEngine', 'winner', 'reputation'].sort(),
      );
    }
    expect(list.text).not.toMatch(/"view"|"state"|"setup"|"idempotency/);
  });

  it('TC-I-03: human opponent — aiDifficulty omitted or null → stored and returned as null', async () => {
    for (const setup of [
      REBELS_HUMAN,
      { ...REBELS_HUMAN, playerFaction: 'empire', aiDifficulty: null },
    ]) {
      const res = await post(app, setup);
      expect(res.status).toBe(201);
      expect(res.body.settings).toMatchObject({ opponentType: 'human', aiDifficulty: null });
      expect(Object.keys(res.body.settings).sort()).toEqual(SETTINGS_KEYS);
      const row = await prismaOf(app).session.findUniqueOrThrow({
        where: { id: res.body.sessionId },
      });
      expect(JSON.parse(row.setup).aiDifficulty).toBeNull();
    }
  });

  describe('TC-I-07 / TC-I-08 / TC-I-09 / TC-I-10: invalid setup → 400 VALIDATION under setup.*, nothing stored', () => {
    const { ruleset: _r, ...noRuleset } = DEF;
    const { gameMode: _g, ...noMode } = DEF;
    const { playerFaction: _p, ...noFaction } = DEF;
    const cases: [string, unknown, (string | number)[] | null][] = [
      ['legacy faction', { ...DEF, playerFaction: 'rebellion' }, ['setup', 'playerFaction']],
      ['unknown faction', { ...DEF, playerFaction: 'sith' }, ['setup', 'playerFaction']],
      ['unknown opponentType', { ...DEF, opponentType: 'robot' }, ['setup', 'opponentType']],
      ['unknown difficulty', { ...DEF, aiDifficulty: 'insane' }, ['setup', 'aiDifficulty']],
      ['unknown ruleset', { ...DEF, ruleset: 'expansion' }, ['setup', 'ruleset']],
      ['unknown mode', { ...DEF, gameMode: 'vr' }, ['setup', 'gameMode']],
      ['aiFaction', { ...DEF, aiFaction: 'empire' }, null],
      ['opponentFaction', { ...DEF, opponentFaction: 'empire' }, null],
      ['legacy humanFaction', { ...DEF, humanFaction: 'rebels' }, null],
      ['legacy opponent', { ...DEF, opponent: { kind: 'ai' } }, null],
      [
        'human + difficulty (TC-I-09)',
        { ...REBELS_HUMAN, aiDifficulty: 'hard' },
        ['setup', 'aiDifficulty'],
      ],
      ['ai + null difficulty (Q-6)', { ...DEF, aiDifficulty: null }, ['setup', 'aiDifficulty']],
      ['no ruleset (Q-7)', noRuleset, ['setup', 'ruleset']],
      ['no gameMode (Q-7)', noMode, ['setup', 'gameMode']],
      ['no playerFaction', noFaction, ['setup', 'playerFaction']],
    ];
    it.each(cases)('%s', async (_name, setup, path) => {
      const err = expectError(
        await post(app, setup, randomUUID()),
        400,
        'VALIDATION',
        'errors.validation',
      );
      const issues = (err.error.details as { issues: { path: (string | number)[] }[] }).issues;
      for (const issue of issues) expect(issue.path[0]).toBe('setup');
      if (path) expect(issues.map((i) => i.path)).toContainEqual(path);
      expect(await count()).toBe(0);
    });

    it('extra top-level field (aiFaction) → 400 from the body schema', async () => {
      const res = await api(app)
        .post('/api/sessions')
        .send({ gameId: R, setup: DEF, aiFaction: 'empire' });
      expectError(res, 400, 'VALIDATION');
      expect(await count()).toBe(0);
    });
  });

  it('TC-I-11 / TC-I-12 / TC-I-13: unsupported ruleset / mode → 422 SETUP_UNSUPPORTED; schema errors first', async () => {
    const rote = expectError(
      await post(app, { ...DEF, ruleset: 'rise-of-the-empire' }),
      422,
      'SETUP_UNSUPPORTED',
      'errors.rulesetUnavailable',
    );
    expect(rote.error.details).toEqual({ unsupported: ['ruleset'] });
    const physical = expectError(
      await post(app, { ...DEF, gameMode: 'physical_companion' }),
      422,
      'SETUP_UNSUPPORTED',
      'errors.modeUnavailable',
    );
    expect(physical.error.details).toEqual({ unsupported: ['gameMode'] });
    const both = expectError(
      await post(app, { ...DEF, ruleset: 'rise-of-the-empire', gameMode: 'physical_companion' }),
      422,
      'SETUP_UNSUPPORTED',
      'errors.rulesetUnavailable',
    );
    expect(both.error.details).toEqual({ unsupported: ['ruleset', 'gameMode'] });
    // schema (400) beats support (422)
    expectError(
      await post(app, { ...DEF, ruleset: 'rise-of-the-empire', aiFaction: 'empire' }),
      400,
      'VALIDATION',
    );
    expectError(
      await post(app, { ...REBELS_HUMAN, ruleset: 'rise-of-the-empire', aiDifficulty: 'easy' }),
      400,
      'VALIDATION',
    );
    expect(await count()).toBe(0);
  });

  it('TC-I-14: order 400 body → 404 → 422 GAME_UNAVAILABLE → idempotency → 400 setup → 422 SETUP_UNSUPPORTED', async () => {
    const key = randomUUID();
    expect((await post(app, DEF, key)).status).toBe(201);
    expectError(
      await api(app).post('/api/sessions').set(IDEMPOTENCY_KEY_HEADER, key).send({ gameId: R }),
      400,
      'VALIDATION',
    );
    expectError(
      await post(app, { nonsense: true }, key, 'unknown-game'),
      404,
      'NOT_FOUND',
      'errors.gameNotFound',
    );
    expectError(await post(app, { nonsense: true }, key, FS), 422, 'GAME_UNAVAILABLE');
    expectError(await post(app, { nonsense: true }, key), 409, 'IDEMPOTENCY_KEY_REUSED');
    expectError(
      await post(app, { ...DEF, ruleset: 'rise-of-the-empire' }, key),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
    expect(await count()).toBe(1);
  });

  it('Rebellion idempotency: replay 200 + header; another faction → 409; key not burnt by 400/422 (TC-I-15/16/22/23)', async () => {
    const key = randomUUID();
    const first = await post(app, DEF, key);
    expect(first.status).toBe(201);
    const replay = await post(app, DEF, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expectError(
      await post(app, { ...DEF, playerFaction: 'empire' }, key),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
    // TC-I-17: aiDifficulty omitted ≠ 'normal' (AM-BE-7)
    const { aiDifficulty: _d, ...omitted } = DEF;
    expectError(await post(app, omitted, key), 409, 'IDEMPOTENCY_KEY_REUSED');

    const k2 = randomUUID();
    expectError(await post(app, { ...DEF, playerFaction: 'sith' }, k2), 400, 'VALIDATION');
    expectError(
      await post(app, { ...DEF, ruleset: 'rise-of-the-empire' }, k2),
      422,
      'SETUP_UNSUPPORTED',
    );
    expect((await post(app, DEF, k2)).status).toBe(201);
    expect(await count()).toBe(2);
  });

  it('TC-I-20 (Rebellion): 10 parallel identical POSTs → one session, never 500', async () => {
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 10 }, () => post(app, DEF, key)));
    expect(responses.map((r) => r.status).sort()).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 200, 201,
    ]);
    expect(new Set(responses.map((r) => r.body.sessionId)).size).toBe(1);
    expect(await count()).toBe(1);
  });

  it('TC-I-38 (creation): status is prototype in the POST / GET / list responses and in the row', async () => {
    const created = await post(app, EMPIRE_AI);
    expect(created.status).toBe(201);
    const { sessionId } = created.body as { sessionId: string };
    expect(created.body.status).toBe('prototype');
    expect((await api(app).get(`/api/sessions/${sessionId}`)).body.status).toBe('prototype');
    expect((await api(app).get('/api/sessions')).body[0].status).toBe('prototype');
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.status).toBe('prototype');
  });

  it('TC-I-35 (creation): no forbidden field in POST / replay / 409 / GET / list / setup errors', async () => {
    const key = randomUUID();
    const responses = [
      await post(app, DEF, key),
      await post(app, DEF, key),
      await post(app, EMPIRE_AI, key),
    ];
    const human = await post(app, REBELS_HUMAN);
    responses.push(human);
    const id = human.body.sessionId as string;
    responses.push(await api(app).get(`/api/sessions/${id}`));
    responses.push(await api(app).get(`/api/sessions/${id}?viewer=rebels`));
    responses.push(await api(app).get('/api/sessions'));
    responses.push(await post(app, { ...DEF, aiFaction: 'empire' }));
    responses.push(await post(app, { ...DEF, gameMode: 'physical_companion' }));
    for (const res of responses) {
      expect(forbiddenKeysIn(res.body), res.text).toEqual([]);
      expect(res.text).not.toContain(key);
    }
  });
});

/** SWR-005 W6a (Q-1): mock-v1 commands on the seeded SWR-004 rows (frozen v2 snapshot). */
describe('Session API × Rebellion — commands on seeded mock-v1 rows', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-I-38 / TC-M-14: status is prototype in every response and does not change after commands (Q-9)', async () => {
    const { id: sessionId, version } = SEEDED.empireAi;
    const res = await postCommand(app, sessionId, advanceEnv('empire', version));
    expect(res.status).toBe(200);
    expect((await api(app).get(`/api/sessions/${sessionId}`)).body.status).toBe('prototype');
    const list = await api(app).get('/api/sessions');
    expect(list.body[0]).toMatchObject({ sessionId, status: 'prototype' });
    for (const s of list.body as { status: string }[]) expect(s.status).toBe('prototype');
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.status).toBe('prototype');
  });

  it('TC-I-35 (commands): no forbidden field in command responses incl. errors and handoff', async () => {
    const key = randomUUID();
    const { id, version: v } = SEEDED.hotseat; // stored in a handoff to the Empire
    const responses = [await post(app, DEF, key)];
    responses.push(await postCommand(app, id, advanceEnv('rebels', v))); // 422 notYourTurn
    responses.push(await postCommand(app, id, advanceEnv('empire', v))); // 422 handoffPending
    responses.push(await postCommand(app, id, acceptHandoffEnv('empire', v)));
    responses.push(await postCommand(app, id, advanceEnv('empire', v + 1)));
    responses.push(await postCommand(app, id, endTurnEnv('empire', v + 2))); // → handoff
    responses.push(await api(app).get(`/api/sessions/${id}`));
    responses.push(await api(app).get(`/api/sessions/${id}?viewer=empire`));
    responses.push(await api(app).get('/api/sessions'));
    expect(responses.map((r) => r.status)).toEqual([201, 422, 422, 200, 200, 200, 200, 200, 200]);
    expect(responses[5]?.body.view.kind).toBe('handoff');
    for (const res of responses) {
      expect(forbiddenKeysIn(res.body), res.text).toEqual([]);
      expect(res.text).not.toContain(key);
    }
  });
});
