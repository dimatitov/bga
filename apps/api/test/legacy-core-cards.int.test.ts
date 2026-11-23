/**
 * SWR-010 W5 — legacy `core-v1` rows (created before cards existed) over HTTP (plan-backend §10.3 R4, AC-16;
 * test-cases.md OLD group at integration level). The stored SWR-005 seed `seed-reveal-7` (no `cards`, no
 * `table`) is inserted as an older server saved it:
 * - GET does not rewrite the row (state, version, status, timestamps, event rows) and answers `cards: null,
 *   table: null`;
 * - commands (incl. a base reveal and a Refresh) work as before; the stored state never gains `cards` / `table`;
 *   the Refresh has no `CARDS_DRAWN`.
 */
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomatedGame,
  coreSeed,
  insertStoredSession,
  seedRow,
  startRebellionApp,
} from './support/automation-helpers';
import { expectConsecutiveEvents, lines } from './support/core-fixtures';
import { dbSnapshot } from './support/fixtures';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

async function legacyApp() {
  const db = createTestDb();
  dbs.push(db);
  const { app } = await startRebellionApp(db);
  apps.push(app);
  const seed = coreSeed('ai-empire-before-reveal');
  expect('cards' in seed.state).toBe(false);
  expect('table' in seed.state).toBe(false);
  await insertStoredSession(app, seedRow(seed));
  return { app, seed, game: new AutomatedGame(app, seed.row.id, 'empire', seed.row.version) };
}

function storedHasNoCards(raw: string | null | undefined): void {
  const state = JSON.parse(raw ?? '{}') as Record<string, unknown>;
  expect('cards' in state).toBe(false);
  expect('table' in state).toBe(false);
}

describe('legacy core-v1 rows without cards (R4)', () => {
  it('GET answers cards / table null and does not rewrite the row', async () => {
    const { app, game } = await legacyApp();
    const before = await dbSnapshot(app, game.id);
    const read = await game.get();
    expect(read.view.cards).toBeNull();
    expect(read.view.table).toBeNull();
    expect(read.automation.pending).toBe(false);
    await game.get();
    expect(await dbSnapshot(app, game.id)).toEqual(before);
  });

  it('commands (reveal, Refresh) work as before; the stored state stays without cards; no CARDS_DRAWN', async () => {
    const { app, seed, game } = await legacyApp();
    for (const next of seed.nextCommands) {
      const reply = await game.send(next.command);
      expect(reply.view.cards).toBeNull();
      expect(reply.view.table).toBeNull();
      storedHasNoCards((await dbSnapshot(app, game.id)).session?.state);
    }
    expect((await game.state()).rebelBase.revealed).toBe(true);
    // Play on until a Refresh happened (the human passes whenever it is its turn).
    const allEvents: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const state = await game.state();
      if (state.outcome !== null || state.round > seed.state.round) break;
      const reply = await game.send({ type: 'PASS' });
      allEvents.push(...lines(reply.events));
    }
    expect(allEvents).toContain('TIME_ADVANCED system');
    expect(allEvents.some((l) => l.startsWith('CARDS_DRAWN'))).toBe(false);
    storedHasNoCards((await dbSnapshot(app, game.id)).session?.state);
    const events = await expectConsecutiveEvents(app, game.id);
    expect(events.some((e) => e.type.startsWith('CARD') || e.type.startsWith('TABLE'))).toBe(false);
  });
});
