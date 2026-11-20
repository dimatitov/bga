/**
 * SWR-006 W9 — restart of the server in the middle of an automated turn (D-PO-6, AC-07; PO п.8 item 11;
 * test-cases.md TC-RS-01, TC-RS-02, TC-RS-03, TC-RS-04, TC-LOOP-04, TC-LOOP-05, TC-LOOP-11).
 * Real Rebellion (registered module, real bot) on one SQLite FILE shared by two app instances started one after the
 * other ("process" 1 is closed before "process" 2 starts). The interrupted run must leave `automation.pending: true`
 * in the stored session; the new instance reports it on GET and `POST …/automation/run` finishes the turn with the
 * SAME decisions as an uninterrupted game (reference: a separate DB, same session id, same frozen clock).
 */
import type { INestApplication } from '@nestjs/common';
import type { ServerGameModule } from '@bga/platform';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomatedGame,
  empireVsAi,
  rebelsVsAi,
  startRebellionApp,
  stepLogs,
  type StartRebellionOptions,
} from './support/automation-helpers';
import { expectConsecutiveEvents, storedRow } from './support/core-fixtures';
import { huntingEmpire, passiveHuman, type HumanScript } from './support/scripted-empire';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

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

async function open(db: TestDb, options: StartRebellionOptions = {}) {
  const started = await startRebellionApp(db, options);
  apps.push(started.app);
  return started;
}

async function close(app: INestApplication) {
  apps.splice(apps.indexOf(app), 1);
  await app.close();
}

/** The stored row + event rows (without timestamps / autoincrement ids) of a session. */
async function snapshot(app: INestApplication, sessionId: string) {
  const row = await storedRow(app, sessionId);
  const game = new AutomatedGame(app, sessionId, 'rebels', row.version);
  return {
    state: JSON.parse(row.state) as unknown,
    version: row.version,
    status: row.status,
    events: await game.events(),
  };
}

/** A reference game without any interruption: the human script applied `humanCommands` times. */
async function reference(
  sessionId: string,
  setup: ReturnType<typeof rebelsVsAi>,
  human: HumanScript,
  humanCommands: number,
) {
  const { app } = await open(newDb(), { ids: [sessionId] });
  const { game } = await AutomatedGame.create(app, setup);
  for (let i = 0; i < humanCommands; i += 1) await game.send(human(await game.state()));
  return snapshot(app, sessionId);
}

/** The registered Rebellion module whose automated steps fail (engine rejection) from the (k+1)-th call on. */
function failingAfter(k: number): ServerGameModule {
  const automation = rebellionServerModule.automation;
  if (!automation) throw new Error('no automation');
  let calls = 0;
  return {
    ...rebellionServerModule,
    automation: {
      isAutomated: (s) => automation.isAutomated(s),
      pendingActor: (s) => automation.pendingActor(s),
      decisionPoint: (s) => automation.decisionPoint(s),
      applyCandidate: (s, id, ctx) => {
        calls += 1;
        if (calls > k) {
          return {
            ok: false,
            error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.testInjectedFailure' },
          };
        }
        return automation.applyCandidate(s, id, ctx);
      },
    },
  };
}

describe('SWR-006 W9: restart in the middle of an automated turn (D-PO-6)', () => {
  it('TC-RS-01 / TC-RS-04 / TC-LOOP-04 / TC-LOOP-05 / TC-LOOP-11: step limit → pending survives a restart; run on the new instance finishes the turn like an uninterrupted game', async () => {
    const id = 'swr006-w9-restart-1';
    const db = newDb();
    // "Process" 1: AI_COMMANDER_MAX_STEPS=1.
    const first = await open(db, { ids: [id], aiCommander: { maxSteps: 1 } });
    const { game, automation } = await AutomatedGame.create(first.app, rebelsVsAi('normal'));
    expect(automation).toEqual({ pending: false, strategy: 'bot' });
    expect(game.version).toBe(1);
    const passed = await game.send({ type: 'PASS' });
    expect(passed.summary).toEqual({
      steps: 1,
      pending: true,
      strategy: 'bot',
      fallbacks: 0,
      fallbackReasons: [],
      stopReason: 'stepLimit',
    });
    expect(passed.view.version).toBe(3); // the human PASS + exactly one AI step
    expect((await game.get()).automation).toEqual({ pending: true, strategy: 'bot' });
    const interruptedVersion = game.version;
    await close(first.app);

    // "Process" 2: default config (64 steps) on the same DB file.
    const second = await open(db);
    const resumed = new AutomatedGame(second.app, id, 'rebels', interruptedVersion);
    const got = await resumed.get();
    expect(got.automation).toEqual({ pending: true, strategy: 'bot' });
    expect(got.view.version).toBe(interruptedVersion);

    // TC-RS-04: the same command with the same expectedVersion after the restart → 409, the AI does not move.
    const before = await snapshot(second.app, id);
    const replay = await resumed.post({ type: 'PASS' }, 1);
    expect(replay.status).toBe(409);
    expect(await snapshot(second.app, id)).toEqual(before);

    const run = await resumed.run();
    expect(run.summary).toMatchObject({
      pending: false,
      strategy: 'bot',
      stopReason: 'humanTurn',
      fallbacks: 0,
    });
    expect(run.summary.steps).toBeGreaterThan(0);
    expect(run.view.activeSide).toBe('rebels');
    expect(run.events.length).toBeGreaterThan(0);
    expect(run.events.every((e) => e.actor === 'empire' || e.actor === 'system')).toBe(true);
    expect((await resumed.get()).automation).toEqual({ pending: false, strategy: 'bot' });
    expect(stepLogs(second.automationLogs)).toHaveLength(run.summary.steps);

    // TC-LOOP-11: run again → nothing to do, nothing changes (×3).
    const settled = await snapshot(second.app, id);
    for (let i = 0; i < 3; i += 1) {
      const again = await resumed.run();
      expect(again.summary).toEqual({
        steps: 0,
        pending: false,
        strategy: 'bot',
        fallbacks: 0,
        fallbackReasons: [],
        stopReason: 'none',
      });
      expect(again.events).toEqual([]);
    }
    expect(await snapshot(second.app, id)).toEqual(settled);
    await expectConsecutiveEvents(second.app, id);

    // TC-LOOP-05: the interruption changed no decision.
    expect(settled).toEqual(await reference(id, rebelsVsAi('normal'), passiveHuman, 1));
  });

  it('TC-RS-02: automated steps fail after 2 steps (error, pending) → 2 steps are committed; the new instance continues from the 3rd', async () => {
    const id = 'swr006-w9-restart-2';
    const db = newDb();
    const first = await open(db, { ids: [id], gameModules: [failingAfter(2)] });
    const { game } = await AutomatedGame.create(first.app, rebelsVsAi('normal'));
    const passed = await game.send({ type: 'PASS' });
    // 200 with the human command stored; 2 committed steps; the 3rd was rejected (and its bot retry too).
    expect(passed.summary).toMatchObject({ steps: 2, pending: true, stopReason: 'error' });
    expect(passed.view.version).toBe(1 + 1 + 2);
    expect(
      first.automationLogs.some(
        (l) => l.level === 'error' && l.line.includes('code=ENGINE_REJECTED'),
      ),
    ).toBe(true);
    await close(first.app);

    const second = await open(db);
    const resumed = new AutomatedGame(second.app, id, 'rebels', 4);
    expect((await resumed.get()).automation).toEqual({ pending: true, strategy: 'bot' });
    const run = await resumed.run();
    expect(run.summary).toMatchObject({ pending: false, stopReason: 'humanTurn' });
    expect(stepLogs(second.automationLogs)[0]?.step).toBe(1);
    await expectConsecutiveEvents(second.app, id);
    expect(await snapshot(second.app, id)).toEqual(
      await reference(id, rebelsVsAi('normal'), passiveHuman, 1),
    );
  });

  it('TC-RS-03: a game interrupted by a restart between turns continues identically (Rebels vs AI 3+2 rounds; Empire vs AI 3+2 commands)', async () => {
    const cases = [
      { id: 'swr006-w9-restart-3', setup: rebelsVsAi('normal'), human: passiveHuman },
      { id: 'swr006-w9-restart-4', setup: empireVsAi('easy'), human: huntingEmpire },
    ];
    for (const c of cases) {
      const db = newDb();
      const first = await open(db, { ids: [c.id] });
      const { game } = await AutomatedGame.create(first.app, c.setup);
      for (let i = 0; i < 3; i += 1) await game.send(c.human(await game.state()));
      const mid = game.version;
      await close(first.app);

      const second = await open(db);
      const resumed = new AutomatedGame(second.app, c.id, c.setup.playerFaction, mid);
      const got = await resumed.get();
      expect(got.automation).toEqual({ pending: false, strategy: 'bot' });
      expect(got.view.version).toBe(mid);
      for (let i = 0; i < 2; i += 1) {
        const reply = await resumed.send(c.human(await resumed.state()));
        expect(['humanTurn', 'none', 'gameOver']).toContain(reply.summary.stopReason);
      }
      await expectConsecutiveEvents(second.app, c.id);
      expect(await snapshot(second.app, c.id)).toEqual(await reference(c.id, c.setup, c.human, 5));
    }
  });
});
