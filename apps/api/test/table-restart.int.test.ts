/**
 * SWR-010 FIX-QA2 — restart before the Location registration (AC-14; test-cases.md TC-RST-03).
 * A physical game, human Rebels vs AI Empire, on one SQLite FILE: app instance 1 creates it and is closed before
 * the registration; instance 2 on the same file restores the same view and table (registration still pending,
 * the AI still blocked: 0 steps, 0 paid calls), accepts the registration and the confirmation, and the AI Empire
 * resumes after the human's turn. Commander in OpenAI mode against a FAKE fetch (no network).
 */
import type { INestApplication } from '@nestjs/common';
import { REBELLION_ERROR_MESSAGE_KEYS as K } from '@bga/game-rebellion/schema';
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
  zoneTokens,
} from './support/physical-helpers';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

async function open(db: TestDb, id: string) {
  const fake = activatingCommander();
  const options: StartRebellionOptions = {
    ids: [id],
    fake,
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
    aiCommander: { provider: 'openai' },
  };
  const { app } = await startRebellionApp(db, options);
  apps.push(app);
  return { app, fake };
}

async function close(app: INestApplication) {
  apps.splice(apps.indexOf(app), 1);
  await app.close();
}

describe('TC-RST-03: restart before the Location registration (human Rebels, physical)', () => {
  it('same view/table after restart; registration still pending, AI blocked; registration then works; AI resumes after the confirmations', async () => {
    const db = createTestDb();
    dbs.push(db);
    const first = await open(db, 'rst03-reb-1');
    const { game, view: created } = await PhysicalGame.create(first.app, physicalVsAi('rebels'));
    expect(created.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup', 'registerBase']);
    expect(created.table?.registration).not.toBeNull();
    const firstRead = await game.get();
    const rowBefore = await storedRow(first.app, game.id);
    expect(first.fake.responses).toHaveLength(0);
    await close(first.app);

    // "Process" 2 on the same DB file.
    const second = await open(db, 'unused-id');
    const reopened = new PhysicalGame(second.app, game.id, 'rebels', game.version);
    const read = await reopened.get();
    expect(read.view).toEqual(firstRead.view);
    expect(read.automation).toEqual(firstRead.automation);
    expect(read.view.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup', 'registerBase']);
    expect(read.view.table?.registration?.eligibleDefinitionIds).toEqual(
      created.table?.registration?.eligibleDefinitionIds,
    );
    // The Rebels (human) open round 1, so `aiWaiting` is false; the block is checked via run / PASS below.
    expect(read.view.table?.aiWaiting).toBe(false);
    // Before the registration the stored base is only provisional (plan §5: moved by REGISTER_CARD) and the
    // Location zone is empty.
    const pending = await reopened.state();
    expect(pending.rebelBase.revealed).toBe(false);
    expect(zoneTokens(pending, 'rebels-location')).toEqual([]);
    const provisional = pending.rebelBase.systemId;
    // Reading does not rewrite the row.
    expect(await storedRow(second.app, game.id)).toEqual(rowBefore);

    // The AI stays blocked: run → 0 steps, no paid call, the row untouched; other commands still wait.
    const snapshot = await dbSnapshot(second.app, game.id);
    const idle = await reopened.run();
    expect(idle.summary).toMatchObject({ steps: 0, pending: false, stopReason: 'none' });
    expect(second.fake.responses).toHaveLength(0);
    expect(await dbSnapshot(second.app, game.id)).toEqual(snapshot);
    expectError(await reopened.post({ type: 'PASS' }), 422, 'ILLEGAL_COMMAND', K.tableSyncPending);

    // The registration after the restart works.
    const eligible = read.view.table?.registration?.eligibleDefinitionIds ?? [];
    // A system other than the provisional one: the registration also relocates the base units.
    const target = eligible
      .map((d) => d.replace(/^probe-/, ''))
      .find((s) => s !== provisional) as string;
    const registered = await reopened.send(registerCard(target));
    expect(lines(registered.events)).toEqual(['CARD_REGISTERED rebels']);
    expect(registered.view.rebelBase.systemId).toBe(target);
    expect(registered.view.table?.registration).toBeNull();
    expect(registered.view.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup']);
    const afterRegistration = await reopened.state();
    expect(afterRegistration.rebelBase).toEqual({ systemId: target, revealed: false });
    expect(zoneTokens(afterRegistration, 'rebels-location')).toContain(`probe-${target}`);
    expect(second.fake.responses).toHaveLength(0);

    // Setup confirmed → the human Rebels act; their PASS hands over to the AI Empire, which resumes.
    const confirmed = await reopened.send(confirmTask('t-1-1'));
    expect(confirmed.view.table?.tasks).toEqual([]);
    expect(second.fake.responses).toHaveLength(0);
    const passed = await reopened.send({ type: 'PASS' });
    expect(passed.summary.steps).toBeGreaterThanOrEqual(1);
    expect(second.fake.responses).toHaveLength(passed.summary.steps);
    expect(lines(passed.events)).toContain('SYSTEM_ACTIVATED empire');
    await expectConsecutiveEvents(second.app, game.id);
  });
});
