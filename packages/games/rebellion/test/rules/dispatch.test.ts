/**
 * SWR-005 W1: the rules dispatch by `state.rulesEngine` (BD-1). `mock-v1` keeps the SWR-004 pipeline and
 * rejects the commands of `core-v1` with 422 `commandUnavailable` (AM-BE-3, Q-2/Q-29); `core-v1` dispatches
 * to the W3 engine (`src/rules/core`; its own tests live in `test/rules/core/**`).
 */
import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import {
  REBELLION_ERROR_MESSAGE_KEYS,
  type Command,
  type GameState,
  type MockGameState,
} from '../../src/schema';
import {
  applyCommand,
  getLegalActions,
  toHandoffView,
  toPlayerView,
  toSideView,
} from '../../src/rules';
import { coreState } from '../schema/core-sample';
import {
  ACCEPT,
  ADVANCE,
  APPLY_CTX,
  END_TURN,
  REBELS_VS_HUMAN,
  clone,
  deepFreeze,
  env,
  newGame,
} from './helpers';

const CORE_ONLY: Command[] = [
  { type: 'ACTIVATE_SYSTEM', leaderId: 'leader.rebels.captain', systemId: 'sys-aurelis' },
  { type: 'FINISH_ACTIVATION' },
  { type: 'PASS' },
];

function rejected(state: GameState, envelope: unknown) {
  const result = applyCommand(state, envelope, APPLY_CTX);
  if (result.ok) throw new Error('expected a rejection');
  return result.error;
}

describe('mock-v1 session', () => {
  it('core-only commands → 422 commandUnavailable, state/version unchanged (AM-BE-3)', () => {
    for (const game of [newGame(), newGame(REBELS_VS_HUMAN)]) {
      const state = deepFreeze(game);
      const snapshot = clone(state);
      for (const command of CORE_ONLY) {
        expect(rejected(state, env(state, command))).toEqual({
          code: 'ILLEGAL_COMMAND',
          messageKey: REBELLION_ERROR_MESSAGE_KEYS.commandUnavailable,
          details: { actor: state.activeSide, type: command.type },
        });
      }
      expect(state).toEqual(snapshot);
    }
  });

  it('order: 400 schema → 409 version → commandUnavailable → notYourSide', () => {
    const state = newGame();
    expect(
      rejected(state, { actor: 'empire', expectedVersion: 1, command: { type: 'PASS', x: 1 } })
        .code,
    ).toBe('VALIDATION');
    expect(rejected(state, env(state, { type: 'PASS' }, { expectedVersion: 7 })).messageKey).toBe(
      ERROR_MESSAGE_KEYS.versionConflict,
    );
    // The AI side of an AI game would be notYourSide for a mock command — the engine check comes first.
    expect(rejected(state, env(state, { type: 'PASS' }, { actor: 'rebels' })).messageKey).toBe(
      REBELLION_ERROR_MESSAGE_KEYS.commandUnavailable,
    );
    expect(rejected(state, env(state, ADVANCE, { actor: 'rebels' })).messageKey).toBe(
      REBELLION_ERROR_MESSAGE_KEYS.notYourSide,
    );
  });

  it('mock commands still work and keep the engine (mock-v1, schemaVersion 3)', () => {
    let state: MockGameState = newGame(REBELS_VS_HUMAN);
    for (const command of [ADVANCE, END_TURN, ACCEPT]) {
      const result = applyCommand(state, env(state, command), APPLY_CTX);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
      expect([state.rulesEngine, state.schemaVersion]).toEqual(['mock-v1', 3]);
    }
    expect(getLegalActions(state, state.activeSide).map((a) => a.type)).toContain('END_TURN');
    expect(toSideView(state, 'rebels').rulesEngine).toBe('mock-v1');
  });
});

describe('core-v1 session (dispatch to the W3 engine)', () => {
  it('mock-only commands → 422 commandUnavailable {actor, type} after 409, state unchanged', () => {
    const state = deepFreeze(coreState());
    const snapshot = clone(state);
    for (const command of [ADVANCE, END_TURN]) {
      expect(rejected(state, env(state, command))).toEqual({
        code: 'ILLEGAL_COMMAND',
        messageKey: REBELLION_ERROR_MESSAGE_KEYS.commandUnavailable,
        details: { actor: 'rebels', type: command.type },
      });
    }
    expect(rejected(state, env(state, ADVANCE, { expectedVersion: 9 })).code).toBe(
      'VERSION_CONFLICT',
    );
    expect(state).toEqual(snapshot);
  });

  it('core commands reach the engine and keep the engine (core-v1, schemaVersion 3)', () => {
    const state = deepFreeze(coreState());
    const result = applyCommand(state, env(state, { type: 'PASS' }), APPLY_CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.state.rulesEngine, result.state.schemaVersion, result.state.version]).toEqual([
      'core-v1',
      3,
      2,
    ]);
    expect(result.events.map((e) => e.type)).toEqual(['PASSED']);
  });

  it('a finished game → 422 gameOver before 409 (AM-BE-3, Q-13); schema errors stay 400', () => {
    const over = coreState();
    over.phase = 'refresh';
    over.outcome = { winner: 'rebels', reason: 'timeReachedReputation' };
    expect(rejected(over, env(over, { type: 'PASS' }, { expectedVersion: 9 }))).toEqual({
      code: 'ILLEGAL_COMMAND',
      messageKey: REBELLION_ERROR_MESSAGE_KEYS.gameOver,
      details: { actor: 'rebels' },
    });
    expect(
      rejected(over, { actor: 'rebels', expectedVersion: 1, command: { type: 'NOPE' } }).code,
    ).toBe('VALIDATION');
  });

  it('legal actions, board view and handoff view are dispatched by the engine', () => {
    const state = coreState();
    expect(getLegalActions(state, 'rebels').map((a) => a.type)).toEqual([
      'ACTIVATE_SYSTEM',
      'PASS',
    ]);
    expect(getLegalActions(state, 'empire')).toEqual([]);
    const pending = { ...state, handoffPending: true };
    expect(toHandoffView(pending, 'prototype')).toEqual({
      kind: 'handoff',
      rulesEngine: 'core-v1',
      id: state.id,
      version: state.version,
      activeSide: 'rebels',
      round: 1,
      phase: 'command',
      sessionStatus: 'prototype',
    });
    expect(toPlayerView(pending, 'prototype').kind).toBe('handoff');
    const view = toPlayerView(state, 'prototype');
    expect(view.kind === 'player' ? [view.rulesEngine, view.viewer] : null).toEqual([
      'core-v1',
      'rebels',
    ]);
    expect(toSideView(state, 'empire').rebelBase).toEqual({ systemId: null, revealed: false });
  });
});
