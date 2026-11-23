/**
 * SWR-010 W5 — Physical Sync v0 over HTTP (plan-backend §5.4–§5.7, §9; AC-10, AC-12, AC-13, AC-14, AC-17;
 * test-cases.md AI / BL / RST / RP groups at integration level). Real Rebellion module, real runner, the
 * commander in OpenAI mode against a FAKE fetch (no network): the number of fake requests is the number of paid
 * strategy calls.
 * - a pending table task blocks the runner: 0 steps, 0 commander calls, `pending: false`; other game commands →
 *   422 `tableSyncPending`; the AI resumes in the same response as the last confirmation;
 * - `CONFIRM_TABLE_TASK` / `REGISTER_CARD` over HTTP incl. the repeat: stale version → 409, fresh → 422;
 * - restart: a new app instance on the same DB file restores the table (GET), the AI still waits;
 * - replay: the same commands on two DBs give byte-equal stored states (cards, table).
 */
import type { INestApplication } from '@nestjs/common';
import {
  REBELLION_CARD_CATALOG,
  REBELLION_ERROR_MESSAGE_KEYS as K,
} from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { startRebellionApp, type StartRebellionOptions } from './support/automation-helpers';
import { expectConsecutiveEvents, lines, storedRow } from './support/core-fixtures';
import { dbSnapshot, expectError } from './support/fixtures';
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

function newDb(): TestDb {
  const db = createTestDb();
  dbs.push(db);
  return db;
}

async function open(db: TestDb, id: string, fake = activatingCommander()) {
  const options: StartRebellionOptions = {
    ids: [id],
    fake,
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
    aiCommander: { provider: 'openai' },
  };
  const started = await startRebellionApp(db, options);
  apps.push(started.app);
  return { ...started, fake };
}

async function close(app: INestApplication) {
  apps.splice(apps.indexOf(app), 1);
  await app.close();
}

describe('human Empire vs AI Rebels (physical): the AI waits for every confirmation', () => {
  it('initial setup blocks the runner; CONFIRM lets the AI act in the same response; its task blocks again', async () => {
    const { app, fake } = await open(newDb(), 'w5-phys-emp-1');
    const { game, view, automation } = await PhysicalGame.create(app, physicalVsAi('empire'));
    // Created with the initial setup task: the runner made 0 steps, no paid call, nothing pending.
    expect(view.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup']);
    expect(view.table?.aiWaiting).toBe(true);
    expect(automation.pending).toBe(false);
    expect(fake.responses).toHaveLength(0);
    expect(view.version).toBe(1);

    // automation/run while blocked: 0 steps, `none`, still no paid call; the row is untouched.
    const before = await dbSnapshot(app, game.id);
    const idle = await game.run();
    expect(idle.summary).toMatchObject({ steps: 0, pending: false, stopReason: 'none' });
    expect(fake.responses).toHaveLength(0);
    expect(await dbSnapshot(app, game.id)).toEqual(before);

    // A game command of the human while a task is pending → 422 tableSyncPending (the Empire is not to move
    // anyway, but the table check comes first: plan §5.5).
    expectError(await game.post({ type: 'PASS' }), 422, 'ILLEGAL_COMMAND', K.tableSyncPending);

    // Confirm the last task → the AI Rebels act in the SAME response; the commander picks an activation, which
    // creates an aiActivation task → the runner stops with `humanTurn` after exactly one step.
    const confirmed = await game.send(confirmTask('t-1-1'));
    expect(lines(confirmed.events)[0]).toBe('TABLE_TASK_CONFIRMED empire');
    expect(confirmed.summary).toMatchObject({
      steps: 1,
      pending: false,
      strategy: 'openai',
      fallbacks: 0,
      stopReason: 'humanTurn',
    });
    expect(fake.responses).toHaveLength(1);
    expect(lines(confirmed.events)).toContain('SYSTEM_ACTIVATED rebels');
    expect(confirmed.view.table?.tasks.map((t) => t.kind)).toEqual(['aiActivation']);
    expect(confirmed.view.table?.aiWaiting).toBe(true);

    // Blocked again: run → 0 steps, no new call.
    const blocked = await game.run();
    expect(blocked.summary).toMatchObject({ steps: 0, pending: false, stopReason: 'none' });
    expect(fake.responses).toHaveLength(1);

    // GET: the same table, `pending: false` (the client does not call automation/run).
    const read = await game.get();
    expect(read.view.table).toEqual(confirmed.view.table);
    expect(read.automation.pending).toBe(false);

    // Confirm → the AI continues in the same response (one more commander call per AI step).
    const head = confirmed.view.table?.tasks[0]?.id as string;
    const resumed = await game.send(confirmTask(head));
    expect(resumed.summary.steps).toBeGreaterThanOrEqual(1);
    expect(fake.responses).toHaveLength(1 + resumed.summary.steps);
    await expectConsecutiveEvents(app, game.id);
  });

  it('CONFIRM repeat: stale expectedVersion → 409; fresh version → 422 tableTaskNotFound; nothing changes', async () => {
    const { app } = await open(newDb(), 'w5-phys-emp-2');
    const { game } = await PhysicalGame.create(app, physicalVsAi('empire'));
    const v1 = game.version;
    await game.send(confirmTask('t-1-1'));
    const snapshot = await dbSnapshot(app, game.id);
    expectError(await game.post(confirmTask('t-1-1'), v1), 409, 'VERSION_CONFLICT');
    const notFound = expectError(
      await game.post(confirmTask('t-1-1')),
      422,
      'ILLEGAL_COMMAND',
      K.tableTaskNotFound,
    );
    // details only echo the request (plan §5.5).
    expect(notFound.error.details).toEqual({ taskId: 't-1-1' });
    expect(await dbSnapshot(app, game.id)).toEqual(snapshot);
  });

  it('restart: a new app instance on the same DB restores the table; the AI still waits until the confirmation', async () => {
    const db = newDb();
    const first = await open(db, 'w5-phys-emp-3');
    const { game } = await PhysicalGame.create(first.app, physicalVsAi('empire'));
    const confirmed = await game.send(confirmTask('t-1-1'));
    expect(confirmed.view.table?.tasks).toHaveLength(1);
    const rowBefore = await storedRow(first.app, game.id);
    await close(first.app);

    const second = await open(db, 'unused-id');
    const reopened = new PhysicalGame(second.app, game.id, 'empire', game.version);
    const read = await reopened.get();
    expect(read.view).toEqual(confirmed.view);
    expect(read.automation.pending).toBe(false);
    // Reading does not rewrite the row.
    expect(await storedRow(second.app, game.id)).toEqual(rowBefore);
    const idle = await reopened.run();
    expect(idle.summary.steps).toBe(0);
    expect(second.fake.responses).toHaveLength(0);
    const head = read.view.table?.tasks[0]?.id as string;
    const resumed = await reopened.send(confirmTask(head));
    expect(resumed.summary.steps).toBeGreaterThanOrEqual(1);
    expect(second.fake.responses).toHaveLength(resumed.summary.steps);
  });
});

describe('human Rebels vs AI Empire (physical): Location registration', () => {
  it('REGISTER_CARD over HTTP: errors echo the request; success; repeat → 409 / 422 registrationUnavailable', async () => {
    const { app, fake } = await open(newDb(), 'w5-phys-reb-1');
    const { game, view } = await PhysicalGame.create(app, physicalVsAi('rebels'));
    expect(view.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup', 'registerBase']);
    const eligible = view.table?.registration?.eligibleDefinitionIds ?? [];
    expect(eligible).toHaveLength(9);
    // Other game commands wait for the table.
    expectError(await game.post({ type: 'PASS' }), 422, 'ILLEGAL_COMMAND', K.tableSyncPending);
    // The head is the setup task; registerBase cannot be confirmed.
    expectError(await game.post(confirmTask('t-1-2')), 422, 'ILLEGAL_COMMAND', K.tableTaskNotHead);
    // Unknown card / a probe card of a system that cannot hold the base.
    const unknown = expectError(
      await game.post({
        type: 'REGISTER_CARD',
        zoneId: 'rebels-location',
        definitionId: 'probe-nowhere',
      }),
      422,
      'ILLEGAL_COMMAND',
      K.unknownCard,
    );
    expect(JSON.stringify(unknown)).not.toContain('"probe-deck"');
    const ineligible = REBELLION_CARD_CATALOG.cards.find(
      (c) => c.typeId === 'probe' && !eligible.includes(c.id),
    )?.id as string;
    expectError(
      await game.post({
        type: 'REGISTER_CARD',
        zoneId: 'rebels-location',
        definitionId: ineligible,
      }),
      422,
      'ILLEGAL_COMMAND',
      K.cardNotEligible,
    );
    expect(fake.responses).toHaveLength(0);

    // Register at any queue position (AQ-7): the second eligible system.
    const target = (eligible[1] as string).replace(/^probe-/, '');
    const v = game.version;
    const registered = await game.send(registerCard(target));
    expect(lines(registered.events)).toEqual(['CARD_REGISTERED rebels']);
    expect(registered.view.rebelBase.systemId).toBe(target);
    expect(registered.view.table?.registration).toBeNull();
    expect(registered.view.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup']);
    expect((await game.state()).rebelBase.systemId).toBe(target);

    expectError(await game.post(registerCard(target), v), 409, 'VERSION_CONFLICT');
    expectError(
      await game.post(registerCard(target)),
      422,
      'ILLEGAL_COMMAND',
      K.registrationUnavailable,
    );

    // Setup confirmed → the human Rebels act; their PASS hands over to the AI Empire, which plays.
    await game.send(confirmTask('t-1-1'));
    expect((await game.state()).table?.tasks).toEqual([]);
    const passed = await game.send({ type: 'PASS' });
    expect(passed.summary.steps).toBeGreaterThanOrEqual(1);
    expect(fake.responses.length).toBe(passed.summary.steps);
    await expectConsecutiveEvents(app, game.id);
  });
});

describe('replay determinism over HTTP (AC-17)', () => {
  it('the same session id and the same commands on two DBs give byte-equal stored states (cards, table)', async () => {
    async function play(db: TestDb) {
      const { app } = await open(db, 'w5-phys-replay');
      const { game } = await PhysicalGame.create(app, physicalVsAi('empire'));
      await game.send(confirmTask('t-1-1'));
      for (let i = 0; i < 6; i += 1) {
        const state = await game.state();
        if (state.outcome !== null) break;
        const head = state.table?.tasks[0];
        if (head) await game.send(confirmTask(head.id));
        else if (state.activeSide === 'empire') await game.send({ type: 'PASS' });
      }
      const row = await storedRow(app, game.id);
      return { state: row.state, version: row.version };
    }
    const a = await play(newDb());
    const b = await play(newDb());
    expect(b).toEqual(a);
    const parsed = JSON.parse(a.state) as { cards?: unknown; table?: unknown };
    expect(parsed.cards).toBeDefined();
    expect(parsed.table).toBeDefined();
  });
});
