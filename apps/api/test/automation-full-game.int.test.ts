/**
 * SWR-006 W9 — full games against the REAL bot through HTTP for BOTH sides (D-PO-5, AC-08, AC-06; PO п.8 items 9, 10,
 * 12, 13; test-cases.md TC-OUT-01/02/03/06/07, TC-LOOP-05/07, TC-DIF-01 (HTTP), TC-DIF-10, TC-OUT-08).
 * Real Nest app (`createApp`), the registered Rebellion module (ranked bot), fresh SQLite per app, fixed session ids
 * (the bot's seed is `sessionId#version`, so a fixed id fixes the game). The human side is a script that reads the
 * stored state (test oracle) and sends ONLY `POST /api/sessions/:id/commands`; the AI moves are made by the server's
 * automation runner inside those requests (or `POST …/automation/run`).
 * Empire-win seeds are copied from W8 `packages/games/rebellion/test/ai/sim/fixtures/empire-win-seeds.json`
 * (`E-HUNT` vs AI Rebels; the exact human command sequences are replayed here). The api tests never import package
 * test files (plan-backend §10 W9), so the two seeds used are inlined below.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import type { CoreGameState } from '@bga/game-rebellion/schema';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { TMP_DIR } from './global-setup';
import {
  AutomatedGame,
  empireVsAi,
  engineGame,
  rebelsVsAi,
  startRebellionApp,
  type CommandReply,
} from './support/automation-helpers';
import { expectConsecutiveEvents, storedRow } from './support/core-fixtures';
import {
  activeRebels,
  emptyBase,
  huntingEmpire,
  passiveHuman,
  type HumanCommand,
} from './support/scripted-empire';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

/** Full games commit ~100–250 times each: explicit per-test timeouts (plan-backend §15). */
const FULL_GAME_TIMEOUT = 90_000;

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];
const transcript: string[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

afterAll(() => {
  writeFileSync(join(TMP_DIR, 'w9-full-games.log'), `${transcript.join('\n')}\n`);
});

async function newApp(ids: string[], aiCommander?: { maxSteps?: number }) {
  const db = createTestDb();
  dbs.push(db);
  const started = await startRebellionApp(db, { ids, aiCommander });
  apps.push(started.app);
  return started;
}

/** Rounds (by the stored log) in which `side` activated at least one system. */
function roundsWithActivation(state: CoreGameState, side: 'empire' | 'rebels'): number {
  const rounds = new Set<number>();
  let round = 0;
  for (const e of state.log) {
    if (e.type === 'PHASE_STARTED' && e.payload.phase === 'command') round += 1;
    if (e.type === 'SYSTEM_ACTIVATED' && e.actor === side) rounds.add(round);
  }
  return rounds.size;
}

function note(line: string) {
  transcript.push(line);
}

const SALEUCAMI_GROUP = ['u-15', 'u-16', 'u-17', 'u-18', 'u-19', 'u-20'];

/** W8 fixed seeds (`empire-win-seeds.json`, script `E-HUNT`, AI side Rebels) — `WIN_SEED_EASY`, `WIN_SEED_NORMAL`. */
const WIN_SEEDS: {
  difficulty: 'easy' | 'normal';
  sessionId: string;
  base: string;
  finalRound: number;
  finalVersion: number;
  humanCommands: HumanCommand[];
}[] = [
  {
    difficulty: 'easy',
    sessionId: 'swr006-d01',
    base: 'ilum',
    finalRound: 6,
    finalVersion: 59,
    humanCommands: [
      { type: 'ACTIVATE_SYSTEM', leaderId: 'palpatine', systemId: 'ord-mantell' },
      {
        type: 'MOVE_PIECES',
        pieceIds: ['u-29', 'u-30', 'u-31', 'u-32', 'u-33', 'u-34', 'u-35', 'u-36', 'u-37'],
        fromSystemId: 'coruscant',
        toSystemId: 'ord-mantell',
      },
      { type: 'FINISH_ACTIVATION' },
      { type: 'PASS' },
      { type: 'ACTIVATE_SYSTEM', leaderId: 'palpatine', systemId: 'ilum' },
      {
        type: 'MOVE_PIECES',
        pieceIds: ['u-29', 'u-30', 'u-31', 'u-32', 'u-33', 'u-34', 'u-35', 'u-36', 'u-37'],
        fromSystemId: 'ord-mantell',
        toSystemId: 'ilum',
      },
      { type: 'FINISH_ACTIVATION' },
      { type: 'PASS' },
      { type: 'PASS' },
      { type: 'PASS' },
      { type: 'PASS' },
    ],
  },
  {
    difficulty: 'normal',
    sessionId: 'swr006-d05',
    base: 'tatooine',
    finalRound: 3,
    finalVersion: 20,
    humanCommands: [
      { type: 'ACTIVATE_SYSTEM', leaderId: 'palpatine', systemId: 'toydaria' },
      {
        type: 'MOVE_PIECES',
        pieceIds: SALEUCAMI_GROUP,
        fromSystemId: 'saleucami',
        toSystemId: 'toydaria',
      },
      { type: 'FINISH_ACTIVATION' },
      { type: 'PASS' },
      { type: 'ACTIVATE_SYSTEM', leaderId: 'palpatine', systemId: 'bothawui' },
      {
        type: 'MOVE_PIECES',
        pieceIds: SALEUCAMI_GROUP,
        fromSystemId: 'toydaria',
        toSystemId: 'bothawui',
      },
      { type: 'FINISH_ACTIVATION' },
      { type: 'PASS' },
      { type: 'ACTIVATE_SYSTEM', leaderId: 'palpatine', systemId: 'tatooine' },
      {
        type: 'MOVE_PIECES',
        pieceIds: SALEUCAMI_GROUP,
        fromSystemId: 'bothawui',
        toSystemId: 'tatooine',
      },
      { type: 'FINISH_ACTIVATION' },
    ],
  },
];

describe('SWR-006 W9: full games over HTTP against the real bot (D-PO-5, AC-08)', () => {
  it(
    'TC-OUT-01 / TC-LOOP-07 / PO 8.9: human Rebels (R-PASSIVE) vs AI Empire easy / normal ×2 / hard → Rebels win on time; the AI activates in ≥ 10 of 13 rounds',
    async () => {
      const cases = [
        { id: 'swr006-d01', difficulty: 'normal' },
        { id: 'swr006-d02', difficulty: 'normal' },
        { id: 'swr006-d03', difficulty: 'easy' },
        { id: 'swr006-d04', difficulty: 'hard' },
      ] as const;
      const { app } = await newApp(cases.map((c) => c.id));
      for (const c of cases) {
        const created = await AutomatedGame.create(app, rebelsVsAi(c.difficulty));
        const game = created.game;
        expect(game.id).toBe(c.id);
        expect(created.automation).toEqual({ pending: false, strategy: 'bot' });
        expect(created.view.activeSide).toBe('rebels');
        let passes = 0;
        let last: CommandReply | undefined;
        const final = await game.playToEnd(passiveHuman, {
          onReply: (reply) => {
            passes += 1;
            last = reply;
            // TC-LOOP-07: the default step limit is never hit in a real game; one answer per human command.
            expect(
              reply.summary.stopReason === 'humanTurn' || reply.summary.stopReason === 'gameOver',
            ).toBe(true);
            expect(reply.summary).toMatchObject({
              strategy: 'bot',
              pending: false,
              fallbacks: 0,
              fallbackReasons: [],
            });
            // After the 12th pass the game goes on (time 13 < reputation 14).
            if (passes === 12) expect(reply.view.outcome).toBeNull();
          },
        });
        expect(final.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
        expect(last?.summary.stopReason).toBe('gameOver');
        expect(last?.view.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
        expect(passes).toBe(13);
        const got = await game.get();
        expect(got.status).toBe('completed');
        expect(got.automation).toEqual({ pending: false, strategy: 'bot' });
        // PO 3.1: the AI Empire plays (not only passes) — ≥ 10 of 13 rounds with an activation.
        const active = roundsWithActivation(final, 'empire');
        expect(active).toBeGreaterThanOrEqual(10);
        await expectConsecutiveEvents(app, game.id);
        const events = await game.events();
        expect(events.some((e) => e.actor === 'empire' && e.type === 'PIECES_MOVED')).toBe(true);
        note(
          `TC-OUT-01 ${c.id} AI empire ${c.difficulty}: passes=${passes} finalVersion=${final.version} ` +
            `outcome=${JSON.stringify(final.outcome)} roundsWithAiActivation=${active}/13 ` +
            `aiSteps=${game.summaries.reduce((a, s) => a + s.steps, 0)}`,
        );
      }
    },
    FULL_GAME_TIMEOUT,
  );

  it(
    'TC-OUT-02 / TC-OUT-08 / PO 8.12: PO default scenario — human Rebels R-ACTIVE vs AI Empire normal plays to the end; every answer is humanTurn / gameOver',
    async () => {
      const { app } = await newApp(['swr006-w9-active-1']);
      const { game } = await AutomatedGame.create(app, rebelsVsAi('normal'));
      let commands = 0;
      const final = await game.playToEnd(activeRebels, {
        onReply: (reply, command) => {
          commands += 1;
          expect(['humanTurn', 'gameOver', 'none']).toContain(reply.summary.stopReason);
          // Q-4: a command that keeps the turn (activation / move) → no AI step, stopReason 'none'.
          if (command.type !== 'PASS' && command.type !== 'FINISH_ACTIVATION') {
            expect(reply.summary.steps).toBe(0);
          }
          if (reply.summary.steps > 0) {
            expect(reply.events.some((e) => e.actor === 'empire')).toBe(true);
          }
          if (reply.view.outcome === null) expect(reply.view.activeSide).toBe('rebels');
          expect(reply.view.version).toBe(game.version);
        },
      });
      expect(final.outcome).not.toBeNull();
      expect((await game.get()).status).toBe('completed');
      const events = await expectConsecutiveEvents(app, game.id);
      expect(events.some((e) => e.actor === 'empire' && e.type === 'SYSTEM_ACTIVATED')).toBe(true);
      expect(events.some((e) => e.actor === 'empire' && e.type === 'PIECES_MOVED')).toBe(true);
      expect(events.some((e) => e.actor === 'rebels' && e.type === 'PIECES_MOVED')).toBe(true);
      expect(
        events
          .filter((e) => e.actor === 'empire')
          .every((e) => e.payload.auto === true || !('auto' in e.payload)),
      ).toBe(true);
      note(
        `TC-OUT-02 swr006-w9-active-1 R-ACTIVE vs AI empire normal: commands=${commands} finalVersion=${final.version} ` +
          `outcome=${JSON.stringify(final.outcome)} events=${events.length}`,
      );
    },
    FULL_GAME_TIMEOUT,
  );

  it(
    'TC-OUT-06: WIN_SEED_EASY (swr006-d01) and WIN_SEED_NORMAL (swr006-d05) replayed through HTTP → winner empire, rebelBaseCaptured',
    async () => {
      for (const seed of WIN_SEEDS) {
        const { app } = await newApp([seed.sessionId]);
        const created = await AutomatedGame.create(app, empireVsAi(seed.difficulty));
        const game = created.game;
        expect(game.id).toBe(seed.sessionId);
        // TC-LOOP-02: the AI Rebels move first, inside the 201.
        expect(created.view.version).toBeGreaterThan(1);
        expect(created.automation).toEqual({ pending: false, strategy: 'bot' });
        let last: CommandReply | undefined;
        for (const command of seed.humanCommands) {
          const state = await game.state();
          expect(state.outcome).toBeNull();
          expect(state.activeSide).toBe('empire');
          // The fixture is also what the live E-HUNT script plays on this seed (same oracle, same bot).
          expect(huntingEmpire(state)).toEqual(command);
          last = await game.send(command);
        }
        expect(last?.view.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
        // Either an automated step ends the game (→ 'gameOver'), or the human's own move does and the runner makes
        // no step (→ 'none': specification Q-4, 'none' ⇔ 0 steps).
        expect(last?.summary.pending).toBe(false);
        expect(last?.summary.stopReason).toBe(last?.summary.steps === 0 ? 'none' : 'gameOver');
        const final = await game.state();
        expect(final.rebelBase.systemId).toBe(seed.base);
        expect(final.round).toBe(seed.finalRound);
        expect(final.version).toBe(seed.finalVersion);
        const got = await game.get();
        expect(got.status).toBe('completed');
        // After the end the base is visible to the Empire.
        expect(got.view.rebelBase).toMatchObject({ systemId: seed.base, revealed: true });
        await expectConsecutiveEvents(app, game.id);
        note(
          `TC-OUT-06 ${seed.sessionId} E-HUNT vs AI rebels ${seed.difficulty}: humanCommands=${seed.humanCommands.length} ` +
            `finalVersion=${final.version} finalRound=${final.round} outcome=${JSON.stringify(final.outcome)}`,
        );
      }
    },
    FULL_GAME_TIMEOUT,
  );

  it(
    'TC-OUT-03 / TC-OUT-07 / TC-DIF-01 / TC-LOOP-05 (HTTP): E-HUNT vs AI Rebels hard, one step per request → the base is never empty; the Rebels win',
    async () => {
      // AI_COMMANDER_MAX_STEPS=1: every AI step is its own request (each stored state is checked); `run` continues.
      const ids = ['swr006-d01', 'swr006-d05'];
      const { app } = await newApp(ids, { maxSteps: 1 });
      for (const id of ids) {
        const created = await AutomatedGame.create(app, empireVsAi('hard'));
        const game = created.game;
        expect(game.id).toBe(id);
        let checked = 0;
        const check = async () => {
          const state = await game.state();
          expect(emptyBase(state), `${id} v${state.version}: the hard AI emptied its base`).toBe(
            false,
          );
          checked += 1;
          return state;
        };
        const drain = async (pending: boolean) => {
          let p = pending;
          while (p) {
            const run = await game.run();
            expect(run.summary.steps).toBeLessThanOrEqual(1);
            p = run.summary.pending;
            await check();
          }
        };
        await check();
        await drain(created.automation.pending);
        let rebelsMovedAfterHuman = 0;
        for (let i = 0; i < 400; i += 1) {
          const state = await check();
          if (state.outcome !== null) break;
          expect(state.activeSide).toBe('empire');
          const reply = await game.send(huntingEmpire(state));
          if (reply.summary.steps > 0) rebelsMovedAfterHuman += 1;
          await check();
          await drain(reply.summary.pending);
        }
        const final = await game.state();
        expect(final.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
        expect(rebelsMovedAfterHuman).toBeGreaterThan(0);
        expect(await game.get()).toMatchObject({
          status: 'completed',
          automation: { pending: false },
        });
        await expectConsecutiveEvents(app, game.id);
        note(
          `TC-OUT-07 ${id} E-HUNT vs AI rebels hard (maxSteps=1): states checked=${checked} emptyBase=0 finalVersion=${final.version}`,
        );
      }
    },
    FULL_GAME_TIMEOUT,
  );

  it(
    'TC-DIF-10: engine harness ≡ API — the same scripts give equal stored states and event rows (E-HUNT vs easy Rebels; R-PASSIVE vs hard Empire)',
    async () => {
      const cases = [
        { id: 'swr006-d02', setup: empireVsAi('easy'), human: huntingEmpire },
        { id: 'swr006-d03', setup: rebelsVsAi('hard'), human: passiveHuman },
      ];
      const { app } = await newApp(cases.map((c) => c.id));
      for (const c of cases) {
        const engine = engineGame(rebellionServerModule, c.id, c.setup, c.human);
        const { game } = await AutomatedGame.create(app, c.setup);
        const sent: HumanCommand[] = [];
        await game.playToEnd(c.human, { onReply: (_r, command) => sent.push(command) });
        expect(sent).toEqual(engine.humanCommands);
        const row = await storedRow(app, c.id);
        // Same content; the key order of log entries differs (the server re-serialises the parsed state).
        expect(JSON.parse(row.state)).toEqual(engine.state);
        const events = await game.events();
        expect(events).toEqual(
          engine.state.log.map((e) => ({
            seq: e.seq,
            type: e.type,
            actor: e.actor,
            payload: e.payload,
          })),
        );
        note(
          `TC-DIF-10 ${c.id} ${c.setup.playerFaction} vs AI ${c.setup.aiDifficulty}: engine≡API version=${engine.state.version} ` +
            `outcome=${JSON.stringify(engine.state.outcome)} humanCommands=${sent.length}`,
        );
      }
    },
    FULL_GAME_TIMEOUT,
  );
});
