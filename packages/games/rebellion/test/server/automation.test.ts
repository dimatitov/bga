/**
 * SWR-006 W5: Rebellion `GameAutomation` (plan-backend §5, §9.1; Contract §1; PO test 5 → AC-02; TC-AI-11,
 * TC-AI-17 on the real base-game data). Replaces the SWR-005 `auto-play` tests: the module no longer moves
 * for the AI side itself; the runner does it step by step through `automation`.
 */
import { AutomationDecisionPointSchema, type GameAutomation } from '@bga/platform';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDecision, chooseAutoCommand, type AutoPolicy } from '../../src/ai';
import { createCoreGame, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  CoreGameStateV3Schema,
  GameStateSchema,
  type Command,
  type CoreGameState,
  type CorePlayerView,
  type Difficulty,
  type Faction,
  type GameEvent,
  type GameState,
  type RebellionSettings,
} from '../../src/schema';
import {
  aiSideOf,
  createRebellionAutomation,
  rebellionServerModule,
  upcastState,
} from '../../src/server';
import { deepFreeze, mulberry32 } from '../rules/helpers';
import { playRebelsTimeWin } from './core-scenarios';
import { EMPIRE_VS_AI, HOT_SEAT, NOW, REBELS_VS_AI, pass, send, start } from './core-script';
import { drain } from './drain-automation';

const automation = rebellionServerModule.automation as GameAutomation<GameState, GameEvent>;

function created(settings: RebellionSettings, gameId: string): CoreGameState {
  return createCoreGame(settings, coreDataBaseV1, { gameId, now: NOW });
}

/** Player Rebels passed: the AI Empire to move (round 1). */
function empireToMove(gameId: string, difficulty: Difficulty = 'normal'): CoreGameState {
  const settings = { ...REBELS_VS_AI, aiDifficulty: difficulty };
  const state = created(settings, gameId);
  const result = rebellionServerModule.applyCommand(
    state,
    { actor: 'rebels', expectedVersion: state.version, command: { type: 'PASS' } },
    { now: NOW },
  );
  if (!result.ok) throw new Error('PASS rejected');
  return CoreGameStateV3Schema.parse(result.state);
}

function mockAiState(): GameState {
  const raw = JSON.parse(
    readFileSync(new URL('../fixtures/v2/state.v2.empire-ai.json', import.meta.url), 'utf8'),
  ) as { state: unknown };
  return upcastState(raw.state);
}

describe('isAutomated / pendingActor', () => {
  it('hot-seat core-v1 and mock-v1: not automated, never pending', () => {
    const hotSeat = created(HOT_SEAT, 'h');
    expect(aiSideOf(hotSeat)).toBeNull();
    expect(automation.isAutomated(hotSeat)).toBe(false);
    expect(automation.pendingActor(hotSeat)).toBeNull();
    expect(automation.pendingActor({ ...hotSeat, activeSide: 'empire' })).toBeNull();

    const mock = mockAiState();
    expect(mock.rulesEngine).toBe('mock-v1');
    expect(mock.settings.opponentType).toBe('ai');
    expect(automation.isAutomated(mock)).toBe(false);
    expect(automation.pendingActor(mock)).toBeNull();
    expect(automation.pendingActor({ ...mock, activeSide: 'rebels' })).toBeNull();
    expect(() => automation.decisionPoint(mock)).toThrow('no automated move is pending');
  });

  it('core-v1 AI game: automated; pending only on the AI turn, without handoff, before the outcome', () => {
    const playerTurn = created(REBELS_VS_AI, 'p');
    expect(automation.isAutomated(playerTurn)).toBe(true);
    expect(automation.pendingActor(playerTurn)).toBeNull();

    const aiRebels = created(EMPIRE_VS_AI, 'e');
    expect(aiRebels.activeSide).toBe('rebels');
    expect(automation.pendingActor(aiRebels)).toBe('rebels');
    expect(automation.pendingActor(empireToMove('x'))).toBe('empire');
    // A (never stored) handoff in an AI game is not an automated turn.
    expect(automation.pendingActor({ ...aiRebels, handoffPending: true })).toBeNull();

    // Game over on the AI's pass: the AI side is active, but nothing is pending.
    const over = playRebelsTimeWin().final.state;
    expect(over).toMatchObject({ activeSide: 'empire', outcome: { winner: 'rebels' } });
    expect(automation.isAutomated(over)).toBe(true);
    expect(automation.pendingActor(over)).toBeNull();
    expect(() => automation.decisionPoint(over)).toThrow('no automated move is pending');
  });
});

describe('decisionPoint', () => {
  it('≡ buildDecision(toSideView(state, aiSide)).point; parses with the platform schema; deterministic', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const state of [
        empireToMove(`dp-${difficulty}`, difficulty),
        created({ ...EMPIRE_VS_AI, aiDifficulty: difficulty }, `dp-r-${difficulty}`),
      ]) {
        const aiSide = automation.pendingActor(state) as Faction;
        const point = automation.decisionPoint(deepFreeze(state));
        expect(point).toEqual(buildDecision(toSideView(state, aiSide))?.point);
        expect(AutomationDecisionPointSchema.parse(point)).toEqual(point);
        expect(point).toMatchObject({
          actor: aiSide,
          phase: 'command',
          fallbackCandidateId: 'c1',
          policyId: `rebellion-bot-v1:${difficulty}`,
        });
        expect(automation.decisionPoint(state)).toEqual(point);
      }
    }
  });

  it('the policy receives exactly toSideView(state, aiSide) — the AI Empire never sees the hidden base', () => {
    const seen: CorePlayerView[] = [];
    const spy: AutoPolicy = (view) => {
      seen.push(view);
      return chooseAutoCommand(view);
    };
    const spyAutomation = createRebellionAutomation({ policy: spy });
    const state = empireToMove('spy');
    const base = state.rebelBase.systemId;
    const point = spyAutomation.decisionPoint(state);
    expect(point.policyId).toBe('auto-pass-v1');
    spyAutomation.applyCandidate(state, point.fallbackCandidateId, { now: NOW });
    expect(seen).toHaveLength(2);
    for (const view of seen) {
      expect(view).toEqual(toSideView(state, 'empire'));
      expect(view.viewer).toBe('empire');
      expect(view.rebelBase.systemId).toBeNull();
      const { map: _map, legalActions, ...rest } = view;
      const targets = legalActions.filter((a) => a.type !== 'ACTIVATE_SYSTEM');
      expect(JSON.stringify({ rest, targets })).not.toContain(`"${base}"`);
    }
  });
});

describe('applyCandidate', () => {
  it('every candidate is legal: origin auto, version + 1, actor = AI side, input not mutated', () => {
    for (const state of [empireToMove('ac-1'), created(EMPIRE_VS_AI, 'ac-2')]) {
      const frozen = deepFreeze(state);
      const snapshot = JSON.stringify(frozen);
      const aiSide = automation.pendingActor(frozen) as Faction;
      const point = automation.decisionPoint(frozen);
      expect(point.candidates.length).toBeGreaterThan(1);
      for (const candidate of point.candidates) {
        const result = automation.applyCandidate(frozen, candidate.id, { now: NOW });
        if (!result.ok) throw new Error(`${candidate.id} rejected: ${result.error.messageKey}`);
        expect(result.state.version).toBe(frozen.version + 1);
        GameStateSchema.parse(JSON.parse(JSON.stringify(result.state)));
        const first = result.events[0];
        expect(first?.actor).toBe(aiSide);
        expect(first?.type).not.toBe('HANDOFF_ACCEPTED');
        for (const event of result.events) {
          expect(event.at).toBe(NOW);
          expect(['system', aiSide]).toContain(event.actor);
          if (event.type === 'PASSED' || event.type === 'ACTIVATION_FINISHED') {
            expect(event.payload.auto).toBe(true);
          }
        }
      }
      expect(JSON.stringify(frozen)).toBe(snapshot);
    }
  });

  it('unknown candidate id → ILLEGAL_COMMAND commandUnavailable, only the id in details, nothing changes', () => {
    const state = deepFreeze(empireToMove('unknown'));
    const snapshot = JSON.stringify(state);
    for (const id of ['c99', 'c0', 'x', '', state.rebelBase.systemId]) {
      const result = automation.applyCandidate(state, id, { now: NOW });
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'ILLEGAL_COMMAND',
          messageKey: 'errors.commandUnavailable',
          details: { candidateId: id },
        },
      });
    }
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('PO test 5: never acts for the human side — the human turn, hot-seat, mock-v1 and a finished game → notYourTurn', () => {
    const notYourTurn = {
      ok: false,
      error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notYourTurn' },
    };
    const humanTurn = created(REBELS_VS_AI, 'human-turn');
    const hotSeat = created(HOT_SEAT, 'hot-seat');
    const over = playRebelsTimeWin().final.state;
    for (const state of [humanTurn, hotSeat, { ...hotSeat, activeSide: 'empire' as const }, over]) {
      const frozen = deepFreeze(state);
      expect(automation.applyCandidate(frozen, 'c1', { now: NOW })).toEqual(notYourTurn);
    }
    expect(automation.applyCandidate(mockAiState(), 'c1', { now: NOW })).toEqual(notYourTurn);
  });

  it('TC-AI-11: a player command for the AI side → 422 notYourSide, also while the AI is to move', () => {
    for (const state of [created(REBELS_VS_AI, 'side-1'), empireToMove('side-2')]) {
      const snapshot = JSON.stringify(state);
      expect(
        rebellionServerModule.applyCommand(
          state,
          { actor: 'empire', expectedVersion: state.version, command: { type: 'PASS' } },
          { now: NOW },
        ),
      ).toMatchObject({
        ok: false,
        error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notYourSide' },
      });
      expect(JSON.stringify(state)).toBe(snapshot);
    }
  });
});

describe('drain with the real bot (runner stand-in)', () => {
  it('AI Rebels at creation: the bot plays until the Empire is to move; every step + 1 version, auto, actor rebels', () => {
    const state = created(EMPIRE_VS_AI, 'bot-rebels');
    const { state: after, events, steps } = drain(rebellionServerModule, state, NOW);
    expect(steps).toBeGreaterThan(0);
    expect(after.version).toBe(state.version + steps);
    expect(after.outcome).toBeNull();
    expect(after.activeSide).toBe('empire');
    expect(automation.pendingActor(after)).toBeNull();
    for (const e of events) expect(['system', 'rebels']).toContain(e.actor);
    expect(drain(rebellionServerModule, state, NOW)).toEqual({ state: after, events, steps });
  });

  it('the auto-pass test policy reproduces SWR-005: AI Rebels pass once at creation (version 2)', () => {
    const played = start(EMPIRE_VS_AI, 'pass-1');
    expect(played.state).toMatchObject({ version: 2, activeSide: 'empire' });
    expect(played.events.at(-1)).toMatchObject({
      type: 'PASSED',
      actor: 'rebels',
      payload: { auto: true },
    });
    const next = send(played.state, pass('empire'));
    expect(next).toMatchObject({ ok: true, state: { version: 4, activeSide: 'empire' } });
  });

  it('TC-AI-17: random legal human play vs the bot — every stored state passes the schema, no handoff, player view', () => {
    for (const [settings, seed] of [
      [REBELS_VS_AI, 7],
      [EMPIRE_VS_AI, 11],
      [{ ...REBELS_VS_AI, aiDifficulty: 'hard' }, 3],
      [{ ...EMPIRE_VS_AI, aiDifficulty: 'easy' }, 5],
    ] as const) {
      const random = mulberry32(seed);
      const player = settings.playerFaction;
      let state: GameState = drain(
        rebellionServerModule,
        created(settings, `bot-random-${seed}`),
        NOW,
      ).state;
      for (let i = 0; i < 60 && state.rulesEngine === 'core-v1' && state.outcome === null; i += 1) {
        const view = rebellionServerModule.toPlayerView(state, {
          status: rebellionServerModule.statusOf(state),
        }) as CorePlayerView;
        expect(view.viewer).toBe(player);
        expect(view.activeSide).toBe(player);
        const action = view.legalActions[Math.floor(random() * view.legalActions.length)];
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
            command =
              free.length === 0
                ? { type: 'FINISH_ACTIVATION' }
                : {
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
        const result = rebellionServerModule.applyCommand(
          state,
          { actor: player, expectedVersion: state.version, command },
          { now: NOW },
        );
        if (!result.ok) throw new Error(`player command rejected`);
        // `drain` parses every automated state with the full stored-state schema.
        const parsed = GameStateSchema.parse(JSON.parse(JSON.stringify(result.state)));
        const auto = drain(rebellionServerModule, parsed, NOW);
        for (const e of auto.events) expect(['system', aiSideOf(parsed)]).toContain(e.actor);
        state = auto.state;
        if (state.rulesEngine !== 'core-v1') throw new Error('engine changed');
        expect(state.handoffPending).toBe(false);
        if (state.outcome === null) expect(state.activeSide).toBe(player);
      }
      expect(state.rulesEngine === 'core-v1' && (state.round > 1 || state.outcome !== null)).toBe(
        true,
      );
    }
  });
});
