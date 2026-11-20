/**
 * SWR-006 W9 — determinism of the automated side over HTTP (AC-05; test-cases.md TC-DET-01).
 * Two independent app instances on two DB copies with the same session id, the same (frozen) clock and the same human
 * command sequence produce byte-identical stored states and identical `SessionEvent` rows (payload text, actor, seq,
 * type). A different session id gives a different game (the bot's seed is `sessionId#version`).
 */
import type { INestApplication } from '@nestjs/common';
import type { RebellionSetupInput } from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomatedGame,
  empireVsAi,
  rebelsVsAi,
  startRebellionApp,
} from './support/automation-helpers';
import { prismaOf } from './support/fixtures';
import { activeRebels, huntingEmpire, type HumanScript } from './support/scripted-empire';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

/** Plays `rounds` rounds (counted by the human's PASS commands) in a fresh app; returns the raw stored rows. */
async function play(id: string, setup: RebellionSetupInput, human: HumanScript, rounds: number) {
  const db = createTestDb();
  dbs.push(db);
  const { app } = await startRebellionApp(db, { ids: [id] });
  apps.push(app);
  const { game } = await AutomatedGame.create(app, setup);
  const commands: string[] = [];
  for (let passes = 0; passes < rounds;) {
    const state = await game.state();
    if (state.outcome !== null) break;
    const command = human(state);
    commands.push(JSON.stringify(command));
    await game.send(command);
    if (command.type === 'PASS') passes += 1;
  }
  const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id } });
  const events = await prismaOf(app).sessionEvent.findMany({
    where: { sessionId: id },
    orderBy: { seq: 'asc' },
  });
  return {
    state: row.state,
    version: row.version,
    commands,
    events: events.map((e) => [e.seq, e.type, e.actor, e.payload].join('|')),
  };
}

describe('SWR-006 W9: determinism over HTTP (AC-05)', () => {
  it('TC-DET-01: Rebels vs AI normal (R-ACTIVE, 3 rounds) and Empire vs AI easy (E-HUNT, 3 rounds) — two apps, byte-identical rows', async () => {
    const cases = [
      { id: 'swr006-w9-det-1', setup: rebelsVsAi('normal'), human: activeRebels },
      { id: 'swr006-w9-det-2', setup: empireVsAi('easy'), human: huntingEmpire },
    ];
    for (const c of cases) {
      const a = await play(c.id, c.setup, c.human, 3);
      const b = await play(c.id, c.setup, c.human, 3);
      expect(a.version).toBeGreaterThan(10);
      expect(b.commands).toEqual(a.commands);
      expect(b.state).toBe(a.state);
      expect(b.events).toEqual(a.events);
      // The automated side really played (not only passes).
      const aiSide = c.setup.playerFaction === 'rebels' ? 'empire' : 'rebels';
      expect(a.events.some((e) => e.includes(`|SYSTEM_ACTIVATED|${aiSide}|`))).toBe(true);
    }
  });

  it('TC-DET-01 (negative): another session id → another game', async () => {
    const a = await play('swr006-w9-det-3', rebelsVsAi('normal'), activeRebels, 2);
    const b = await play('swr006-w9-det-4', rebelsVsAi('normal'), activeRebels, 2);
    const strip = (s: string) =>
      s.replaceAll('swr006-w9-det-3', 'X').replaceAll('swr006-w9-det-4', 'X');
    expect(strip(b.state)).not.toBe(strip(a.state));
  });
});
