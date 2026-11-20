/**
 * SWR-006 W9 — hidden information in OpenAI mode (AC-04, Q-BE-9; PO п.8 item 4; test-cases.md TC-H-04, TC-H-05,
 * TC-H-06, TC-H-07, TC-H-08 (OpenAI mode)).
 * 1. AI Empire: two DB copies hold the SAME session (same id) that differ ONLY in where the hidden Rebel base is
 *    (the stored state is relocated like W5 `relocateBase`). The human Rebels pass; every request the Empire's
 *    commander sends to the fake OpenAI before a reveal is byte-identical in the two games — the base cannot leak
 *    into a prompt — and no request carries the session id or the key. Logs and AiUsage rows never name the base.
 * 2. AI Rebels (human Empire, E-HUNT): every Empire-addressed body (POST, GET, list, commands, run) is path-scanned
 *    for the base id before the reveal (`hidden-scan.ts`), automated Rebel steps chosen by the "model"; requests
 *    carry no session id; logs and AiUsage rows never name the base.
 */
import type { INestApplication } from '@nestjs/common';
import { coreDataBaseV1 } from '@bga/game-rebellion/scenario';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  type CoreGameState,
} from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomatedGame,
  commanderFake,
  empireVsAi,
  rebelsVsAi,
  startRebellionApp,
  usageRows,
  type CommanderCall,
  type RebellionApp,
} from './support/automation-helpers';
import { prismaOf } from './support/fixtures';
import { baseLeaks } from './support/hidden-scan';
import { SENTINEL_KEY, decisionText, enabledOpenAI, okResponse } from './support/openai-fake-fetch';
import { distancesFrom, huntingEmpire } from './support/scripted-empire';
import { api, createTestDb, removeTestDb, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

/** Deterministic "model": always the second candidate (a pure function of the request). */
function modelFake() {
  return commanderFake((call: CommanderCall) =>
    okResponse({ text: decisionText(call.ids[1] ?? call.ids[0] ?? 'c1', 'Hold the line.') }),
  );
}

async function openaiApp(id: string, fake: ReturnType<typeof modelFake>): Promise<RebellionApp> {
  const db = createTestDb();
  dbs.push(db);
  const started = await startRebellionApp(db, {
    ids: [id],
    fake,
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
    aiCommander: { provider: 'openai' },
  });
  apps.push(started.app);
  return started;
}

/** The same state with the base in `to` (Rebel units / leaders / activation / own log references moved). */
function relocateBase(state: CoreGameState, to: string): CoreGameState {
  const from = state.rebelBase.systemId;
  const swap = (id: string) => (id === from ? to : id);
  return CoreGameStateV3Schema.parse({
    ...state,
    rebelBase: { ...state.rebelBase, systemId: to },
    units: state.units.map((u) =>
      u.owner === 'rebels' ? { ...u, systemId: swap(u.systemId) } : u,
    ),
    leaders: state.leaders.map((l) =>
      l.owner === 'rebels' && l.systemId !== null ? { ...l, systemId: swap(l.systemId) } : l,
    ),
  });
}

function expectNoSessionId(calls: readonly CommanderCall[], sessionId: string) {
  for (const call of calls) {
    const body = JSON.stringify(call.body);
    expect(body).not.toContain(sessionId);
    expect(body).not.toContain(SENTINEL_KEY);
    expect(call.req.url).not.toContain(sessionId);
    for (const [name, value] of call.req.headers.entries())
      expect(value, name).not.toContain(sessionId);
    for (const field of ['metadata', 'user', 'safety_identifier', 'prompt_cache_key']) {
      expect(call.body).not.toHaveProperty(field);
    }
  }
}

function logText(started: RebellionApp): string {
  return [...started.aiLogs, ...started.automationLogs.map((l) => l.line)].join('\n');
}

describe('SWR-006 W9: hidden base in OpenAI mode (AC-04)', () => {
  it('TC-H-04 / TC-H-06 / TC-H-07 / Q-BE-9: AI Empire — prompts are byte-identical for two games differing only in the base; no session id; logs and AiUsage never name the base', async () => {
    const id = 'swr006-w9-hidden-oa-1';
    const fakeA = modelFake();
    const fakeB = modelFake();
    const a = await openaiApp(id, fakeA);
    const b = await openaiApp(id, fakeB);
    const gameA = (await AutomatedGame.create(a.app, rebelsVsAi('normal'))).game;
    const gameB = (await AutomatedGame.create(b.app, rebelsVsAi('normal'))).game;
    const stateA = await gameA.state();
    const baseA = stateA.rebelBase.systemId as string;
    // The other base: an eligible system with no Rebel piece, as far as possible from every Imperial unit.
    const empireAt = new Set(
      stateA.units.filter((u) => u.owner === 'empire').map((u) => u.systemId),
    );
    const rebelAt = new Set(
      stateA.units.filter((u) => u.owner === 'rebels').map((u) => u.systemId),
    );
    const farness = (sys: string) =>
      Math.min(...[...empireAt].map((e) => distancesFrom(stateA, sys).get(e) ?? 99));
    const baseB = eligibleRebelBaseSystemIds(coreDataBaseV1)
      .filter((sys) => sys !== baseA && !rebelAt.has(sys))
      .sort((x, y) => farness(y) - farness(x) || (x < y ? -1 : 1))[0] as string;
    expect(baseB).toBeTruthy();
    const relocated = relocateBase(stateA, baseB);
    expect(relocated.rebelBase.systemId).toBe(baseB);
    await prismaOf(b.app).session.update({
      where: { id },
      data: { state: JSON.stringify(relocated) },
    });
    const creationEvents = await prismaOf(b.app).sessionEvent.findMany({
      where: { sessionId: id },
    });
    expect(creationEvents.some((e) => e.payload.includes(baseA))).toBe(false);

    // Human Rebels pass twice (two Imperial turns with the commander).
    for (let i = 0; i < 2; i += 1) {
      const ra = await gameA.send({ type: 'PASS' });
      const rb = await gameB.send({ type: 'PASS' });
      expect(ra.summary).toMatchObject({ strategy: 'openai', fallbacks: 0 });
      expect(rb.summary).toMatchObject({ strategy: 'openai', fallbacks: 0 });
    }
    const [finalA, finalB] = [await gameA.state(), await gameB.state()];
    // Precondition of the comparison: no reveal happened in either game.
    expect(finalA.rebelBase.revealed).toBe(false);
    expect(finalB.rebelBase.revealed).toBe(false);
    expect(fakeA.responses.length).toBeGreaterThan(5);
    // Every request of the Empire's commander is byte-identical in the two games.
    expect(fakeB.responses.map((c) => JSON.stringify(c.body))).toEqual(
      fakeA.responses.map((c) => JSON.stringify(c.body)),
    );
    // (A substring scan for the base id is meaningless here: every system id is public — catalogue, "possible base
    // locations", candidate targets. Byte-identity across the two bases is the proof.)
    for (const call of fakeA.responses) {
      expect(JSON.stringify(call.body)).not.toContain('rebelBase');
      expect(JSON.stringify(call.body)).toContain('Rebel base: unknown.');
    }
    expectNoSessionId([...fakeA.responses, ...fakeB.responses], id);

    // TC-H-06 / TC-H-07: no base in any log line or AiUsage row of either game.
    for (const [started, base] of [
      [a, baseA],
      [b, baseB],
    ] as const) {
      const logs = logText(started);
      expect(logs).toContain('automation.step');
      expect(logs).not.toContain(base);
      const rows = await usageRows(started.app, id);
      expect(rows.length).toBe(fakeA.responses.length);
      expect(JSON.stringify(rows)).not.toContain(base);
    }
  });

  it('TC-H-05 / TC-H-08 (OpenAI mode): human Empire vs AI Rebels — Empire-addressed bodies clean before the reveal; requests without session id; logs and AiUsage never name the base', async () => {
    const id = 'swr006-w9-hidden-oa-2';
    const fake = modelFake();
    const started = await openaiApp(id, fake);
    const { game } = await AutomatedGame.create(started.app, empireVsAi('easy'));
    const base = (await game.state()).rebelBase.systemId as string;
    const scanned: string[] = [];
    const scanAll = (revealed: boolean) => {
      for (const r of game.replies.splice(0)) {
        if (revealed) continue;
        expect(baseLeaks(r.body, base, r.request), `${r.label} leaks the base`).toEqual([]);
        scanned.push(r.label);
      }
    };
    for (let i = 0; i < 40; i += 1) {
      const state = await game.state();
      if (state.outcome !== null || state.rebelBase.revealed) break;
      await game.send(huntingEmpire(state));
      await game.runRaw();
      await game.get();
      const list = await api(started.app).get('/api/sessions');
      game.replies.push({ label: 'GET /api/sessions', status: list.status, body: list.body });
      const after = await game.state();
      scanAll(after.rebelBase.revealed);
    }
    expect(scanned.length).toBeGreaterThan(20);
    expect(fake.responses.length).toBeGreaterThan(0);
    expectNoSessionId(fake.responses, id);
    const events = await prismaOf(started.app).sessionEvent.findMany({ where: { sessionId: id } });
    expect(events.some((e) => e.actor === 'rebels' && e.type === 'PIECES_MOVED')).toBe(true);
    expect(logText(started)).not.toContain(base);
    expect(JSON.stringify(await usageRows(started.app, id))).not.toContain(base);
  });
});
