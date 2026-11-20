/**
 * SWR-008 W10 — DISC-009 at the API level and save / restore across an app restart (AC-8, AC-9; test-cases.md TC-D-35,
 * TC-RS-01, TC-RS-02, TC-RS-03, TC-RS-05; PO §10 items 12, 13, 15). Real Nest app, real Rebellion module, SQLite files
 * (a "restart" = `app.close()` + a new `createApp` on the SAME database file).
 *
 * Saved positions come from fixtures written by OLDER code and inserted as stored rows (never through a test-only HTTP
 * route): the SWR-005 W5 seeds `seed-reveal-7` (human Empire vs AI Rebels, base Rodia, one activation before the
 * reveal) and `seed-win-1` (hot-seat), the SWR-005 golden finished games, and the SWR-003 / SWR-004 `mock-v1` rows
 * (`apps/api/test/fixtures/v1`, `v2`).
 *
 * - TC-D-35: the Empire brings ground units into the hidden base: every Empire-addressed body before FINISH is clean
 *   (`baseLeaks`), no `BASE_REVEALED`; FINISH → `BASE_REVEALED` with the system id in the Empire's own reply. Also on a
 *   natural game (E-HUNT): the first `BASE_REVEALED` comes with a FINISH_ACTIVATION, never with a MOVE.
 * - TC-RS-01: saved in the middle of the Imperial activation of the base with ground units in it → restart → FINISH
 *   → `[ACTIVATION_FINISHED, BASE_REVEALED(, GAME_OVER)]`, exactly one reveal, version + 1.
 * - TC-RS-02: AI Empire, `AI_COMMANDER_MAX_STEPS = 1`: the run stops right after the AI moved ground into the base
 *   (oracle strategy) → restart → RUN: the AI finishes, exactly one reveal; its prompts before FINISH know no base.
 * - TC-RS-03: old saves (mock-v1 v1/v2, core-v1 v3 incl. a revealed base and finished games) load, GET and play;
 *   a finished game answers 422 `errors.gameOver`; a revealed base is never revealed again.
 * - TC-RS-05: saved after the reveal → restart → a new activation of the base with ground units → no second reveal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import {
  CorePlayerViewSchema,
  PlayerViewSchema,
  type CoreGameState,
  type PlayerView,
  type Faction,
} from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomatedGame,
  FIXED_NOW,
  aiEmpireSeed,
  applyEngine,
  commanderFake,
  coreGolden,
  coreSeed,
  empireVsAi,
  frozenClock,
  insertStoredSession,
  promptParts,
  runPath,
  seedRow,
  startRebellionApp,
  type CommanderCall,
  type CoreSeed,
  type StoredSessionRow,
} from './support/automation-helpers';
import {
  ERR,
  expectConsecutiveEvents,
  lines,
  storedEvents,
  storedState,
  type WireEvent,
} from './support/core-fixtures';
import { postCommand, prismaOf } from './support/fixtures';
import { baseLeaks } from './support/hidden-scan';
import { decisionText, enabledOpenAI, okResponse } from './support/openai-fake-fetch';
import { huntingEmpire, isGroundType } from './support/scripted-empire';
import { api, createTestDb, removeTestDb, startApp, type TestDb } from './support/test-app';
import { REPO_ROOT } from './support/test-config';
import type { AiCommanderConfig } from '../src/config/env';

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

/** A started app on `db` (bot commander unless told otherwise); closed by `afterEach` unless `restart` closes it. */
async function boot(
  db: TestDb,
  options: { aiCommander?: Partial<AiCommanderConfig> } = {},
): Promise<INestApplication> {
  const app = await startApp(db.url, {
    logger: false,
    clock: frozenClock(),
    config: { aiCommander: options.aiCommander },
  });
  apps.push(app);
  return app;
}

/** "Restart": closes `app` and boots a NEW app on the same database file. */
async function restart(
  app: INestApplication,
  db: TestDb,
  options: Parameters<typeof boot>[1] = {},
): Promise<INestApplication> {
  apps.splice(apps.indexOf(app), 1);
  await app.close();
  return boot(db, options);
}

interface Reply {
  status: number;
  body: { view?: unknown; events?: WireEvent[]; error?: { messageKey?: string } };
  request: unknown;
}

async function command(
  app: INestApplication,
  sessionId: string,
  actor: Faction,
  version: number,
  cmd: CoreSeed['nextCommands'][number]['command'],
): Promise<Reply> {
  const request = { actor, expectedVersion: version, command: cmd };
  const res = await postCommand(app, sessionId, request);
  return { status: res.status, body: res.body as Reply['body'], request };
}

async function getBody(app: INestApplication, sessionId: string): Promise<unknown> {
  const res = await api(app).get(`/api/sessions/${sessionId}`);
  expect(res.status).toBe(200);
  return res.body as unknown;
}

function types(events: readonly { type: string }[] | undefined): string[] {
  return (events ?? []).map((e) => e.type);
}

async function revealCount(app: INestApplication, sessionId: string): Promise<number> {
  return (await storedEvents(app, sessionId)).filter((e) => e.type === 'BASE_REVEALED').length;
}

/** Imperial ground units standing in the base system of a stored state. */
function imperialGroundInBase(state: CoreGameState): string[] {
  return state.units
    .filter(
      (u) =>
        u.owner === 'empire' && u.systemId === state.rebelBase.systemId && isGroundType(u.typeKey),
    )
    .map((u) => u.id);
}

/** The next mock-v1 command of the side to move: ACCEPT_HANDOFF, else ADVANCE_PHASE, END_TURN or the first move. */
function mockCommandOf(view: PlayerView): {
  actor: Faction;
  expectedVersion: number;
  command: Record<string, unknown>;
} {
  if (view.kind === 'handoff') {
    return {
      actor: view.activeSide,
      expectedVersion: view.version,
      command: { type: 'ACCEPT_HANDOFF' },
    };
  }
  if (view.rulesEngine !== 'mock-v1') throw new Error('expected a mock-v1 board');
  const legal = view.legalActions;
  const move = legal.find((a) => a.type === 'MOVE_PIECES');
  let command: Record<string, unknown>;
  if (legal.some((a) => a.type === 'ADVANCE_PHASE')) command = { type: 'ADVANCE_PHASE' };
  else if (legal.some((a) => a.type === 'END_TURN')) command = { type: 'END_TURN' };
  else if (move?.type === 'MOVE_PIECES') {
    const piece = view.pieces.find((p) => p.id === move.pieceId);
    command = {
      type: 'MOVE_PIECES',
      pieceIds: [move.pieceId],
      fromSystemId: piece?.systemId,
      toSystemId: move.toSystemIds[0],
    };
  } else throw new Error('mock-v1: no legal action');
  return { actor: view.viewer, expectedVersion: view.version, command };
}

/** Event rows of a session are consecutive 1..n (any engine). */
async function expectConsecutiveMirror(app: INestApplication, sessionId: string) {
  const events = await storedEvents(app, sessionId);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
  expect(events.length).toBe(row.version);
}

describe('SWR-008 W10: DISC-009 over HTTP (AC-8)', () => {
  it('TC-D-35: human Empire vs AI Rebels — ground units into the hidden base: clean Empire bodies and no BASE_REVEALED until FINISH, then BASE_REVEALED with the system id', async () => {
    const seed = coreSeed('ai-empire-before-reveal');
    const base = seed.rebelBaseSystemId;
    const app = await boot(newDb());
    await insertStoredSession(app, seedRow(seed));
    const id = seed.sessionId;
    let version = seed.row.version;
    const [activate, move, finish] = seed.nextCommands;

    const scanned: string[] = [];
    const scan = (label: string, body: unknown, request?: unknown) => {
      expect(baseLeaks(body, base, request), `${label} leaks the base`).toEqual([]);
      scanned.push(label);
    };
    scan('GET (loaded)', await getBody(app, id));
    for (const step of [activate!, move!]) {
      const reply = await command(app, id, step.actor, version, step.command);
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      expect(types(reply.body.events)).not.toContain('BASE_REVEALED');
      scan(`POST ${step.command.type}`, reply.body, reply.request);
      scan(`GET after ${step.command.type}`, await getBody(app, id));
      version = CorePlayerViewSchema.parse(reply.body.view).version;
    }
    // The oracle: the Imperial ground is in the base system, the base is still hidden.
    const mid = await storedState(app, id);
    expect(mid.activation).toMatchObject({ side: 'empire', systemId: base });
    expect(imperialGroundInBase(mid).length).toBeGreaterThan(0);
    expect(mid.rebelBase.revealed).toBe(false);
    expect(await revealCount(app, id)).toBe(0);
    const view = CorePlayerViewSchema.parse(
      PlayerViewSchema.parse(((await getBody(app, id)) as { view: unknown }).view),
    );
    expect(view.rebelBase).toEqual({ revealed: false, systemId: null });

    const reply = await command(app, id, finish!.actor, version, finish!.command);
    expect(reply.status).toBe(200);
    expect(types(reply.body.events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED']);
    const revealed = reply.body.events!.find((e) => e.type === 'BASE_REVEALED')!;
    expect(revealed.payload).toMatchObject({ systemId: base });
    expect(CorePlayerViewSchema.parse(reply.body.view).rebelBase).toEqual({
      revealed: true,
      systemId: base,
    });
    expect(await revealCount(app, id)).toBe(1);
    await expectConsecutiveEvents(app, id);
    expect(scanned.length).toBe(5);
  });

  it('TC-D-35 (natural game, E-HUNT): the first BASE_REVEALED arrives with a FINISH_ACTIVATION after ground moved in; earlier Empire bodies are clean', async () => {
    const id = 'swr008-w10-d35-hunt';
    const { app } = await startRebellionApp(newDb(), { ids: [id] });
    apps.push(app);
    const { game } = await AutomatedGame.create(app, empireVsAi('normal'));
    const base = (await game.state()).rebelBase.systemId as string;
    let revealedBy: string | null = null;
    let groundMovedInBefore = false;
    for (let i = 0; i < 120 && revealedBy === null; i += 1) {
      const state = await game.state();
      if (state.outcome !== null) break;
      const cmd = huntingEmpire(state);
      const reply = await game.post(cmd);
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      const body = reply.body as { events: WireEvent[] };
      game.version = CorePlayerViewSchema.parse((reply.body as { view: unknown }).view).version;
      if (types(body.events).includes('BASE_REVEALED')) {
        revealedBy = cmd.type;
        break;
      }
      const after = await game.state();
      if (imperialGroundInBase(after).length > 0) groundMovedInBefore = true;
      for (const r of game.replies.splice(0)) {
        expect(baseLeaks(r.body, base, r.request), `${r.label} leaks the base`).toEqual([]);
      }
      await game.get();
    }
    expect(revealedBy).toBe('FINISH_ACTIVATION');
    expect(groundMovedInBefore).toBe(true);
    expect(await revealCount(app, id)).toBe(1);
  });
});

describe('SWR-008 W10: save / restore across a restart (AC-9)', () => {
  it('TC-RS-01: saved mid-activation of the base with Imperial ground in it (human Empire vs AI Rebels) → restart → FINISH reveals exactly once, version + 1', async () => {
    const seed = coreSeed('ai-empire-before-reveal');
    const db = newDb();
    let app = await boot(db);
    await insertStoredSession(app, seedRow(seed));
    const id = seed.sessionId;
    let version = seed.row.version;
    for (const step of seed.nextCommands.slice(0, 2)) {
      const reply = await command(app, id, step.actor, version, step.command);
      expect(reply.status).toBe(200);
      version = CorePlayerViewSchema.parse(reply.body.view).version;
    }
    const saved = await storedState(app, id);
    expect(saved.activation).toMatchObject({ side: 'empire', systemId: seed.rebelBaseSystemId });
    expect(imperialGroundInBase(saved).length).toBeGreaterThan(0);
    expect(saved.rebelBase.revealed).toBe(false);

    app = await restart(app, db);
    expect(baseLeaks(await getBody(app, id), seed.rebelBaseSystemId)).toEqual([]);
    const finish = seed.nextCommands[2]!;
    const reply = await command(app, id, finish.actor, version, finish.command);
    expect(reply.status).toBe(200);
    expect(types(reply.body.events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED']);
    expect(CorePlayerViewSchema.parse(reply.body.view).version).toBe(version + 1);
    const after = await storedState(app, id);
    expect(after.rebelBase).toEqual({ systemId: seed.rebelBaseSystemId, revealed: true });
    expect(after.outcome).toEqual(seed.expectAfter.outcome);
    expect(await revealCount(app, id)).toBe(1);
    await expectConsecutiveEvents(app, id);
  });

  it('TC-RS-01 (hot-seat): saved mid-activation → restart → FINISH → [ACTIVATION_FINISHED, BASE_REVEALED, GAME_OVER]', async () => {
    const seed = coreSeed('hotseat-empire-before-win');
    const db = newDb();
    let app = await boot(db);
    await insertStoredSession(app, seedRow(seed));
    const id = seed.sessionId;
    let version = seed.row.version;
    for (const step of seed.nextCommands.slice(0, 2)) {
      const reply = await command(app, id, step.actor, version, step.command);
      expect(reply.status).toBe(200);
      version = CorePlayerViewSchema.parse(reply.body.view).version;
    }
    app = await restart(app, db);
    const finish = seed.nextCommands[2]!;
    const reply = await command(app, id, finish.actor, version, finish.command);
    expect(reply.status).toBe(200);
    expect(types(reply.body.events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED', 'GAME_OVER']);
    expect(CorePlayerViewSchema.parse(reply.body.view).version).toBe(version + 1);
    const after = await storedState(app, id);
    expect(after.outcome).toEqual(seed.expectAfter.outcome);
    expect(await revealCount(app, id)).toBe(1);
    // A finished game refuses further commands (also after another restart).
    app = await restart(app, db);
    const refused = await command(app, id, 'rebels', version + 1, { type: 'PASS' });
    expect(refused.status).toBe(422);
    expect(refused.body.error?.messageKey).toBe(ERR('gameOver'));
  });

  it('TC-RS-02: AI Empire, AI_COMMANDER_MAX_STEPS = 1 — the run stops right after the AI moved ground into the base (its prompt knew no base); after a restart the AI finishes the activation and the base is revealed exactly once', async () => {
    const position = aiEmpireSeed();
    const id = position.row.id;
    const base = position.state.rebelBase.systemId as string;
    // The AI Empire already activated the base system (Vader) in an earlier run (engine pipeline, origin 'auto').
    const activated = applyEngine(position.state, [
      { actor: 'empire', command: { type: 'ACTIVATE_SYSTEM', leaderId: 'vader', systemId: base } },
    ]);
    const db = newDb();
    let readState: () => Promise<CoreGameState> = () => Promise.reject(new Error('no app'));
    let movedBy: string | null = null;
    // The "model" of the first app (oracle): the candidate that puts Imperial ground into the base, found by applying
    // each candidate of the stored state with the game module (never by reading the prompt).
    const fakeA = commanderFake(async (call: CommanderCall) => {
      const state = await readState();
      for (const candidateId of call.ids) {
        const result = rebellionServerModule.automation!.applyCandidate(state, candidateId, {
          now: FIXED_NOW,
        });
        if (result.ok && imperialGroundInBase(result.state as CoreGameState).length > 0) {
          movedBy = candidateId;
          return okResponse({ text: decisionText(candidateId) });
        }
      }
      return okResponse({ text: decisionText(call.ids[0] ?? 'c1') });
    });
    const a = await startRebellionApp(db, {
      fake: fakeA,
      openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
      aiCommander: { provider: 'openai', maxSteps: 1 },
    });
    let app = a.app;
    apps.push(app);
    readState = () => storedState(a.app, id);
    await insertStoredSession(app, {
      ...seedRow(position),
      state: activated,
      version: activated.version,
    });
    const stopped = await api(app).post(runPath(id)).send({});
    expect(stopped.status, JSON.stringify(stopped.body)).toBe(200);
    expect((stopped.body as { automation: unknown }).automation).toMatchObject({
      steps: 1,
      pending: true,
      strategy: 'openai',
      fallbacks: 0,
      stopReason: 'stepLimit',
    });
    expect(movedBy).not.toBeNull();
    // The prompt of that step: the Empire inside its activation of the base, the base unknown to it.
    expect(fakeA.responses).toHaveLength(1);
    const prompt = fakeA.responses[0]!;
    expect(prompt.ids.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(prompt.body)).toContain('Rebel base: unknown.');
    expect(JSON.stringify(prompt.body)).not.toContain('Rebel base: revealed');
    expect(JSON.stringify(prompt.body)).not.toContain('rebelBase');
    const rules = promptParts(prompt.body).rules ?? '';
    expect(rules.split('\n')[0]?.startsWith('[rebellion:impl.engine-scope]')).toBe(true);
    expect(rules).not.toContain(base);
    expect(rules).not.toContain('[rebellion:base.reveal-procedure]');
    // The saved position: activation of the base, Imperial ground in it, base hidden, no reveal event.
    const saved = await storedState(app, id);
    expect(saved.activation).toMatchObject({ side: 'empire', systemId: base });
    expect(imperialGroundInBase(saved).length).toBeGreaterThan(0);
    expect(saved.rebelBase.revealed).toBe(false);
    expect(await revealCount(app, id)).toBe(0);
    const savedEvents = (await storedEvents(app, id)).length;

    // Restart (the same DB file); the AI goes on: FINISH (its only candidate now — no model call) reveals the base.
    apps.splice(apps.indexOf(app), 1);
    await app.close();
    const fakeB = commanderFake((call: CommanderCall) => {
      const actions = (
        JSON.parse(promptParts(call.body).game) as {
          availableActions: { id: string; type: string }[];
        }
      ).availableActions;
      const pick =
        actions.find((x) => x.type === 'FINISH_ACTIVATION') ??
        actions.find((x) => x.type === 'PASS') ??
        actions[0]!;
      return okResponse({ text: decisionText(pick.id) });
    });
    const b = await startRebellionApp(db, {
      fake: fakeB,
      openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
      aiCommander: { provider: 'openai' },
    });
    app = b.app;
    apps.push(app);
    const run = await api(app).post(runPath(id)).send({});
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    const events = await storedEvents(app, id);
    const after = events.filter((e) => e.seq > savedEvents);
    expect(lines(after.slice(0, 2))).toEqual([
      'ACTIVATION_FINISHED empire',
      'BASE_REVEALED system',
    ]);
    expect(events.filter((e) => e.type === 'BASE_REVEALED')).toHaveLength(1);
    expect((await storedState(app, id)).rebelBase).toEqual({ systemId: base, revealed: true });
    // Every later prompt of the AI Empire is made after the reveal and says so.
    for (const call of fakeB.responses) {
      expect(JSON.stringify(call.body)).toContain(`Rebel base: revealed at ${base}.`);
    }
    await expectConsecutiveEvents(app, id);
  });

  describe('TC-RS-03: old saves load and play', () => {
    it('core-v1 v3 seeds (SWR-005): load, GET, play 3 commands; the reveal happens once', async () => {
      const db = newDb();
      for (const name of ['ai-empire-before-reveal', 'hotseat-empire-before-win'] as const) {
        const seed = coreSeed(name);
        let app = await boot(db);
        await insertStoredSession(app, seedRow(seed));
        app = await restart(app, db);
        expect(
          CorePlayerViewSchema.parse(
            ((await getBody(app, seed.sessionId)) as { view: unknown }).view,
          ).version,
        ).toBe(seed.row.version);
        let version = seed.row.version;
        for (const step of seed.nextCommands) {
          const reply = await command(app, seed.sessionId, step.actor, version, step.command);
          expect(reply.status, `${name} ${step.command.type}: ${JSON.stringify(reply.body)}`).toBe(
            200,
          );
          version = CorePlayerViewSchema.parse(reply.body.view).version;
        }
        const after = await storedState(app, seed.sessionId);
        expect(after.rebelBase.revealed).toBe(seed.expectAfter.revealed);
        expect(after.outcome).toEqual(seed.expectAfter.outcome);
        expect(await revealCount(app, seed.sessionId)).toBe(1);
        await expectConsecutiveEvents(app, seed.sessionId);
        apps.splice(apps.indexOf(app), 1);
        await app.close();
      }
    });

    it('core-v1 v3 finished games (golden, incl. a revealed base): GET 200, any command → 422 errors.gameOver; nothing is revealed again', async () => {
      const db = newDb();
      const app = await boot(db);
      for (const name of ['golden-empire-win', 'golden-rebels-time'] as const) {
        const golden = coreGolden(name);
        const s = golden.finalState;
        const row: StoredSessionRow = {
          id: golden.sessionId,
          setup: { schemaVersion: 2, ...s.settings },
          state: s,
          version: s.version,
          status: 'completed',
        };
        await insertStoredSession(app, row);
        const before = await revealCount(app, golden.sessionId);
        expect(before).toBe(s.rebelBase.revealed ? 1 : 0);
        const res = await api(app).get(`/api/sessions/${golden.sessionId}`);
        expect(res.status).toBe(200);
        expect((res.body as { status: string }).status).toBe('completed');
        for (const actor of ['rebels', 'empire'] as const) {
          const refused = await command(app, golden.sessionId, actor, s.version, { type: 'PASS' });
          expect(refused.status, JSON.stringify(refused.body)).toBe(422);
          expect(refused.body.error?.messageKey).toBe(ERR('gameOver'));
        }
        expect(await revealCount(app, golden.sessionId)).toBe(before);
        expect((await storedState(app, golden.sessionId)).version).toBe(s.version);
      }
    });

    it.each([
      ['SWR-003 v1', 'v1/sessions.v1.json'],
      ['SWR-004 v2', 'v2/sessions.v2.json'],
    ])(
      'mock-v1 rows of %s: load, GET, play 3 commands each, survive a restart',
      async (_name, file) => {
        const fixture = JSON.parse(
          readFileSync(join(REPO_ROOT, 'apps', 'api', 'test', 'fixtures', file), 'utf8'),
        ) as { sessions: (StoredSessionRow & { status?: string })[] };
        // SWR-003 rows had no status column; the SWR-004 migration backfilled 'prototype'.
        const rows = fixture.sessions.map((r) => ({ ...r, status: r.status ?? 'prototype' }));
        expect(rows.length).toBe(3);
        const db = newDb();
        let app = await boot(db);
        for (const row of rows) await insertStoredSession(app, row);
        app = await restart(app, db);
        let played = 0;
        for (const row of rows) {
          let last = row.version;
          for (let i = 0; i < 3; i += 1) {
            const view = PlayerViewSchema.parse(
              ((await getBody(app, row.id)) as { view: unknown }).view,
            );
            expect(view.rulesEngine).toBe('mock-v1');
            expect(view.version).toBeGreaterThanOrEqual(last);
            const request = mockCommandOf(view);
            const res = await postCommand(app, row.id, request);
            expect(
              res.status,
              `${row.id} ${String(request.command.type)}: ${JSON.stringify(res.body)}`,
            ).toBe(200);
            last = PlayerViewSchema.parse((res.body as { view: unknown }).view).version;
            expect(last).toBeGreaterThan(view.version);
            played += 1;
          }
          await expectConsecutiveMirror(app, row.id);
        }
        expect(played).toBe(rows.length * 3);
        // Restart again: every row still reads.
        app = await restart(app, db);
        for (const row of rows) await getBody(app, row.id);
      },
    );
  });

  it('TC-RS-05: saved AFTER the reveal → restart → a new Imperial activation of the base with ground units → no second BASE_REVEALED', async () => {
    const seed = coreSeed('ai-empire-before-reveal');
    const base = seed.rebelBaseSystemId;
    const db = newDb();
    let app = await boot(db);
    await insertStoredSession(app, seedRow(seed));
    const id = seed.sessionId;
    let version = seed.row.version;
    for (const step of seed.nextCommands) {
      const reply = await command(app, id, step.actor, version, step.command);
      expect(reply.status).toBe(200);
      version = CorePlayerViewSchema.parse(reply.body.view).version;
    }
    expect(await revealCount(app, id)).toBe(1);
    app = await restart(app, db);

    // Play on as the Empire: whenever the base can be activated with ground units able to move in, do it, move,
    // finish; otherwise pass. At least one more activation of the base must happen; the reveal is never repeated.
    let baseActivations = 0;
    for (let i = 0; i < 60 && baseActivations < 2; i += 1) {
      const state = await storedState(app, id);
      if (state.outcome !== null) break;
      if (state.activeSide !== 'empire') throw new Error('expected the human Empire to move');
      const view = CorePlayerViewSchema.parse(
        PlayerViewSchema.parse(((await getBody(app, id)) as { view: unknown }).view),
      );
      const legal = view.legalActions;
      let cmd: CoreSeed['nextCommands'][number]['command'];
      if (state.activation !== null) {
        const moved = state.log
          .slice(state.log.findLastIndex((e) => e.type === 'SYSTEM_ACTIVATED'))
          .some((e) => e.type === 'PIECES_MOVED' && e.actor === 'empire');
        const ground = state.units.find(
          (u) =>
            u.owner === 'empire' &&
            isGroundType(u.typeKey) &&
            u.systemId !== base &&
            state.map.systems.find((s) => s.id === base)!.adjacentSystemIds.includes(u.systemId),
        );
        const transport = ground
          ? state.units.find(
              (u) =>
                u.owner === 'empire' &&
                u.systemId === ground.systemId &&
                u.typeKey.endsWith('star-destroyer'),
            )
          : undefined;
        cmd =
          !moved && ground && transport
            ? {
                type: 'MOVE_PIECES',
                pieceIds: [transport.id, ground.id],
                fromSystemId: ground.systemId,
                toSystemId: base,
              }
            : { type: 'FINISH_ACTIVATION' };
      } else {
        const activate = legal.find(
          (a) => a.type === 'ACTIVATE_SYSTEM' && a.systemIds.includes(base),
        );
        cmd =
          activate?.type === 'ACTIVATE_SYSTEM' && activate.leaderIds[0] !== undefined
            ? { type: 'ACTIVATE_SYSTEM', leaderId: activate.leaderIds[0], systemId: base }
            : { type: 'PASS' };
        if (activate) baseActivations += 1;
      }
      let reply = await command(app, id, 'empire', version, cmd);
      if (reply.status !== 200 && cmd.type === 'MOVE_PIECES') {
        cmd = { type: 'FINISH_ACTIVATION' };
        reply = await command(app, id, 'empire', version, cmd);
      }
      expect(reply.status, `${cmd.type}: ${JSON.stringify(reply.body)}`).toBe(200);
      expect(types(reply.body.events)).not.toContain('BASE_REVEALED');
      version = CorePlayerViewSchema.parse(reply.body.view).version;
    }
    expect(baseActivations).toBeGreaterThanOrEqual(1);
    expect(await revealCount(app, id)).toBe(1);
    await expectConsecutiveEvents(app, id);
    console.log(
      `[swr008-w10-rs05] baseActivationsAfterRestart=${baseActivations} lines=${lines(await storedEvents(app, id)).length}`,
    );
  });
});
