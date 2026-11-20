/**
 * SWR-006 W7 — the game-agnostic automation runner over HTTP (AC-01, AC-02, AC-07, AC-09; TC-PL-06, TC-PL-07,
 * TC-LOOP-02/04/05/06/08/09/10/11/12/13/14/16, TC-CC-01, TC-CC-04, TC-RS-01-style restart). The automated game is the
 * fake `FAKE_AUTO` (no real game package); strategies are the configured bot, the OpenAI strategy on the free mock
 * provider (OpenAI disabled, no network) or the scripted `FAKE_STRAT`.
 */
import type { INestApplication } from '@nestjs/common';
import {
  AutomationRunSummarySchema,
  SessionCommandOkSchema,
  SessionResponseSchema,
  type AutomationRunSummary,
} from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, ProductionOverridesError } from '../src/app.factory';
import type { AutomationLogLevel } from '../src/sessions/automation/automation-log';
import type { AutomationTestOverrides } from '../src/sessions/automation/automation.tokens';
import type { AiCommanderConfig } from '../src/config/env';
import type { MockStep } from '../src/ai/ai.types';
import {
  FAKE_AUTO_ID,
  FAKE_AUTO_SECRET,
  FakeStrategy,
  createFakeAutoGame,
  deferred,
  fakeAutoApp,
  fakeAutoDefinition,
  fakeAutoControl,
  type FakeAutoControl,
  type FakeAutoSetup,
} from './support/fake-automation';
import { FAKE_GAME_ID, fakeGameDefinition, fakeGameModule } from './support/fake-game';
import { HS_SETUP } from './support/core-fixtures';
import { R, expectError, prismaOf, sequentialIds, tickingClock } from './support/fixtures';
import { instantSleep } from './support/ai-fakes';
import { api, createTestDb, removeTestDb, startApp, type TestDb } from './support/test-app';
import { testConfig } from './support/test-config';

interface Started {
  app: INestApplication;
  control: FakeAutoControl;
  logs: { level: AutomationLogLevel; line: string }[];
}

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

function newDb(): TestDb {
  const db = createTestDb();
  dbs.push(db);
  return db;
}

async function start(
  db: TestDb,
  options: {
    aiCommander?: Partial<AiCommanderConfig>;
    strategy?: AutomationTestOverrides['strategy'];
    control?: FakeAutoControl;
    mockScript?: readonly MockStep[];
    ids?: string;
  } = {},
): Promise<Started> {
  const { module, control } = createFakeAutoGame(options.control ?? fakeAutoControl());
  const logs: Started['logs'] = [];
  const app = await startApp(db.url, {
    ...fakeAutoApp(module),
    clock: tickingClock(),
    idGenerator: sequentialIds(options.ids ?? 'auto'),
    config: { aiCommander: options.aiCommander },
    automation: {
      strategy: options.strategy,
      logSink: (level, line) => logs.push({ level, line }),
    },
    ai: { mockScript: options.mockScript, sleep: instantSleep().sleep },
  });
  apps.push(app);
  return { app, control, logs };
}

async function create(app: INestApplication, setup: FakeAutoSetup = {}) {
  const res = await api(app).post('/api/sessions').send({ gameId: FAKE_AUTO_ID, setup });
  expect(res.status).toBe(201);
  return SessionResponseSchema.parse(res.body);
}

async function command(
  app: INestApplication,
  sessionId: string,
  expectedVersion: number,
  type: 'END_TURN' | 'FINISH' = 'END_TURN',
) {
  return api(app)
    .post(`/api/sessions/${sessionId}/commands`)
    .send({ actor: 'p1', expectedVersion, command: { type } });
}

async function commandOk(
  app: INestApplication,
  sessionId: string,
  expectedVersion: number,
  type: 'END_TURN' | 'FINISH' = 'END_TURN',
) {
  const res = await command(app, sessionId, expectedVersion, type);
  expect(res.status).toBe(200);
  return SessionCommandOkSchema.parse(res.body);
}

function runAutomation(app: INestApplication, sessionId: string, body?: unknown) {
  const req = api(app).post(`/api/sessions/${sessionId}/automation/run`);
  return body === undefined ? req : req.send(body as object);
}

async function runOk(app: INestApplication, sessionId: string, body?: unknown) {
  const res = await runAutomation(app, sessionId, body);
  expect(res.status).toBe(200);
  return SessionCommandOkSchema.parse(res.body);
}

async function storedEvents(app: INestApplication, sessionId: string) {
  return prismaOf(app).sessionEvent.findMany({ where: { sessionId }, orderBy: { seq: 'asc' } });
}

async function storedRow(app: INestApplication, sessionId: string) {
  return prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
}

function view(body: { view: unknown }) {
  return body.view as { version: number; count: number; pending: number; status: string };
}

function summary(over: Partial<AutomationRunSummary>): AutomationRunSummary {
  return {
    steps: 0,
    pending: false,
    strategy: 'bot',
    fallbacks: 0,
    fallbackReasons: [],
    stopReason: 'none',
    ...over,
  };
}

const NONE = summary({ strategy: null });

async function expectConsecutive(app: INestApplication, sessionId: string) {
  const events = await storedEvents(app, sessionId);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  expect((await storedRow(app, sessionId)).version).toBe(events.length);
  return events;
}

describe('automation runner over HTTP (SWR-006 W7)', () => {
  it('TC-PL-07 / TC-LOOP-01: a human command → the automated side moves in the same response, one commit per step', async () => {
    const { app, logs } = await start(newDb());
    const created = await create(app);
    expect(created.automation).toEqual({ pending: false, strategy: 'bot' });

    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(summary({ steps: 3, stopReason: 'humanTurn' }));
    expect(view(res)).toMatchObject({ version: 5, count: 3, pending: 0, status: 'active' });
    // Human + automated events, all through toPlayerEvents (the secret of the raw payload is gone).
    expect(res.events).toEqual([
      { seq: 2, type: 'HUMAN_ENDED', actor: 'p1', count: 0 },
      { seq: 3, type: 'BOT_MOVED', actor: 'p2', count: 1, candidateId: 'c1' },
      { seq: 4, type: 'BOT_MOVED', actor: 'p2', count: 2, candidateId: 'c1' },
      { seq: 5, type: 'BOT_MOVED', actor: 'p2', count: 3, candidateId: 'c1' },
    ]);
    expect(JSON.stringify(res)).not.toContain(FAKE_AUTO_SECRET);

    const events = await expectConsecutive(app, created.sessionId);
    expect(events.map((e) => [e.type, e.actor])).toEqual([
      ['STARTED', 'system'],
      ['HUMAN_ENDED', 'p1'],
      ['BOT_MOVED', 'p2'],
      ['BOT_MOVED', 'p2'],
      ['BOT_MOVED', 'p2'],
    ]);

    // TC-LOOP-16: one allow-listed line per step (+ one run line), nothing of the game.
    const steps = logs.filter((l) => l.line.startsWith('automation.step'));
    expect(steps.map((l) => l.line)).toEqual(
      [1, 2, 3].map((n) =>
        expect.stringMatching(
          new RegExp(
            `^automation\\.step sessionId=auto-001 gameId=fake-auto step=${n} strategy=bot source=bot fallbackCode=- durationMs=\\d+ code=OK$`,
          ),
        ),
      ),
    );
    expect(logs.filter((l) => l.line.startsWith('automation.run')).map((l) => l.line)).toEqual([
      expect.stringMatching(
        /^automation\.run sessionId=auto-001 gameId=fake-auto steps=3 fallbacks=0 stopReason=humanTurn durationMs=\d+$/,
      ),
    ]);
    const all = logs.map((l) => l.line).join('\n');
    for (const leak of ['c1', 'c2', 'north', 'Move one step', 'Moves left', FAKE_AUTO_SECRET]) {
      expect(all).not.toContain(leak);
    }
    expect(logs.every((l) => l.level === 'log')).toBe(true);

    const get = SessionResponseSchema.parse(
      (await api(app).get(`/api/sessions/${created.sessionId}`)).body,
    );
    expect(get.automation).toEqual({ pending: false, strategy: 'bot' });
    expect(get.view).toEqual(res.view);
  });

  it('TC-LOOP-02: creating a session whose automated side starts plays its moves before the 201', async () => {
    const { app } = await start(newDb());
    const created = await create(app, { botFirst: true, botMoves: 2 });
    expect(created.automation).toEqual({ pending: false, strategy: 'bot' });
    expect(view(created)).toMatchObject({ version: 3, count: 2, pending: 0 });
    await expectConsecutive(app, created.sessionId);
    const get = SessionResponseSchema.parse(
      (await api(app).get(`/api/sessions/${created.sessionId}`)).body,
    );
    expect(get).toEqual(created);
  });

  it('TC-LOOP-04 / TC-LOOP-05 / TC-LOOP-11 / TC-RS-01: step limit → pending; GET reports it; run continues on a new app; run is idempotent', async () => {
    const db = newDb();
    const first = await start(db, { aiCommander: { maxSteps: 2 } });
    const created = await create(first.app, { botMoves: 5 });

    const res = await commandOk(first.app, created.sessionId, 1);
    expect(res.automation).toEqual(summary({ steps: 2, pending: true, stopReason: 'stepLimit' }));
    expect(view(res)).toMatchObject({ version: 4, count: 2, pending: 3 });
    const get = SessionResponseSchema.parse(
      (await api(first.app).get(`/api/sessions/${created.sessionId}`)).body,
    );
    expect(get.automation).toEqual({ pending: true, strategy: 'bot' });

    // The human cannot move while the automated side is pending (the game's own rule).
    expectError(await command(first.app, created.sessionId, 4), 422, 'ILLEGAL_COMMAND');

    const again = await runOk(first.app, created.sessionId);
    expect(again.automation).toEqual(summary({ steps: 2, pending: true, stopReason: 'stepLimit' }));
    expect(again.events.map((e) => (e as { seq: number }).seq)).toEqual([5, 6]);

    // Restart: a new app on the same DB file (default step limit) finishes the automated turn.
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);
    const second = await start(db);
    const before = SessionResponseSchema.parse(
      (await api(second.app).get(`/api/sessions/${created.sessionId}`)).body,
    );
    expect(before.automation).toEqual({ pending: true, strategy: 'bot' });
    const done = await runOk(second.app, created.sessionId, {});
    expect(done.automation).toEqual(summary({ steps: 1, stopReason: 'humanTurn' }));
    expect(view(done)).toMatchObject({ version: 7, count: 5, pending: 0 });

    // Idempotent: nothing pending → steps 0, nothing written.
    for (let i = 0; i < 3; i += 1) {
      const idle = await runOk(second.app, created.sessionId);
      expect(idle.automation).toEqual(summary({ stopReason: 'none' }));
      expect(idle.events).toEqual([]);
      expect(idle.view).toEqual(done.view);
    }
    const events = await expectConsecutive(second.app, created.sessionId);
    expect(events.filter((e) => e.type === 'BOT_MOVED')).toHaveLength(5);
  });

  it('TC-LOOP-06: an automated turn that never ends stops at the step limit (64) on every request', async () => {
    const control = fakeAutoControl();
    const { app } = await start(newDb(), { control });
    const created = await create(app);
    control.pendingForever = true;
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(summary({ steps: 64, pending: true, stopReason: 'stepLimit' }));
    const next = await runOk(app, created.sessionId);
    expect(next.automation).toEqual(summary({ steps: 64, pending: true, stopReason: 'stepLimit' }));
    expect(view(next).version).toBe(2 + 128);
  });

  it('TC-LOOP-08: the engine rejects the strategy pick → the bot pick is applied, counted as AI_INVALID_DECISION', async () => {
    const control = fakeAutoControl();
    control.reject.add('c2');
    const strategy = new FakeStrategy(() => ({ candidateId: 'c2', source: 'openai' }));
    const { app, logs } = await start(newDb(), { control, strategy });
    const created = await create(app, { botMoves: 2 });
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(
      summary({
        steps: 2,
        strategy: 'openai',
        fallbacks: 2,
        fallbackReasons: ['AI_INVALID_DECISION'],
        stopReason: 'humanTurn',
      }),
    );
    expect(control.applied).toEqual(['c2', 'c1', 'c2', 'c1']);
    expect(strategy.calls).toBe(2);
    const steps = logs.filter((l) => l.line.startsWith('automation.step')).map((l) => l.line);
    expect(steps).toHaveLength(2);
    for (const line of steps) {
      expect(line).toMatch(
        /source=bot fallbackCode=AI_INVALID_DECISION .* code=ENGINE_REJECTED_RETRY$/,
      );
    }
  });

  it('TC-LOOP-09 / TC-RS-02: the engine rejects the pick and the bot pick → 200 with the human command, pending, error log; run continues later', async () => {
    const control = fakeAutoControl();
    const strategy = new FakeStrategy(() => ({ candidateId: 'c2', source: 'openai' }));
    const { app, logs } = await start(newDb(), { control, strategy });
    const created = await create(app, { botMoves: 3 });
    control.reject.add('c2');
    control.reject.add('c1');
    // Step 1: the pick c2 is rejected, then the bot pick c1 too.
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(
      summary({ steps: 0, pending: true, strategy: 'openai', stopReason: 'error' }),
    );
    expect(view(res)).toMatchObject({ version: 2, count: 0, pending: 3 });
    expect((await storedRow(app, created.sessionId)).version).toBe(2);
    expect(res.events).toEqual([{ seq: 2, type: 'HUMAN_ENDED', actor: 'p1', count: 0 }]);
    const errors = logs.filter((l) => l.level === 'error').map((l) => l.line);
    expect(errors).toEqual([
      'automation.error sessionId=auto-001 gameId=fake-auto step=1 code=ENGINE_REJECTED',
      expect.stringMatching(
        /^automation\.run sessionId=auto-001 .* stopReason=error durationMs=\d+$/,
      ),
    ]);
    expect(JSON.stringify(res)).not.toContain('fakeRejected');

    control.reject.clear();
    const done = await runOk(app, created.sessionId);
    expect(done.automation).toMatchObject({ steps: 3, pending: false, stopReason: 'humanTurn' });
    await expectConsecutive(app, created.sessionId);
  });

  it('TC-LOOP-10 / Q-20: a throwing strategy or an id outside the candidates → the bot moves; never a 500', async () => {
    const strategy = new FakeStrategy((_point, call) => {
      if (call === 1) throw new TypeError('boom with secret text');
      return { candidateId: 'x-evil', source: 'openai' };
    });
    const { app, logs } = await start(newDb(), { strategy });
    const created = await create(app, { botMoves: 2 });
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(
      summary({
        steps: 2,
        strategy: 'openai',
        fallbacks: 2,
        fallbackReasons: ['AI_PROVIDER_ERROR', 'AI_INVALID_DECISION'],
        stopReason: 'humanTurn',
      }),
    );
    const all = logs.map((l) => l.line).join('\n');
    expect(all).toContain('code=STRATEGY_ERROR error=TypeError');
    expect(all).not.toMatch(/boom|secret text|x-evil/);
  });

  it('Q-9: an invalid decision point is never given to the strategy → error, pending', async () => {
    const control = fakeAutoControl();
    const strategy = new FakeStrategy();
    const { app, logs } = await start(newDb(), { control, strategy });
    const created = await create(app);
    control.invalidPoint = true;
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(
      summary({ pending: true, strategy: 'openai', stopReason: 'error' }),
    );
    expect(strategy.calls).toBe(0);
    expect(logs.some((l) => l.line.includes('code=INVALID_DECISION_POINT'))).toBe(true);

    control.invalidPoint = false;
    control.throwPoint = true;
    const run = await runOk(app, created.sessionId);
    expect(run.automation).toEqual(
      summary({ pending: true, strategy: 'openai', stopReason: 'error' }),
    );
    expect(
      logs.some((l) => l.line.includes('code=AUTOMATION_ERROR error=Error') && l.level === 'error'),
    ).toBe(true);
  });

  it('TC-LOOP-13 / TC-LOOP-14: an automated step ends the game → gameOver, completed in the same response', async () => {
    const { app } = await start(newDb());
    const created = await create(app, { botMoves: 3, finishAfter: 2 });
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(summary({ steps: 2, stopReason: 'gameOver' }));
    expect(view(res)).toMatchObject({ status: 'completed', count: 2 });
    expect((await storedRow(app, created.sessionId)).status).toBe('completed');
    const run = await runOk(app, created.sessionId);
    expect(run.automation).toEqual(summary({ stopReason: 'none' }));
  });

  it('TC-OA-02 analogue: a single candidate is played by the bot without a fallback', async () => {
    const control = fakeAutoControl();
    control.singleCandidate = true;
    const { app } = await start(newDb(), {
      control,
      aiCommander: { provider: 'openai' },
      mockScript: ['ok'],
    });
    const created = await create(app, { botMoves: 2 });
    const res = await commandOk(app, created.sessionId, 1);
    expect(res.automation).toEqual(
      summary({ steps: 2, strategy: 'openai', stopReason: 'humanTurn' }),
    );
    expect(await prismaOf(app).aiUsage.count()).toBe(0);
  });

  it('OpenAI strategy on the mock provider: every call is an AiUsage row with budgetKey = sessionId; failures fall back to the bot', async () => {
    const ok = await start(newDb(), { aiCommander: { provider: 'openai' }, mockScript: ['ok'] });
    const created = await create(ok.app, { botMoves: 2 });
    expect(created.automation).toEqual({ pending: false, strategy: 'openai' });
    const res = await commandOk(ok.app, created.sessionId, 1);
    expect(res.automation).toEqual(
      summary({ steps: 2, strategy: 'openai', stopReason: 'humanTurn' }),
    );
    const rows = await prismaOf(ok.app).aiUsage.findMany();
    expect(rows.map((r) => [r.budgetKey, r.status, r.provider])).toEqual([
      [created.sessionId, 'ok', 'mock'],
      [created.sessionId, 'ok', 'mock'],
    ]);

    const failing = await start(newDb(), {
      aiCommander: { provider: 'openai' },
      mockScript: ['rate-limit'],
    });
    const s2 = await create(failing.app, { botMoves: 2 });
    const res2 = await commandOk(failing.app, s2.sessionId, 1);
    expect(res2.automation).toEqual(
      summary({
        steps: 2,
        strategy: 'openai',
        fallbacks: 2,
        fallbackReasons: ['AI_RATE_LIMITED'],
        stopReason: 'humanTurn',
      }),
    );
    // Q-7: a rate limit does not stop the run — every step tried the model again.
    const rows2 = await prismaOf(failing.app).aiUsage.findMany();
    expect(rows2.map((r) => [r.budgetKey, r.status])).toEqual([
      [s2.sessionId, 'rate_limited'],
      [s2.sessionId, 'rate_limited'],
    ]);
  });

  it('TC-CC-01 (Q-5): two parallel runs in one process — each step once, the strategy called once per step, the second run finds nothing', async () => {
    const db = newDb();
    const first = await start(db, { aiCommander: { maxSteps: 1 } });
    const created = await create(first.app, { botMoves: 4 });
    const res = await commandOk(first.app, created.sessionId, 1);
    expect(res.automation).toMatchObject({ steps: 1, pending: true, stopReason: 'stepLimit' });
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);

    const gate = deferred();
    const strategy = new FakeStrategy();
    strategy.gate = gate.promise;
    const second = await start(db, { strategy });
    const a = runAutomation(second.app, created.sessionId).then((r) => r);
    const b = runAutomation(second.app, created.sessionId).then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 100));
    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);
    const bodies = [ra, rb].map((r) => {
      expect(r.status).toBe(200);
      return SessionCommandOkSchema.parse(r.body);
    });
    const stepsDone = bodies.map((x) => x.automation.steps).sort();
    expect(stepsDone).toEqual([0, 3]);
    expect(strategy.calls).toBe(3);
    expect(strategy.runs).toHaveLength(1);
    expect(bodies[0]?.view).toEqual(bodies[1]?.view);
    const idle = bodies.find((x) => x.automation.steps === 0);
    expect(idle?.automation).toEqual(summary({ strategy: 'openai', stopReason: 'none' }));
    expect(idle?.events).toEqual([]);
    const events = await expectConsecutive(second.app, created.sessionId);
    expect(events.filter((e) => e.type === 'BOT_MOVED')).toHaveLength(4);
  });

  it('TC-CC-04: two apps on one DB run at once → every step applied once; the loser stops quietly with conflict', async () => {
    const db = newDb();
    const setupApp = await start(db, { aiCommander: { maxSteps: 1 } });
    const created = await create(setupApp.app, { botMoves: 4 });
    await commandOk(setupApp.app, created.sessionId, 1);
    await setupApp.app.close();
    apps.splice(apps.indexOf(setupApp.app), 1);

    const gate = deferred();
    const sa = new FakeStrategy();
    const sb = new FakeStrategy();
    sa.gate = gate.promise;
    sb.gate = gate.promise;
    const A = await start(db, { strategy: sa });
    const B = await start(db, { strategy: sb });
    const ra = runAutomation(A.app, created.sessionId).then((r) => r);
    const rb = runAutomation(B.app, created.sessionId).then((r) => r);
    // Review F-1: no sleep — release only when BOTH runs have loaded the same version and are waiting at the gate, so
    // neither can start after the other has finished (the old `['humanTurn','none']` flake is impossible here).
    await Promise.all([sa.reachedGate(1), sb.reachedGate(1)]);
    expect([sa.atGate, sb.atGate]).toEqual([1, 1]);
    gate.resolve();
    const bodies = (await Promise.all([ra, rb])).map((r) => {
      expect(r.status).toBe(200);
      return SessionCommandOkSchema.parse(r.body);
    });
    const reasons = bodies.map((x) => x.automation.stopReason).sort();
    expect(reasons).toEqual(['conflict', 'humanTurn']);
    const loser = bodies.find((x) => x.automation.stopReason === 'conflict');
    expect(loser?.automation.steps).toBe(0);
    const winner = bodies.find((x) => x.automation.stopReason === 'humanTurn');
    expect(winner?.automation.steps).toBe(3);
    const loserLogs = (loser === bodies[0] ? A : B).logs;
    expect(loserLogs.some((l) => l.level === 'warn' && l.line.includes('code=CONFLICT'))).toBe(
      true,
    );
    expect(loserLogs.some((l) => l.level === 'error')).toBe(false);

    const events = await expectConsecutive(A.app, created.sessionId);
    expect(events.filter((e) => e.type === 'BOT_MOVED')).toHaveLength(4);
    const get = SessionResponseSchema.parse(
      (await api(B.app).get(`/api/sessions/${created.sessionId}`)).body,
    );
    expect(get.automation).toEqual({ pending: false, strategy: 'openai' });
  });

  it('TC-LOOP-12 / Q-10: run endpoint — 404, 400 for any non-empty body, 422 for an unavailable game', async () => {
    const db = newDb();
    const { app } = await start(db);
    const created = await create(app);
    expectError(await runAutomation(app, 'unknown'), 404, 'NOT_FOUND', 'errors.sessionNotFound');
    expectError(
      await runAutomation(app, 'not a valid id!'),
      404,
      'NOT_FOUND',
      'errors.sessionNotFound',
    );
    for (const body of [{ steps: 100 }, { actor: 'p2' }, [], 'x']) {
      expectError(
        await runAutomation(app, created.sessionId, body),
        400,
        'VALIDATION',
        'errors.validation',
      );
    }
    const malformed = await api(app)
      .post(`/api/sessions/${created.sessionId}/automation/run`)
      .set('Content-Type', 'application/json')
      .send('{"steps":');
    expectError(malformed, 400, 'VALIDATION', 'errors.validation');
    expect(malformed.text).not.toMatch(/Unexpected|JSON at position|SyntaxError/);
    expect((await runOk(app, created.sessionId)).automation).toEqual(summary({}));
    expect((await runOk(app, created.sessionId, {})).automation).toEqual(summary({}));
    expect((await storedRow(app, created.sessionId)).version).toBe(1);

    // The same row seen by an app without the fake automated game → 422.
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    const other = await startApp(db.url, {
      gameModules: [fakeGameModule],
      gameDefinitions: [fakeGameDefinition],
    });
    apps.push(other);
    expectError(
      await runAutomation(other, created.sessionId, {}),
      422,
      'GAME_UNAVAILABLE',
      'errors.gameUnavailable',
    );
  });

  it('TC-PL-06: sessions without an automated participant — strategy null, steps 0 (fake game, not automated fake, hot-seat)', async () => {
    const db = newDb();
    const { module } = createFakeAutoGame();
    const app = await startApp(db.url, {
      gameModules: [module, fakeGameModule],
      gameDefinitions: [fakeGameDefinition, fakeAutoDefinition],
      idGenerator: sequentialIds('plain'),
    });
    apps.push(app);

    const plain = SessionResponseSchema.parse(
      (
        await api(app)
          .post('/api/sessions')
          .send({ gameId: FAKE_GAME_ID, setup: { start: 0 } })
      ).body,
    );
    expect(plain.automation).toEqual({ pending: false, strategy: null });
    const inc = await api(app)
      .post(`/api/sessions/${plain.sessionId}/commands`)
      .send({ actor: 'player', expectedVersion: 1, command: { type: 'INC' } });
    expect(SessionCommandOkSchema.parse(inc.body).automation).toEqual(NONE);
    expect((await runOk(app, plain.sessionId)).automation).toEqual(NONE);

    const manual = await create(app, { automated: false });
    expect(manual.automation).toEqual({ pending: false, strategy: null });
    const res = await commandOk(app, manual.sessionId, 1);
    expect(res.automation).toEqual(NONE);
    expect(view(res)).toMatchObject({ pending: 3, count: 0 });
    expect((await runOk(app, manual.sessionId)).automation).toEqual(NONE);
    expect((await storedRow(app, manual.sessionId)).version).toBe(2);

    // Real registry: a hot-seat core-v1 Rebellion session has no automated participant either.
    const real = await startApp(newDb().url);
    apps.push(real);
    const hs = SessionResponseSchema.parse(
      (await api(real).post('/api/sessions').send({ gameId: R, setup: HS_SETUP })).body,
    );
    expect(hs.automation).toEqual({ pending: false, strategy: null });
    const hsRun = await runOk(real, hs.sessionId);
    expect(hsRun.automation).toEqual(NONE);
    expect(AutomationRunSummarySchema.parse(hsRun.automation)).toEqual(NONE);
  });

  it('test-only automation overrides are refused in production (like the ai overrides)', async () => {
    await expect(
      createApp({
        config: testConfig({ nodeEnv: 'production', databaseUrl: 'file:./never-opened.db' }),
        automation: {},
        logger: false,
      }),
    ).rejects.toBeInstanceOf(ProductionOverridesError);
  });
});
