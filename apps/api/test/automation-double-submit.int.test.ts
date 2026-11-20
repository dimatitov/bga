/**
 * SWR-006 W9 — double submit and racing requests against the real bot (AC-02, AC-07; PO п.8 item 6;
 * test-cases.md TC-CP-07, TC-CP-08, TC-CC-01 (real game), TC-CC-03, TC-CC-06).
 * Invariants after every race: exactly one of two identical commands is applied, the AI moves of a turn are stored
 * once (`SessionEvent` seq consecutive, mirrors the stored log, `version` continuous), never a 500, and the end
 * state equals an undisturbed game with the same session id (the bot is deterministic by `sessionId#version`).
 */
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomatedGame,
  empireVsAi,
  rebelsVsAi,
  startRebellionApp,
  type StartRebellionOptions,
} from './support/automation-helpers';
import { expectConsecutiveEvents, storedRow } from './support/core-fixtures';
import { R } from './support/fixtures';
import { api, createTestDb, removeTestDb, type TestDb } from './support/test-app';

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

async function rowOf(app: INestApplication, id: string) {
  const row = await storedRow(app, id);
  return { state: JSON.parse(row.state) as unknown, version: row.version };
}

/** After the human PASS of round 1 the AI Empire still has `pending` steps (created with maxSteps: 1, reopened). */
async function pendingGame(id: string) {
  const db = newDb();
  const first = await open(db, { ids: [id], aiCommander: { maxSteps: 1 } });
  const { game } = await AutomatedGame.create(first.app, rebelsVsAi('normal'));
  const passed = await game.send({ type: 'PASS' });
  expect(passed.summary).toMatchObject({ pending: true, stopReason: 'stepLimit' });
  apps.splice(apps.indexOf(first.app), 1);
  await first.app.close();
  const second = await open(db);
  return { app: second.app, game: new AutomatedGame(second.app, id, 'rebels', game.version) };
}

/** The same game without races: PASS, then the whole AI turn. */
async function undisturbed(id: string) {
  const { app } = await open(newDb(), { ids: [id] });
  const { game } = await AutomatedGame.create(app, rebelsVsAi('normal'));
  const reply = await game.send({ type: 'PASS' });
  return { row: await rowOf(app, id), steps: reply.summary.steps };
}

describe('SWR-006 W9: double submit and races with the real bot (AC-02)', () => {
  it('TC-CP-07: the same PASS twice in parallel with one expectedVersion → one 200 (with the AI turn), one 409; the AI turn is stored once', async () => {
    const id = 'swr006-w9-double-1';
    const { app } = await open(newDb(), { ids: [id] });
    const { game } = await AutomatedGame.create(app, rebelsVsAi('normal'));
    const [a, b] = await Promise.all([
      game.post({ type: 'PASS' }, 1),
      game.post({ type: 'PASS' }, 1),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ok = (a.status === 200 ? a : b).body as {
      automation: { steps: number; stopReason: string };
    };
    expect(ok.automation.stopReason).toBe('humanTurn');
    expect(ok.automation.steps).toBeGreaterThan(1);
    const events = await expectConsecutiveEvents(app, id);
    const row = await rowOf(app, id);
    expect(row.version).toBe(1 + 1 + ok.automation.steps);
    // Each AI step = one engine command = SYSTEM_ACTIVATED / PIECES_MOVED / ACTIVATION_FINISHED / PASSED (+ system events).
    const aiCommands = events.filter(
      (e) =>
        e.actor === 'empire' &&
        ['SYSTEM_ACTIVATED', 'PIECES_MOVED', 'ACTIVATION_FINISHED', 'PASSED'].includes(e.type),
    );
    expect(aiCommands).toHaveLength(ok.automation.steps);
    expect(events.filter((e) => e.actor === 'rebels' && e.type === 'PASSED')).toHaveLength(1);
    expect(row).toEqual((await undisturbed(id)).row);
  });

  it("TC-CP-08: POST /api/sessions twice with one Idempotency-Key (Empire vs AI) → same session; the AI Rebels' first moves are not repeated", async () => {
    const id = 'swr006-w9-idem-1';
    const { app } = await open(newDb(), { ids: [id, 'swr006-w9-idem-2'] });
    const send = () =>
      api(app)
        .post('/api/sessions')
        .set('Idempotency-Key', '6f1c2a3e-9b7d-4e21-8a5f-0c4d2b1e9a77')
        .send({ gameId: R, setup: empireVsAi('normal') });
    const first = await send();
    expect(first.status).toBe(201);
    const before = await rowOf(app, id);
    const eventsBefore = await expectConsecutiveEvents(app, id);
    expect(before.version).toBeGreaterThan(1);
    expect(eventsBefore.some((e) => e.actor === 'rebels')).toBe(true);
    const second = await send();
    expect(second.status).toBe(200); // idempotent replay (SWR-004)
    expect(second.body.sessionId).toBe(id);
    expect(second.body.automation).toEqual({ pending: false, strategy: 'bot' });
    expect(await rowOf(app, id)).toEqual(before);
    expect(await expectConsecutiveEvents(app, id)).toEqual(eventsBefore);
  });

  it('TC-CC-01 (real bot) / Q-5: two parallel runs on a pending AI turn → every step once; one run does all, the other finds nothing', async () => {
    const id = 'swr006-w9-race-1';
    const { app, game } = await pendingGame(id);
    const v0 = game.version;
    const [a, b] = await Promise.all([game.runRaw(), game.runRaw()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const sa = (a.body as { automation: { steps: number } }).automation;
    const sb = (b.body as { automation: { steps: number } }).automation;
    const total = sa.steps + sb.steps;
    expect(Math.min(sa.steps, sb.steps)).toBe(0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect((a.body as { view: unknown }).view).toEqual((b.body as { view: unknown }).view);
    const row = await rowOf(app, id);
    expect(row.version).toBe(v0 + total);
    await expectConsecutiveEvents(app, id);
    const ref = await undisturbed(id);
    expect(row).toEqual(ref.row);
    expect(total).toBe(ref.steps - 1);
  });

  it('TC-CC-03: a run racing a human command on a pending AI turn → the human gets 409 / 422 notYourTurn, never both applied', async () => {
    const id = 'swr006-w9-race-2';
    const { app, game } = await pendingGame(id);
    const v0 = game.version;
    const [run, human] = await Promise.all([game.runRaw(), game.post({ type: 'PASS' }, v0)]);
    expect(run.status).toBe(200);
    expect([409, 422]).toContain(human.status);
    if (human.status === 422) {
      expect((human.body as { error: { messageKey: string } }).error.messageKey).toBe(
        'errors.notYourTurn',
      );
    }
    await expectConsecutiveEvents(app, id);
    expect(await rowOf(app, id)).toEqual((await undisturbed(id)).row);
  });

  it('TC-CC-06: stress — every human turn of a whole game sent twice in parallel together with two runs → no 500, no duplicates, same game as undisturbed', async () => {
    const id = 'swr006-w9-stress-1';
    const { app } = await open(newDb(), { ids: [id] });
    const { game } = await AutomatedGame.create(app, rebelsVsAi('normal'));
    const statuses: number[] = [];
    for (let turn = 0; turn < 20; turn += 1) {
      const state = await game.state();
      if (state.outcome !== null) break;
      const v = state.version;
      const replies = await Promise.all([
        game.post({ type: 'PASS' }, v),
        game.runRaw(),
        game.post({ type: 'PASS' }, v),
        game.runRaw(),
      ]);
      statuses.push(...replies.map((r) => r.status));
      const commands = [replies[0], replies[2]].map((r) => r?.status);
      expect(commands.filter((s) => s === 200)).toHaveLength(1);
      // A duplicate that reads the state after the winning command ended the game gets 422 gameOver (checked before
      // the version, core apply order) — with the synchronous SQLite driver (SWR-007) this is the usual order on the
      // last turn. Either way exactly one PASS is applied.
      const rejectedOk = (r: (typeof replies)[number] | undefined) =>
        r?.status === 409 ||
        (r?.status === 422 &&
          (r.body as { error?: { messageKey?: string } }).error?.messageKey === 'errors.gameOver');
      expect([replies[0], replies[2]].every((r) => r?.status === 200 || rejectedOk(r))).toBe(true);
      expect(replies[1]?.status).toBe(200);
      expect(replies[3]?.status).toBe(200);
      await expectConsecutiveEvents(app, id);
    }
    expect(statuses).not.toContain(500);
    const final = await game.state();
    expect(final.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    // The undisturbed game: 13 single passes.
    const { app: refApp } = await open(newDb(), { ids: [id] });
    const { game: ref } = await AutomatedGame.create(refApp, rebelsVsAi('normal'));
    for (let i = 0; i < 13; i += 1) await ref.send({ type: 'PASS' });
    expect(await rowOf(app, id)).toEqual(await rowOf(refApp, id));
  }, 60_000);
});
