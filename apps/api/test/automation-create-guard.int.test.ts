/**
 * SWR-006 review F-1 — the create path (`POST /api/sessions`) uses the same non-throwing automation guard as the
 * command path (`settleRun`). The session row and its idempotency record are committed before the runner starts, so a
 * failing runner or a throwing game `pendingActor` must answer 201 with `automation.pending: true` (the client may
 * retry `POST …/automation/run`), never 500. Fake automated game `FAKE_AUTO`; no real game package, no network.
 */
import type { INestApplication } from '@nestjs/common';
import { SessionCommandOkSchema, SessionResponseSchema } from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import type { AutomationLogSink } from '../src/sessions/automation/automation-log';
import {
  FAKE_AUTO_ID,
  createFakeAutoGame,
  fakeAutoApp,
  fakeAutoControl,
  type FakeAutoControl,
} from './support/fake-automation';
import { prismaOf, sequentialIds, tickingClock } from './support/fixtures';
import { api, createTestDb, removeTestDb, startApp, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

/** A log sink that throws while `armed` — makes `AutomationRunner.run` itself reject (its catch logs too). */
function throwingSink(): { sink: AutomationLogSink; armed: { on: boolean } } {
  const armed = { on: false };
  return {
    armed,
    sink: () => {
      if (armed.on) throw new Error('log sink failure');
    },
  };
}

async function start(control: FakeAutoControl, logSink?: AutomationLogSink) {
  const db = createTestDb();
  dbs.push(db);
  const { module } = createFakeAutoGame(control);
  const app = await startApp(db.url, {
    ...fakeAutoApp(module),
    // The guard's own AUTOMATION_ERROR line goes to Nest's error logger; keep test output quiet.
    logger: false,
    clock: tickingClock(),
    idGenerator: sequentialIds('guard'),
    automation: logSink ? { logSink } : {},
  });
  apps.push(app);
  return app;
}

describe('review F-1: create path never answers 500 because of automation', () => {
  it('pendingActor throws at create → 201, pending:true, the inserted state; the session is stored and continues later', async () => {
    const control = fakeAutoControl();
    control.throwPendingActor = true;
    const app = await start(control);

    const res = await api(app)
      .post('/api/sessions')
      .send({ gameId: FAKE_AUTO_ID, setup: { botFirst: true, botMoves: 2 } });
    expect(res.status).toBe(201);
    const created = SessionResponseSchema.parse(res.body);
    expect(created.automation).toEqual({ pending: true, strategy: 'bot' });
    expect(created.view).toMatchObject({ version: 1, count: 0, pending: 2 });
    const row = await prismaOf(app).session.findUniqueOrThrow({
      where: { id: created.sessionId },
    });
    expect(row.version).toBe(1);

    control.throwPendingActor = false;
    const run = await api(app).post(`/api/sessions/${created.sessionId}/automation/run`).send({});
    expect(run.status).toBe(200);
    const body = SessionCommandOkSchema.parse(run.body);
    expect(body.automation).toMatchObject({ steps: 2, pending: false, stopReason: 'humanTurn' });
  });

  it('the runner itself rejects at create → 201, pending:true; an idempotent replay answers 200 with the same session', async () => {
    const control = fakeAutoControl();
    control.throwPoint = true; // no step is committed before the failure
    const { sink, armed } = throwingSink();
    armed.on = true;
    const app = await start(control, sink);

    const key = 'f1f1f1f1-0000-4000-8000-000000000001';
    const send = () =>
      api(app)
        .post('/api/sessions')
        .set('Idempotency-Key', key)
        .send({ gameId: FAKE_AUTO_ID, setup: { botFirst: true, botMoves: 1 } });

    const res = await send();
    expect(res.status).toBe(201);
    const created = SessionResponseSchema.parse(res.body);
    expect(created.automation).toEqual({ pending: true, strategy: 'bot' });
    expect(created.view).toMatchObject({ version: 1, count: 0, pending: 1 });

    const replay = await send();
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(SessionResponseSchema.parse(replay.body).sessionId).toBe(created.sessionId);
    expect(await prismaOf(app).session.count()).toBe(1);
  });

  it('the same guard on the command path: the runner rejects → 200 with stopReason error, the command is kept', async () => {
    const control = fakeAutoControl();
    const { sink, armed } = throwingSink();
    const app = await start(control, sink);
    const created = SessionResponseSchema.parse(
      (await api(app).post('/api/sessions').send({ gameId: FAKE_AUTO_ID, setup: {} })).body,
    );

    control.throwPoint = true;
    armed.on = true;
    const res = await api(app)
      .post(`/api/sessions/${created.sessionId}/commands`)
      .send({ actor: 'p1', expectedVersion: 1, command: { type: 'END_TURN' } });
    expect(res.status).toBe(200);
    const body = SessionCommandOkSchema.parse(res.body);
    expect(body.automation).toMatchObject({
      steps: 0,
      pending: true,
      strategy: 'bot',
      stopReason: 'error',
    });
    const row = await prismaOf(app).session.findUniqueOrThrow({
      where: { id: created.sessionId },
    });
    expect(row.version).toBe(2);
  });
});
