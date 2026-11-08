/**
 * SWR-005 W6b — AI games of both sides on `core-v1` through HTTP (AC-08; TC-AI-03..07a, 10, 11, 13, 15..17):
 * the server applies the AI side's pass in the SAME operation (actor = AI side, `payload.auto = true`), the
 * response carries the version after the last auto move, the stored state never waits on the AI and has no
 * handoff, and nothing calls OpenAI / the network (there is no dependency: `architecture.int.test.ts` TC-A-02;
 * here `fetch` is spied during full rounds of both sides).
 */
import type { INestApplication } from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER, SessionResponseSchema } from '@bga/platform';
import type { Faction } from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_EMP_SETUP,
  AI_REB_SETUP,
  CoreSession,
  activate,
  asCore,
  createCore,
  expectConsecutiveEvents,
  finish,
  getSession,
  lines,
  pass,
  storedEvents,
  storedRow,
  storedState,
  type Step,
} from './support/core-fixtures';
import { R, sequentialIds, tickingClock } from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

const IDEM_KEY = '6f1c2a3e-6b1d-4c1e-9a52-5e0c1d2b3a40';

const REFRESH = [
  'PHASE_STARTED system',
  'LEADERS_RETURNED system',
  'TIME_ADVANCED system',
  'PHASE_STARTED system',
  'PHASE_STARTED system',
];

describe('core-v1 AI auto-pass over HTTP (AC-08)', () => {
  let db: TestDb;
  let app: INestApplication;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const savedKey = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    // TC-AI-13: no key at all; any outgoing fetch would be recorded.
    delete process.env.OPENAI_API_KEY;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    db = createTestDb();
    app = await startApp(db.url, { clock: tickingClock(), idGenerator: sequentialIds('ai') });
  });

  afterEach(async () => {
    await stopApp(app, db);
    // TC-AI-13: not a single network call during any test of this file.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  });

  /** TC-AI-17: after every command the stored AI game waits on the player, never on a handoff. */
  async function expectAiInvariant(sessionId: string, player: Faction) {
    const state = await storedState(app, sessionId);
    expect(state.handoffPending).toBe(false);
    if (state.outcome === null) expect(state.activeSide).toBe(player);
  }

  async function sendChecked(s: CoreSession, step: Step, player: Faction, engineCommands: number) {
    const before = s.version;
    const res = await s.send(step);
    // Q-19: every engine command (player's and each auto move) is version + 1; one response version.
    expect(res.view.version).toBe(before + engineCommands);
    expect(asCore(res.view).viewer).toBe(player);
    await expectAiInvariant(s.id, player);
    await expectConsecutiveEvents(app, s.id);
    return res;
  }

  it('TC-AI-06 / TC-AI-16: Empire vs AI — the AI Rebels pass at creation (version 2); idempotent replay does not repeat it', async () => {
    const res = await api(app)
      .post('/api/sessions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEM_KEY)
      .send({ gameId: R, setup: AI_EMP_SETUP });
    expect(res.status).toBe(201);
    const body = SessionResponseSchema.parse(res.body);
    const view = asCore(body.view);
    expect(view).toMatchObject({ viewer: 'empire', activeSide: 'empire', version: 2, round: 1 });
    expect(lines(view.log)).toEqual([
      'GAME_CREATED system',
      'PHASE_STARTED system',
      'PHASE_STARTED system',
      'PASSED rebels',
    ]);
    expect(view.log.at(-1)?.payload).toEqual({ auto: true });
    expect(view.passed).toEqual({ rebels: true, empire: false });
    await expectAiInvariant(body.sessionId, 'empire');
    expect((await getSession(app, body.sessionId)).body).toEqual(res.body);
    const events = await expectConsecutiveEvents(app, body.sessionId);
    expect(events.at(-1)).toMatchObject({
      type: 'PASSED',
      actor: 'rebels',
      payload: { auto: true },
    });

    const replay = await api(app)
      .post('/api/sessions')
      .set(IDEMPOTENCY_KEY_HEADER, IDEM_KEY)
      .send({ gameId: R, setup: AI_EMP_SETUP });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(res.body);
    expect((await storedRow(app, body.sessionId)).version).toBe(2);
    expect(await storedEvents(app, body.sessionId)).toHaveLength(events.length);
  });

  it('TC-AI-03 / TC-AI-04 / TC-AI-05 / TC-AI-10 / TC-AI-11: Rebels vs AI — auto pass in the same response, versions', async () => {
    const created = await createCore(app, AI_REB_SETUP);
    const view0 = asCore(created.view);
    // No AI move at creation: the Rebels start (AC-03).
    expect(view0).toMatchObject({ viewer: 'rebels', activeSide: 'rebels', version: 1 });
    expect(lines(view0.log)).toEqual([
      'GAME_CREATED system',
      'PHASE_STARTED system',
      'PHASE_STARTED system',
    ]);
    const s = new CoreSession(app, created.sessionId, view0.version);

    // TC-AI-11: the player cannot command the AI side.
    const foreign = await s.post(pass('empire'));
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.messageKey).toBe('errors.notYourSide');

    let res = await sendChecked(s, activate('rebels', 'leia', 'toydaria'), 'rebels', 1);
    expect(lines(res.events)).toEqual(['SYSTEM_ACTIVATED rebels']);

    // TC-AI-03: FINISH → the AI Empire passes inside the same operation; the player keeps the turn.
    res = await sendChecked(s, finish('rebels'), 'rebels', 2);
    expect(res.events.map((e) => [e.type, e.actor, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', 'rebels', { auto: false }],
      ['PASSED', 'empire', { auto: true }],
    ]);
    expect(asCore(res.view)).toMatchObject({
      activeSide: 'rebels',
      passed: { rebels: false, empire: true },
    });
    const stored = await storedEvents(app, s.id);
    expect(stored.at(-1)).toMatchObject({
      type: 'PASSED',
      actor: 'empire',
      payload: { auto: true },
    });

    // TC-AI-10: the previous version is stale (409), the response version is the next expectedVersion.
    const stale = await s.post(activate('rebels', 'dodonna', 'bothawui'), s.version - 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toEqual({ currentVersion: s.version });

    // TC-AI-04: the AI passed until the end of the phase — no AI events any more.
    await sendChecked(s, activate('rebels', 'dodonna', 'bothawui'), 'rebels', 1);
    res = await sendChecked(s, finish('rebels'), 'rebels', 1);
    expect(lines(res.events)).toEqual(['ACTIVATION_FINISHED rebels']);

    // The Rebels pass → both passed → refresh → round 2 → Rebels first (the AI does not move: not its turn).
    res = await sendChecked(s, pass('rebels'), 'rebels', 1);
    expect(lines(res.events)).toEqual(['PASSED rebels', ...REFRESH]);
    expect(asCore(res.view)).toMatchObject({ round: 2, activeSide: 'rebels' });

    // TC-AI-05: Rebels PASS first in a round → AI pass → refresh → round 3 → Rebels, all in one response.
    res = await sendChecked(s, pass('rebels'), 'rebels', 2);
    expect(res.events.map((e) => `${e.type} ${e.actor}`)).toEqual([
      'PASSED rebels',
      'PASSED empire',
      ...REFRESH,
    ]);
    expect(res.events[1]?.payload).toEqual({ auto: true });
    expect(asCore(res.view)).toMatchObject({
      round: 3,
      activeSide: 'rebels',
      markers: { time: 3 },
    });
  });

  it('TC-AI-07 / TC-AI-07a: Empire vs AI — the AI passed, the Empire acts again; PASS → new round with the AI pass', async () => {
    const created = await createCore(app, AI_EMP_SETUP);
    const s = new CoreSession(app, created.sessionId, created.view.version);
    expect(s.version).toBe(2);

    await sendChecked(s, activate('empire', 'vader', 'malastare'), 'empire', 1);
    let res = await sendChecked(s, finish('empire'), 'empire', 1);
    expect(lines(res.events)).toEqual(['ACTIVATION_FINISHED empire']);
    expect(asCore(res.view).activeSide).toBe('empire');

    res = await sendChecked(s, pass('empire'), 'empire', 2);
    expect(lines(res.events)).toEqual(['PASSED empire', ...REFRESH, 'PASSED rebels']);
    expect(res.events.at(-1)?.payload).toEqual({ auto: true });
    expect(asCore(res.view)).toMatchObject({
      round: 2,
      activeSide: 'empire',
      passed: { rebels: true, empire: false },
    });
  });

  it('TC-AI-15: two parallel player commands with one expectedVersion → one 200, one 409; the auto pass is stored once', async () => {
    const created = await createCore(app, AI_REB_SETUP);
    const s = new CoreSession(app, created.sessionId, created.view.version);
    const results = await Promise.all([s.post(pass('rebels')), s.post(pass('rebels'))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const events = await expectConsecutiveEvents(app, s.id);
    expect(events.filter((e) => e.type === 'PASSED' && e.actor === 'empire')).toHaveLength(1);
    expect((await storedRow(app, s.id)).version).toBe(3);
  });
});
