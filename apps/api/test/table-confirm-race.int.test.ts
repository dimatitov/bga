/**
 * SWR-010 FIX-QA2 — concurrent `CONFIRM_TABLE_TASK` over HTTP (AC-12; PO G-10; test-cases.md TC-CF-07, TC-CF-08).
 * Real Rebellion module, real runner, the commander in OpenAI mode against a FAKE fetch (no network): the number
 * of fake requests is the number of paid strategy calls. Scheme of `automation-double-submit.int.test.ts`:
 * `Promise.all` of identical envelopes on one app / one SQLite file.
 * Invariants after every race: exactly one request applied (200), the other 409 / 422, never 500; exactly one
 * `TABLE_TASK_CONFIRMED` for the task; `version` advanced by 1 (+ the AI steps of the winner only); event rows
 * consecutive; the AI turn after the confirmation is played (and paid) once; the end state equals a sequential run
 * with the same session ids on another DB (frozen clock, deterministic commander fake).
 */
import type { INestApplication } from '@nestjs/common';
import { REBELLION_ERROR_MESSAGE_KEYS as K } from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { startRebellionApp, type StartRebellionOptions } from './support/automation-helpers';
import { expectConsecutiveEvents, storedRow } from './support/core-fixtures';
import { enabledOpenAI } from './support/openai-fake-fetch';
import {
  PhysicalGame,
  activatingCommander,
  confirmTask,
  physicalVsAi,
  registerCard,
} from './support/physical-helpers';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

async function open(ids: string[]) {
  const db = createTestDb();
  dbs.push(db);
  const fake = activatingCommander();
  const options: StartRebellionOptions = {
    ids,
    fake,
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
    aiCommander: { provider: 'openai' },
  };
  const { app } = await startRebellionApp(db, options);
  apps.push(app);
  return { app, fake };
}

async function rowOf(app: INestApplication, id: string) {
  const row = await storedRow(app, id);
  return { state: JSON.parse(row.state) as unknown, version: row.version };
}

type Reply = { status: number; body: unknown };

const messageKey = (r: Reply) =>
  (r.body as { error?: { messageKey?: string } }).error?.messageKey ?? null;

/** Exactly one 200; the loser is 409 (stale version) or 422 with one of `keys`; never 500. */
function expectOneWinner(replies: Reply[], keys: string[]): Reply {
  const statuses = replies.map((r) => r.status);
  expect(statuses, JSON.stringify(replies.map((r) => r.body))).not.toContain(500);
  const winners = replies.filter((r) => r.status === 200);
  expect(winners).toHaveLength(1);
  for (const loser of replies.filter((r) => r.status !== 200)) {
    expect([409, 422]).toContain(loser.status);
    if (loser.status === 422) expect(keys).toContain(messageKey(loser));
  }
  return winners[0] as Reply;
}

const REPEATS = 20;
const ids = (prefix: string) =>
  Array.from({ length: REPEATS }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);

describe('TC-CF-07: two parallel CONFIRM of the same head task (queue [T1, T2], human Rebels)', () => {
  it(`×${REPEATS}: one 200, the other 409/422; one TABLE_TASK_CONFIRMED; version +1; no AI call; = sequential run`, async () => {
    const sessionIds = ids('cf07');
    const { app, fake } = await open(sessionIds);
    const ref = await open(sessionIds);

    for (const id of sessionIds) {
      const { game, view } = await PhysicalGame.create(app, physicalVsAi('rebels'));
      expect(game.id).toBe(id);
      // Queue [T1 = initialSetup (confirm), T2 = registerBase (register)].
      expect(view.table?.tasks.map((t) => [t.id, t.kind])).toEqual([
        ['t-1-1', 'initialSetup'],
        ['t-1-2', 'registerBase'],
      ]);
      const v = game.version;
      const replies = await Promise.all([
        game.post(confirmTask('t-1-1'), v),
        game.post(confirmTask('t-1-1'), v),
      ]);
      expectOneWinner(replies, [K.tableTaskNotFound]);

      const state = await game.state();
      const row = await storedRow(app, id);
      expect(row.version).toBe(v + 1);
      expect(state.table?.tasks.map((t) => t.id)).toEqual(['t-1-2']);
      const events = await expectConsecutiveEvents(app, id);
      const confirmed = events.filter((e) => e.type === 'TABLE_TASK_CONFIRMED');
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0]?.payload).toMatchObject({ taskId: 't-1-1' });

      // The same game without the race (same id → same base, same deck order).
      const { game: seq } = await PhysicalGame.create(ref.app, physicalVsAi('rebels'));
      expect(seq.id).toBe(id);
      await seq.send(confirmTask('t-1-1'));
      expect(await rowOf(app, id)).toEqual(await rowOf(ref.app, id));
    }
    // The AI Empire is not to move before the registration: no paid call at all.
    expect(fake.responses).toHaveLength(0);
    expect(ref.fake.responses).toHaveLength(0);
  }, 60_000);

  it(`×${REPEATS} head + next task in parallel (one expectedVersion): CONFIRM(T1) ‖ CONFIRM(T2) and CONFIRM(T1) ‖ REGISTER_CARD → exactly one applied`, async () => {
    const sessionIds = ids('cf07-next');
    const { app, fake } = await open(sessionIds);

    for (const [i, id] of sessionIds.entries()) {
      const { game, view } = await PhysicalGame.create(app, physicalVsAi('rebels'));
      expect(game.id).toBe(id);
      const v = game.version;
      const before = await expectConsecutiveEvents(app, id);
      if (i % 2 === 0) {
        // T2 (registerBase) is never confirmable: it loses with 409 or 422 tableTaskNotHead / tableTaskNotFound.
        const replies = await Promise.all([
          game.post(confirmTask('t-1-2'), v),
          game.post(confirmTask('t-1-1'), v),
        ]);
        const winner = expectOneWinner(replies, [K.tableTaskNotHead, K.tableTaskNotFound]);
        expect(winner).toBe(replies[1]);
        const state = await game.state();
        expect(state.table?.tasks.map((t) => t.id)).toEqual(['t-1-2']);
        expect(state.table?.baseRegistration).not.toBeNull();
      } else {
        // The confirmation of the head and the registration of T2 with the same version: one wins, one 409.
        const target = (view.table?.registration?.eligibleDefinitionIds[0] as string).replace(
          /^probe-/,
          '',
        );
        const replies = await Promise.all([
          game.post(confirmTask('t-1-1'), v),
          game.post(registerCard(target), v),
        ]);
        const winner = expectOneWinner(replies, []);
        const state = await game.state();
        if (winner === replies[0]) {
          expect(state.table?.tasks.map((t) => t.id)).toEqual(['t-1-2']);
          expect(state.table?.baseRegistration).not.toBeNull();
        } else {
          expect(state.table?.tasks.map((t) => t.id)).toEqual(['t-1-1']);
          expect(state.table?.baseRegistration).toBeNull();
          expect(state.rebelBase.systemId).toBe(target);
        }
      }
      expect((await storedRow(app, id)).version).toBe(v + 1);
      const events = await expectConsecutiveEvents(app, id);
      expect(events).toHaveLength(before.length + 1);
    }
    expect(fake.responses).toHaveLength(0);
  }, 60_000);
});

describe('TC-CF-08: two parallel CONFIRM of the last task, after which the AI moves (human Empire)', () => {
  it(`×${REPEATS}: the AI turn after the confirmation runs exactly once (no duplicate AI moves / paid calls); = sequential run`, async () => {
    const sessionIds = ids('cf08');
    const { app, fake } = await open(sessionIds);
    const ref = await open(sessionIds);

    for (const id of sessionIds) {
      const { game, view } = await PhysicalGame.create(app, physicalVsAi('empire'));
      expect(game.id).toBe(id);
      expect(view.table?.tasks.map((t) => t.id)).toEqual(['t-1-1']);
      const v = game.version;
      const callsBefore = fake.responses.length;
      const replies = await Promise.all([
        game.post(confirmTask('t-1-1'), v),
        game.post(confirmTask('t-1-1'), v),
      ]);
      const winner = expectOneWinner(replies, [K.tableTaskNotFound]);
      const summary = (winner.body as { automation: { steps: number; stopReason: string } })
        .automation;
      // The activating commander makes the AI Rebels activate → an aiActivation task blocks after one step.
      expect(summary).toMatchObject({ steps: 1, stopReason: 'humanTurn' });
      expect(fake.responses.length - callsBefore).toBe(summary.steps);

      const row = await storedRow(app, id);
      expect(row.version).toBe(v + 1 + summary.steps);
      const events = await expectConsecutiveEvents(app, id);
      expect(events.filter((e) => e.type === 'TABLE_TASK_CONFIRMED')).toHaveLength(1);
      const aiCommands = events.filter(
        (e) =>
          e.actor === 'rebels' &&
          ['SYSTEM_ACTIVATED', 'PIECES_MOVED', 'ACTIVATION_FINISHED', 'PASSED'].includes(e.type),
      );
      expect(aiCommands).toHaveLength(summary.steps);
      const state = await game.state();
      expect(state.table?.tasks.map((t) => t.kind)).toEqual(['aiActivation']);

      const refCalls = ref.fake.responses.length;
      const { game: seq } = await PhysicalGame.create(ref.app, physicalVsAi('empire'));
      expect(seq.id).toBe(id);
      const seqOk = await seq.send(confirmTask('t-1-1'));
      expect(seqOk.summary.steps).toBe(summary.steps);
      expect(ref.fake.responses.length - refCalls).toBe(summary.steps);
      expect(await rowOf(app, id)).toEqual(await rowOf(ref.app, id));
    }
    expect(fake.responses).toHaveLength(REPEATS);
  }, 120_000);
});
