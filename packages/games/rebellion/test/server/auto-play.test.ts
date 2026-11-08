/**
 * Server auto-play of the AI side (SWR-005 W5; AC-08; TC-AI-03..07a, TC-AI-09, TC-AI-10, TC-AI-12, TC-AI-17)
 * on the REAL base-game data, through `runAutoPlay` and the server module.
 */
import { describe, expect, it } from 'vitest';
import { chooseAutoCommand, type AutoPolicy } from '../../src/ai';
import { createCoreGame, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  CoreGameStateV3Schema,
  type Command,
  type CoreGameState,
  type CorePlayerView,
  type GameEvent,
} from '../../src/schema';
import { MAX_AUTO_STEPS, aiSideOf, runAutoPlay } from '../../src/server/auto-play';
import { deepFreeze, mulberry32 } from '../rules/helpers';
import {
  EMPIRE_VS_AI,
  HOT_SEAT,
  NOW,
  REBELS_VS_AI,
  activate,
  finish,
  pass,
  play,
  send,
  sessionView,
  start,
} from './core-script';

function summary(events: readonly GameEvent[]) {
  return events.map((e) => ({
    type: e.type,
    actor: e.actor,
    ...(e.type === 'PASSED' || e.type === 'ACTIVATION_FINISHED' ? { auto: e.payload.auto } : {}),
  }));
}

function ok(result: ReturnType<typeof send>) {
  if (!result.ok) throw new Error(`rejected: ${result.error.messageKey}`);
  return result;
}

describe('runAutoPlay', () => {
  it('no-op for hot-seat games, finished games and when the player is active', () => {
    const hotSeat = deepFreeze(createCoreGame(HOT_SEAT, coreDataBaseV1, { gameId: 'h', now: NOW }));
    expect(aiSideOf(hotSeat)).toBeNull();
    expect(runAutoPlay(hotSeat, { now: NOW })).toEqual({ state: hotSeat, events: [] });

    const rebelsTurn = deepFreeze(
      createCoreGame(REBELS_VS_AI, coreDataBaseV1, { gameId: 'r', now: NOW }),
    );
    expect(aiSideOf(rebelsTurn)).toBe('empire');
    expect(runAutoPlay(rebelsTurn, { now: NOW })).toEqual({ state: rebelsTurn, events: [] });

    const over: CoreGameState = deepFreeze({
      ...createCoreGame(EMPIRE_VS_AI, coreDataBaseV1, { gameId: 'e', now: NOW }),
      outcome: { winner: 'empire', reason: 'rebelBaseCaptured' },
    });
    expect(runAutoPlay(over, { now: NOW, policy: () => null })).toEqual({
      state: over,
      events: [],
    });
  });

  it('AI Rebels at creation: one automatic pass (actor rebels, auto), version 2, Empire to move; input not mutated', () => {
    const created = deepFreeze(
      createCoreGame(EMPIRE_VS_AI, coreDataBaseV1, { gameId: 'e', now: NOW }),
    );
    const { state, events } = runAutoPlay(created, { now: NOW });
    expect(summary(events)).toEqual([{ type: 'PASSED', actor: 'rebels', auto: true }]);
    expect(state).toMatchObject({
      version: 2,
      activeSide: 'empire',
      handoffPending: false,
      passed: { rebels: true, empire: false },
    });
    CoreGameStateV3Schema.parse(state);
  });

  it('the policy receives exactly toSideView(state, aiSide) — the AI Empire never sees the hidden base', () => {
    const seen: CorePlayerView[] = [];
    const spy: AutoPolicy = (view) => {
      seen.push(view);
      return chooseAutoCommand(view);
    };
    const created = createCoreGame(REBELS_VS_AI, coreDataBaseV1, { gameId: 'spy', now: NOW });
    const base = created.rebelBase.systemId;
    // The transient state right after the player's pass (the AI Empire to move).
    const passedOnly: CoreGameState = {
      ...created,
      version: 2,
      activeSide: 'empire',
      passed: { rebels: true, empire: false },
    };
    runAutoPlay(passedOnly, { now: NOW, policy: spy });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(toSideView(passedOnly, 'empire'));
    expect(seen[0]?.viewer).toBe('empire');
    expect(seen[0]?.rebelBase.systemId).toBeNull();
    const { map: _map, legalActions, ...rest } = seen[0] as CorePlayerView;
    const targets = legalActions.flatMap((a) => (a.type === 'ACTIVATE_SYSTEM' ? [] : [a]));
    expect(JSON.stringify({ rest, targets })).not.toContain(`"${base}"`);
  });

  it('TC-AI-09: more than maxSteps automatic moves → throw (default limit 16)', () => {
    expect(MAX_AUTO_STEPS).toBe(16);
    // The player (Rebels) has passed: the AI Empire acts on consecutive turns — activate, then finish.
    const created = createCoreGame(REBELS_VS_AI, coreDataBaseV1, { gameId: 'lim', now: NOW });
    const aiTurn: CoreGameState = {
      ...created,
      version: 2,
      activeSide: 'empire',
      passed: { rebels: true, empire: false },
    };
    const busy: AutoPolicy = (view): Command | null => {
      const activate = view.legalActions.find((a) => a.type === 'ACTIVATE_SYSTEM');
      if (activate && activate.type === 'ACTIVATE_SYSTEM') {
        return {
          type: 'ACTIVATE_SYSTEM',
          leaderId: activate.leaderIds[0] ?? '',
          systemId: 'kessel',
        };
      }
      return chooseAutoCommand(view);
    };
    // 4 leaders × (activate + finish) + final pass (→ refresh, Rebels to move) = 9 moves.
    const fine = runAutoPlay(aiTurn, { now: NOW, policy: busy });
    expect(fine.events.filter((e) => e.type === 'SYSTEM_ACTIVATED')).toHaveLength(4);
    expect(fine.state).toMatchObject({ round: 2, activeSide: 'rebels', version: 11 });
    expect(() => runAutoPlay(aiTurn, { now: NOW, policy: busy, maxSteps: 8 })).toThrow(
      'auto-play: more than 8 automatic moves',
    );
  });

  it('TC-AI-12: no move / an engine rejection → throw without state data; input not mutated', () => {
    const created = deepFreeze(
      createCoreGame(EMPIRE_VS_AI, coreDataBaseV1, { gameId: 'bad', now: NOW }),
    );
    const base = created.rebelBase.systemId;
    expect(() => runAutoPlay(created, { now: NOW, policy: () => null })).toThrow(
      'auto-play: the AI policy returned no move',
    );
    const illegal: AutoPolicy = () => ({
      type: 'MOVE_PIECES',
      pieceIds: ['u-09'],
      fromSystemId: base,
      toSystemId: 'bothawui',
    });
    let message = '';
    try {
      runAutoPlay(created, { now: NOW, policy: illegal });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('auto-play: the engine rejected the AI move (ILLEGAL_COMMAND)');
    expect(message).not.toContain(base);
  });
});

describe('server module: player command + AI auto-play in one call', () => {
  it('TC-AI-03/04: Rebels activate + finish → the AI Empire passes (auto) in the same response; then no more AI moves', () => {
    const game = start(REBELS_VS_AI, 'ai-reb-1');
    expect(game.state.version).toBe(1);
    const activated = ok(send(game.state, activate('rebels', 'leia', 'toydaria')));
    expect(summary(activated.events)).toEqual([{ type: 'SYSTEM_ACTIVATED', actor: 'rebels' }]);
    const finished = ok(send(activated.state, finish('rebels')));
    expect(summary(finished.events)).toEqual([
      { type: 'ACTIVATION_FINISHED', actor: 'rebels', auto: false },
      { type: 'PASSED', actor: 'empire', auto: true },
    ]);
    expect(finished.state).toMatchObject({
      activeSide: 'rebels',
      handoffPending: false,
      version: 4,
      passed: { rebels: false, empire: true },
    });
    // Q-19: each engine command +1, the response carries the version after the last automatic move.
    expect(sessionView(finished.state)).toMatchObject({ version: 4, viewer: 'rebels' });
    const stale = send(finished.state, activate('rebels', 'dodonna', 'kessel'), 3);
    expect(stale).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });

    const again = ok(send(finished.state, activate('rebels', 'dodonna', 'kessel')));
    const again2 = ok(send(again.state, finish('rebels')));
    expect(summary(again2.events)).toEqual([
      { type: 'ACTIVATION_FINISHED', actor: 'rebels', auto: false },
    ]);
    expect(again2.state.activeSide).toBe('rebels');
  });

  it('TC-AI-05: Rebels pass first → AI passes → refresh → new round → Rebels to move, all in one response', () => {
    const game = start(REBELS_VS_AI, 'ai-reb-2');
    const passed = ok(send(game.state, pass('rebels')));
    expect(passed.events.map((e) => `${e.type}:${e.actor}`)).toEqual([
      'PASSED:rebels',
      'PASSED:empire',
      'PHASE_STARTED:system',
      'LEADERS_RETURNED:system',
      'TIME_ADVANCED:system',
      'PHASE_STARTED:system',
      'PHASE_STARTED:system',
    ]);
    expect(passed.state).toMatchObject({ round: 2, activeSide: 'rebels', version: 3 });
  });

  it('TC-AI-06/07/07a: AI Rebels pass at creation; Empire activates on consecutive turns; Empire pass → new round → AI pass again', () => {
    const game = start(EMPIRE_VS_AI, 'ai-emp-1');
    expect(game.state).toMatchObject({ version: 2, activeSide: 'empire', round: 1 });
    expect(summary(game.events).at(-1)).toEqual({ type: 'PASSED', actor: 'rebels', auto: true });
    expect(game.events.map((e) => e.seq)).toEqual(game.state.log.map((e) => e.seq));
    expect(sessionView(game.state)).toMatchObject({ viewer: 'empire', version: 2 });

    const activated = ok(send(game.state, activate('empire', 'vader', 'kessel')));
    const finished = ok(send(activated.state, finish('empire')));
    expect(summary(finished.events)).toEqual([
      { type: 'ACTIVATION_FINISHED', actor: 'empire', auto: false },
    ]);
    expect(finished.state.activeSide).toBe('empire');

    const passed = ok(send(finished.state, pass('empire')));
    expect(passed.events.map((e) => e.type)).toEqual([
      'PASSED',
      'PHASE_STARTED',
      'LEADERS_RETURNED',
      'TIME_ADVANCED',
      'PHASE_STARTED',
      'PHASE_STARTED',
      'PASSED',
    ]);
    expect(passed.events.at(-1)).toMatchObject({ actor: 'rebels', payload: { auto: true } });
    expect(passed.state).toMatchObject({ round: 2, activeSide: 'empire', version: 6 });
  });

  it('TC-AI-11: a player command for the AI side → 422 notYourSide, nothing changes', () => {
    const game = start(REBELS_VS_AI, 'ai-reb-3');
    const frozen = JSON.stringify(game.state);
    expect(send(game.state, pass('empire'))).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notYourSide' },
    });
    expect(JSON.stringify(game.state)).toBe(frozen);
  });

  it('TC-AI-17: random legal play — every stored AI state has the player active (unless over), no handoff, player view', () => {
    for (const [settings, seed] of [
      [REBELS_VS_AI, 7],
      [EMPIRE_VS_AI, 11],
    ] as const) {
      const random = mulberry32(seed);
      let { state } = start(settings, `ai-random-${seed}`);
      const player = settings.playerFaction;
      for (let i = 0; i < 120 && state.outcome === null; i += 1) {
        const view = sessionView(state);
        if (view.kind !== 'player' || view.rulesEngine !== 'core-v1')
          throw new Error('board expected');
        expect(view.viewer).toBe(player);
        const actions = view.legalActions;
        const action = actions[Math.floor(random() * actions.length)];
        if (!action) throw new Error('no legal action for the player');
        let command: Command;
        switch (action.type) {
          case 'ACTIVATE_SYSTEM':
            command = {
              type: 'ACTIVATE_SYSTEM',
              leaderId: action.leaderIds[Math.floor(random() * action.leaderIds.length)] ?? '',
              systemId: action.systemIds[Math.floor(random() * action.systemIds.length)] ?? '',
            };
            break;
          case 'MOVE_PIECES': {
            const free = action.pieces.filter((p) => !p.requiresTransport).map((p) => p.pieceId);
            if (free.length === 0) {
              command = { type: 'FINISH_ACTIVATION' };
              break;
            }
            command = {
              type: 'MOVE_PIECES',
              pieceIds: free,
              fromSystemId: action.fromSystemId,
              toSystemId: action.toSystemId,
            };
            break;
          }
          default:
            command = { type: action.type };
        }
        const result = ok(send(state, { actor: player, command }));
        state = CoreGameStateV3Schema.parse(JSON.parse(JSON.stringify(result.state)));
        expect(state.handoffPending).toBe(false);
        if (state.outcome === null) expect(state.activeSide).toBe(player);
      }
      expect(state.round).toBeGreaterThan(1);
    }
  });

  it('the scripted helper `play` validates every stored state (sanity)', () => {
    const played = play(start(REBELS_VS_AI, 'ai-reb-4'), [pass('rebels'), pass('rebels')]);
    expect(played.state.round).toBe(3);
  });
});
