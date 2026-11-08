/**
 * Golden scripted games on the REAL base-game data through the server module (SWR-005 W5; AC-14, AC-07,
 * AC-08, AC-10; TC-G-01..04, TC-G-07, TC-AI-08) + the exported reference views for FE/QA
 * (`test/fixtures/core/views/*.json`) and the seedable e2e states (`test/fixtures/core/seeds/*.json`, Q-35).
 * Every fixture is compared by default; `UPDATE_GOLDEN=1` rewrites them (never silently).
 */
import { describe, expect, it } from 'vitest';
import { chooseRebelBase } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  eligibleRebelBaseSystemIds,
  toStoredSetup,
  type CorePlayerView,
  type PlayerView,
} from '../../src/schema';
import { rebellionServerModule } from '../../src/server';
import {
  NOW,
  UPDATE_GOLDEN,
  eventLine,
  expectGolden,
  move,
  play,
  send,
  sessionView,
  type Played,
} from './core-script';
import {
  BASE_SYSTEM,
  EMPIRE_WIN_SESSION,
  EMPIRE_WIN_STEPS,
  REBELS_TIME_SESSION,
  SEED_REVEAL_NEXT,
  SEED_REVEAL_SESSION,
  SEED_WIN_NEXT,
  SEED_WIN_SESSION,
  playEmpireWin,
  playRebelsTimeWin,
  playSeedReveal,
  playSeedWin,
} from './core-scenarios';

function board(view: PlayerView): CorePlayerView {
  if (view.kind !== 'player' || view.rulesEngine !== 'core-v1') {
    throw new Error('expected a core-v1 board view');
  }
  return view;
}

function types(played: Played): string[] {
  return played.events.map((e) => e.type);
}

function golden(played: Played, sessionId: string) {
  return {
    sessionId,
    now: NOW,
    eventCount: played.events.length,
    events: played.events.map(eventLine),
    finalState: played.state,
  };
}

/** Everything of an Empire view that may mention the base system id legally: the static map and the
 *  ACTIVATE_SYSTEM target list (= all systems). Anything else mentioning it is a leak (AC-10). */
function withoutPublicSystemLists(view: CorePlayerView): unknown {
  return {
    ...view,
    map: null,
    legalActions: view.legalActions.map((a) =>
      a.type === 'ACTIVATE_SYSTEM' ? { ...a, systemIds: [] } : a,
    ),
  };
}

describe('golden scripted games (real data)', () => {
  it('all scripted sessions put the base in Rodia (deterministic by sessionId, R-10)', () => {
    const eligible = eligibleRebelBaseSystemIds(coreDataBaseV1);
    for (const id of [EMPIRE_WIN_SESSION, SEED_REVEAL_SESSION, SEED_WIN_SESSION]) {
      expect(chooseRebelBase(id, eligible), id).toBe(BASE_SYSTEM);
    }
  });

  it('TC-G-01/02: hot-seat, 2 rounds, reveal on FINISH_ACTIVATION, Empire wins after the Rebel evacuation', () => {
    const game = playEmpireWin();
    const { final } = game;
    const t = types(final);

    expect(final.state.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
    expect(final.state.round).toBe(2);
    expect(final.state.rebelBase).toEqual({ systemId: BASE_SYSTEM, revealed: true });
    expect(rebellionServerModule.statusOf(final.state)).toBe('completed');
    expect(t.filter((x) => x === 'TIME_ADVANCED')).toHaveLength(1);
    // Q-41: ACTIVATION_FINISHED → BASE_REVEALED (no victory yet: Rebels still on the base).
    const reveal = t.indexOf('BASE_REVEALED');
    expect(t[reveal - 1]).toBe('ACTIVATION_FINISHED');
    expect(t[reveal + 1]).not.toBe('GAME_OVER');
    // R-9 after a MOVE_PIECES of the Rebels: the last two events.
    expect(t.slice(-2)).toEqual(['PIECES_MOVED', 'GAME_OVER']);
    expect(final.events.at(-2)?.actor).toBe('rebels');
    expect(t.filter((x) => x === 'GAME_OVER')).toHaveLength(1);
    // Contested system (D-1) and an activation of a system with an own leader (R-4) happened.
    expect(board(sessionView(game.empirePrereveal.state)).contestedSystemIds).toContain(
      'malastare',
    );
    expect(
      final.events.filter(
        (e) => e.type === 'SYSTEM_ACTIVATED' && e.payload.systemId === 'malastare',
      ),
    ).toHaveLength(3);
    // Game over: no legal actions, any command → 422 gameOver (AC-07).
    const view = board(sessionView(final.state));
    expect(view.legalActions).toEqual([]);
    const after = send(final.state, { actor: 'rebels', command: { type: 'PASS' } });
    expect(after).toMatchObject({ ok: false, error: { messageKey: 'errors.gameOver' } });

    // Two runs → identical; golden snapshot (< 100 KB).
    expect(playEmpireWin()).toEqual(game);
    const snapshot = golden(final, EMPIRE_WIN_SESSION);
    expect(JSON.stringify(snapshot).length).toBeLessThan(100_000);
    expectGolden('golden-empire-win.json', snapshot);
  });

  it('TC-G-04: an illegal command in the middle is rejected (unchanged state) and the result equals the golden', () => {
    const insertAt = 6; // right after the Empire activated Malastare (round 1)
    const before = play(playEmpireWin().rebelsCommand, EMPIRE_WIN_STEPS.slice(2, insertAt));
    expect(before.state.activation).toMatchObject({ side: 'empire', systemId: 'malastare' });
    // TIE fighter alone: needs a transport (R-5) → insufficientCapacity, nothing changes.
    const frozen = JSON.stringify(before.state);
    const rejected = send(before.state, move('empire', ['u-42'], 'sullust', 'malastare'));
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.insufficientCapacity' },
    });
    expect(JSON.stringify(before.state)).toBe(frozen);
    const rest = play(before, EMPIRE_WIN_STEPS.slice(insertAt));
    expect(rest).toEqual(playEmpireWin().final);
  });

  it('TC-G-03 / TC-AI-08: Rebels vs AI Empire, 13 passes → time 14 = reputation → Rebels win', () => {
    const { beforeLast, final } = playRebelsTimeWin();
    expect(beforeLast.state).toMatchObject({ round: 13, outcome: null, activeSide: 'rebels' });
    expect(rebellionServerModule.statusOf(beforeLast.state)).toBe('prototype');

    expect(final.state.round).toBe(14);
    expect(final.state.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    expect(rebellionServerModule.statusOf(final.state)).toBe('completed');
    expect(types(final).filter((t) => t === 'TIME_ADVANCED')).toHaveLength(13);
    // Every AI move is an automatic pass of the Empire.
    const passes = final.events.filter((e) => e.type === 'PASSED');
    expect(passes).toHaveLength(26);
    for (const p of passes) {
      expect(p.type === 'PASSED' && p.payload.auto).toBe(p.actor === 'empire');
    }
    // The game ended on the AI's pass (active side = AI) — the view is still the player's (TC-AI-17).
    expect(final.state.activeSide).toBe('empire');
    const view = board(sessionView(final.state));
    expect(view).toMatchObject({ viewer: 'rebels', legalActions: [] });
    expect(view.outcome).toEqual(final.state.outcome);
    // 1 version per engine command: created v1, 13 × (player + AI) = v27.
    expect(final.state.version).toBe(27);

    expect(playRebelsTimeWin().final).toEqual(final);
    expectGolden('golden-rebels-time.json', golden(final, REBELS_TIME_SESSION));
  });
});

describe('reference views for FE/QA (test/fixtures/core/views)', () => {
  it('rebels-command / handoff / empire-prereveal / empire-revealed / game-over', () => {
    const game = playEmpireWin();
    const rebelsCommand = board(sessionView(game.rebelsCommand.state));
    expect(rebelsCommand).toMatchObject({ viewer: 'rebels', phase: 'command' });
    expect(rebelsCommand.activation).toMatchObject({ side: 'rebels', leaderId: 'leia' });
    expect(rebelsCommand.rebelBase).toEqual({ systemId: BASE_SYSTEM, revealed: false });
    expect(rebelsCommand.legalActions.map((a) => a.type)).toContain('MOVE_PIECES');

    const handoff = sessionView(game.handoff.state);
    expect(handoff).toEqual({
      kind: 'handoff',
      rulesEngine: 'core-v1',
      id: EMPIRE_WIN_SESSION,
      version: game.handoff.state.version,
      activeSide: 'empire',
      round: 1,
      phase: 'command',
      sessionStatus: 'prototype',
    });

    const prereveal = board(sessionView(game.empirePrereveal.state));
    expect(prereveal).toMatchObject({ viewer: 'empire', activeSide: 'empire', round: 2 });
    expect(prereveal.rebelBase).toEqual({ systemId: null, revealed: false });
    expect(prereveal.units.filter((u) => u.location.kind === 'rebelBase')).toHaveLength(7);
    expect(JSON.stringify(withoutPublicSystemLists(prereveal))).not.toContain(BASE_SYSTEM);

    // A real session view of the Empire after the reveal: AI game (the Rebels passed), Empire still to move.
    const revealedGame = play(playSeedReveal(), SEED_REVEAL_NEXT);
    const revealed = board(sessionView(revealedGame.state));
    expect(revealed).toMatchObject({ viewer: 'empire', activeSide: 'empire', outcome: null });
    expect(revealed.rebelBase).toEqual({ systemId: BASE_SYSTEM, revealed: true });
    expect(revealed.units.some((u) => u.location.kind === 'rebelBase')).toBe(false);
    expect(revealed.log.some((e) => e.type === 'BASE_REVEALED')).toBe(true);

    const gameOver = board(sessionView(game.final.state));
    expect(gameOver).toMatchObject({
      viewer: 'rebels',
      outcome: { winner: 'empire', reason: 'rebelBaseCaptured' },
      legalActions: [],
    });

    expectGolden('views/rebels-command.json', rebelsCommand);
    expectGolden('views/handoff.json', handoff);
    expectGolden('views/empire-prereveal.json', prereveal);
    expectGolden('views/empire-revealed.json', revealed);
    expectGolden('views/game-over.json', gameOver);
  });
});

describe('seedable core-v1 states for e2e (Q-35, scenarios 4 / 5b)', () => {
  /** What QA writes into the e2e DB: the row columns + the next commands of the scenario. */
  function seed(
    played: Played,
    description: string,
    next: typeof SEED_WIN_NEXT,
    expectAfter: unknown,
  ) {
    return {
      description,
      sessionId: played.state.id,
      rebelBaseSystemId: played.state.rebelBase.systemId,
      row: {
        id: played.state.id,
        gameId: 'star-wars-rebellion', // catalogue id (REBELLION_GAME_ID), as in the Session row
        status: rebellionServerModule.statusOf(played.state),
        version: played.state.version,
        setup: toStoredSetup(played.state.settings),
      },
      nextCommands: next.map((s) => ({ actor: s.actor, command: s.command })),
      expectAfter,
      state: played.state,
    };
  }

  it('scenario 4: AI game (player Empire), one activation before the reveal', () => {
    const seeded = playSeedReveal();
    expect(seeded.state).toMatchObject({
      round: 2,
      activeSide: 'empire',
      activation: null,
      outcome: null,
      rebelBase: { systemId: BASE_SYSTEM, revealed: false },
    });
    const after = play(seeded, SEED_REVEAL_NEXT);
    expect(after.state.rebelBase.revealed).toBe(true);
    expect(after.state.outcome).toBeNull();
    expectGolden(
      'seeds/ai-empire-before-reveal.json',
      seed(
        seeded,
        'Empire vs AI Rebels, round 2, Empire to move. Next: activate Rodia with Vader, move u-40/u-43/u-45 from Malastare, finish → BASE_REVEALED (no victory: Rebel units stay on the base).',
        SEED_REVEAL_NEXT,
        { revealed: true, outcome: null },
      ),
    );
  });

  it('scenario 5b: hot-seat, Empire to move, the Rebels evacuated the hidden base — one activation before the win', () => {
    const seeded = playSeedWin();
    expect(seeded.state).toMatchObject({
      round: 2,
      activeSide: 'empire',
      handoffPending: false,
      activation: null,
      outcome: null,
      rebelBase: { systemId: BASE_SYSTEM, revealed: false },
    });
    expect(
      seeded.state.units.filter((u) => u.systemId === BASE_SYSTEM && u.owner === 'rebels'),
    ).toEqual([]);
    const after = play(seeded, SEED_WIN_NEXT);
    expect(after.state.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
    expect(after.events.slice(-3).map((e) => e.type)).toEqual([
      'ACTIVATION_FINISHED',
      'BASE_REVEALED',
      'GAME_OVER',
    ]);
    expectGolden(
      'seeds/hotseat-empire-before-win.json',
      seed(
        seeded,
        'Hot-seat (Rebels vs Empire), round 2, Empire to move (handoff accepted), base hidden and empty of Rebel units. Next: activate Rodia with Vader, move u-40/u-43/u-45 from Malastare, finish → BASE_REVEALED + GAME_OVER (Empire, rebelBaseCaptured).',
        SEED_WIN_NEXT,
        { revealed: true, outcome: { winner: 'empire', reason: 'rebelBaseCaptured' } },
      ),
    );
  });

  it('TC-G-07: golden files are only rewritten with UPDATE_GOLDEN=1', () => {
    expect(UPDATE_GOLDEN).toBe(process.env['UPDATE_GOLDEN'] === '1');
  });
});
