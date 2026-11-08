/**
 * SWR-005 W6b — hot-seat on `core-v1` through HTTP (AC-09; TC-HS-01..TC-HS-10, TC-H-14): a full round for two
 * players on one device; the handoff screen appears only when the active side changes; the inactive side is
 * rejected (422) and nothing changes; every engine command is `version + 1`, event rows stay consecutive.
 */
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CoreSession,
  ERR,
  HS_SESSION,
  HS_SETUP,
  accept,
  activate,
  asCore,
  asHandoff,
  createCore,
  endTurn,
  expectConsecutiveEvents,
  expectRejected,
  finish,
  fixedIds,
  lines,
  move,
  pass,
  storedState,
} from './support/core-fixtures';
import { tickingClock } from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

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

describe('core-v1 hot-seat over HTTP (AC-09)', () => {
  let db: TestDb;
  let app: INestApplication;
  let s: CoreSession;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, { clock: tickingClock(), idGenerator: fixedIds(HS_SESSION) });
    const created = await createCore(app, HS_SETUP);
    s = new CoreSession(app, created.sessionId, created.view.version);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  function expectHandoff(view: unknown, to: 'rebels' | 'empire', round: number) {
    const h = asHandoff(view);
    // TC-H-12: exactly the 8 public keys (SWR-004 + rulesEngine, AM-FE-8).
    expect(Object.keys(view as object).sort()).toEqual(HANDOFF_KEYS);
    expect(h).toMatchObject({
      kind: 'handoff',
      activeSide: to,
      round,
      phase: 'command',
      rulesEngine: 'core-v1',
      sessionStatus: 'prototype',
    });
  }

  it('TC-HS-07 (+01..05a, 10): a full round for two — handoff only when the side changes', async () => {
    let version = s.version;
    const step = async (...args: Parameters<CoreSession['send']>) => {
      const res = await s.send(...args);
      expect(res.view.version).toBe(++version); // one engine command = version + 1 (no AI here)
      return res;
    };

    // Rebels: activation + move — no handoff during the own activation (TC-HS-01).
    let res = await step(activate('rebels', 'leia', 'toydaria'));
    expect(asCore(res.view)).toMatchObject({ viewer: 'rebels', activeSide: 'rebels' });
    res = await step(move('rebels', ['u-02', 'u-05', 'u-06'], 'bothawui', 'toydaria'));
    expect(asCore(res.view).viewer).toBe('rebels');

    // FINISH (the Empire has not passed) → handoff to the Empire, no events for the next player (TC-HS-02).
    res = await step(finish('rebels'));
    expectHandoff(res.view, 'empire', 1);
    expect(res.events).toEqual([]);
    // The handoff is server state: a re-request still shows it (TC-HS-10).
    const got = await api(app).get(`/api/sessions/${s.id}`);
    expectHandoff(got.body.view, 'empire', 1);

    res = await step(accept('empire'));
    expect(asCore(res.view)).toMatchObject({ viewer: 'empire', activeSide: 'empire' });
    await step(activate('empire', 'vader', 'malastare'));
    res = await step(finish('empire'));
    expectHandoff(res.view, 'rebels', 1);

    // Rebels PASS → handoff to the Empire (TC-HS-03).
    await step(accept('rebels'));
    res = await step(pass('rebels'));
    expectHandoff(res.view, 'empire', 1);

    // The Rebels passed: the Empire acts on consecutive turns without a handoff (TC-HS-05a).
    await step(accept('empire'));
    await step(activate('empire', 'tarkin', 'corellia'));
    res = await step(finish('empire'));
    expect(asCore(res.view)).toMatchObject({
      kind: 'player',
      viewer: 'empire',
      activeSide: 'empire',
    });
    expect(lines(res.events)).toEqual(['ACTIVATION_FINISHED empire']);

    // The Empire passes last → refresh → round 2, Rebels first → handoff (side changed, TC-HS-04).
    res = await step(pass('empire'));
    expectHandoff(res.view, 'rebels', 2);
    expect(res.events).toEqual([]);
    res = await step(accept('rebels'));
    const r2 = asCore(res.view);
    expect(r2).toMatchObject({
      viewer: 'rebels',
      activeSide: 'rebels',
      round: 2,
      phase: 'command',
    });
    expect(r2.markers.time).toBe(2);
    expect(r2.leaders.every((l) => l.location.kind === 'pool')).toBe(true);
    expect(r2.activation).toBeNull();
    // The log has every transition of the round.
    expect(lines(r2.log)).toEqual([
      'GAME_CREATED system',
      'PHASE_STARTED system',
      'PHASE_STARTED system',
      'SYSTEM_ACTIVATED rebels',
      'PIECES_MOVED rebels',
      'ACTIVATION_FINISHED rebels',
      'HANDOFF_ACCEPTED empire',
      'SYSTEM_ACTIVATED empire',
      'ACTIVATION_FINISHED empire',
      'HANDOFF_ACCEPTED rebels',
      'PASSED rebels',
      'HANDOFF_ACCEPTED empire',
      'SYSTEM_ACTIVATED empire',
      'ACTIVATION_FINISHED empire',
      'PASSED empire',
      'PHASE_STARTED system',
      'LEADERS_RETURNED system',
      'TIME_ADVANCED system',
      'PHASE_STARTED system',
      'PHASE_STARTED system',
      'HANDOFF_ACCEPTED rebels',
    ]);
    await expectConsecutiveEvents(app, s.id);

    // Round 2: the Empire passes first, the Rebels last → new round, same side → NO handoff (TC-HS-05, Q-28).
    await step(activate('rebels', 'leia', 'bothawui'));
    await step(finish('rebels'));
    await step(accept('empire'));
    res = await step(pass('empire'));
    expectHandoff(res.view, 'rebels', 2);
    await step(accept('rebels'));
    res = await step(pass('rebels'));
    expect(asCore(res.view)).toMatchObject({
      kind: 'player',
      viewer: 'rebels',
      activeSide: 'rebels',
      round: 3,
    });
    const stored = await storedState(app, s.id);
    expect(stored).toMatchObject({ handoffPending: false, activeSide: 'rebels', round: 3 });
    await expectConsecutiveEvents(app, s.id);
  });

  it('TC-HS-06 / TC-HS-08 / TC-H-14: the inactive side and engine-foreign commands → 422, nothing changes', async () => {
    await s.play([activate('rebels', 'leia', 'toydaria'), finish('rebels')]);
    // handoff to the Empire
    const rejected = [
      [pass('rebels'), 'notYourTurn', { actor: 'rebels' }],
      [activate('rebels', 'dodonna', 'bothawui'), 'notYourTurn', { actor: 'rebels' }],
      [activate('empire', 'vader', 'malastare'), 'handoffPending', { actor: 'empire' }],
      [accept('rebels'), 'notYourTurn', { actor: 'rebels' }],
      [endTurn('empire'), 'commandUnavailable', { actor: 'empire', type: 'END_TURN' }],
    ] as const;
    for (const [step, key, details] of rejected) {
      await expectRejected(app, s, step, {
        status: 422,
        code: 'ILLEGAL_COMMAND',
        messageKey: ERR(key),
        details,
      });
    }

    await s.send(accept('empire'));
    // TC-H-14: `?viewer` is ignored — the server answers for the active side; a Rebel command is refused
    // without any Rebel view in the error body.
    const got = await api(app).get(`/api/sessions/${s.id}?viewer=rebels`);
    expect(asCore(got.body.view).viewer).toBe('empire');
    const { raw } = await expectRejected(app, s, pass('rebels'), {
      status: 422,
      code: 'ILLEGAL_COMMAND',
      messageKey: ERR('notYourTurn'),
      details: { actor: 'rebels' },
    });
    expect(Object.keys(raw as object).sort()).toEqual(['error', 'ok']);
  });

  it('TC-HS-09: two parallel ACCEPT_HANDOFF → one 200, one 409; the acceptance is recorded once', async () => {
    await s.play([activate('rebels', 'leia', 'toydaria'), finish('rebels')]);
    const results = await Promise.all([s.post(accept('empire')), s.post(accept('empire'))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const events = await expectConsecutiveEvents(app, s.id);
    expect(events.filter((e) => e.type === 'HANDOFF_ACCEPTED')).toHaveLength(1);
    expect((await storedState(app, s.id)).version).toBe(s.version + 1);
  });
});
