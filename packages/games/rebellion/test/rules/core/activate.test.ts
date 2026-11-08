/**
 * Check order of the `core-v1` pipeline (BD-7) and R-4 `ACTIVATE_SYSTEM` (TC-U-03, TC-U-15, TC-U-19,
 * TC-U-21..TC-U-31, TC-U-67 order part). Every rejection leaves state/version/log unchanged (`rejected`).
 */
import { describe, expect, it } from 'vitest';
import { REBELLION_ERROR_MESSAGE_KEYS as K } from '../../../src/schema';
import { getLegalActions } from '../../../src/rules';
import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import { SYSTEM_IDS } from './fixtures/mini-data';
import {
  ACCEPT,
  ADVANCE,
  END_TURN,
  EMPIRE_VS_AI,
  FINISH,
  PASS,
  REBELS_VS_AI,
  activate,
  errorKey,
  mv,
  ok,
  rejected,
  scenario,
  tryApply,
} from './helpers';

describe('core-v1 pipeline: check order', () => {
  it('400 schema first: empty strings, extra fields, unknown types (TC-U-25, TC-U-51)', () => {
    const state = scenario();
    for (const command of [
      { type: 'ACTIVATE_SYSTEM', leaderId: '', systemId: 'alpha' },
      { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: '' },
      { type: 'PASS', extra: 1 },
      { type: 'MOVE_PIECES', pieceIds: [], fromSystemId: 'a', toSystemId: 'b' },
      { type: 'MOVE_PIECES', pieceIds: ['u-01', 'u-01'], fromSystemId: 'a', toSystemId: 'b' },
      { type: 'NOPE' },
    ]) {
      const result = tryApply(state, 'rebels', command);
      expect(result.ok ? null : result.error.code).toBe('VALIDATION');
    }
  });

  it('ADVANCE_PHASE / END_TURN → commandUnavailable {actor, type} after 409 (TC-U-03, Q-2)', () => {
    const state = scenario();
    for (const command of [ADVANCE, END_TURN]) {
      expect(rejected(state, 'rebels', command, K.commandUnavailable).details).toEqual({
        actor: 'rebels',
        type: command.type,
      });
    }
    expect(errorKey(state, 'rebels', ADVANCE, { expectedVersion: 99 })).toBe(
      ERROR_MESSAGE_KEYS.versionConflict,
    );
    // commandUnavailable comes before notYourTurn / notYourSide.
    expect(errorKey(state, 'empire', END_TURN)).toBe(K.commandUnavailable);
  });

  it('409 VERSION_CONFLICT with the current version, before notYourTurn', () => {
    const state = scenario();
    const result = tryApply(state, 'empire', PASS, { expectedVersion: 7 });
    expect(result.ok ? null : result.error).toEqual({
      code: 'VERSION_CONFLICT',
      messageKey: ERROR_MESSAGE_KEYS.versionConflict,
      details: { currentVersion: 1 },
    });
  });

  it('notYourSide: the AI side for player commands, any non-AI side for auto commands', () => {
    const ai = scenario({ settings: REBELS_VS_AI });
    expect(rejected(ai, 'empire', PASS, K.notYourSide).details).toEqual({ actor: 'empire' });
    rejected(ai, 'rebels', PASS, K.notYourSide, { origin: 'auto' });
    rejected(scenario(), 'rebels', PASS, K.notYourSide, { origin: 'auto' });
    rejected(scenario(), 'empire', PASS, K.notYourSide, { origin: 'auto' });
    // AI Rebels at the start of an Empire-vs-AI game (transient state): the auto move is accepted.
    const transient = scenario({ settings: EMPIRE_VS_AI, parse: false });
    rejected(transient, 'rebels', PASS, K.notYourSide);
    expect(ok(transient, 'rebels', PASS, { origin: 'auto' }).events[0]).toMatchObject({
      type: 'PASSED',
      actor: 'rebels',
      payload: { auto: true },
    });
  });

  it('notYourTurn: commands of the non-active human side (TC-U-15, TC-U-22)', () => {
    const state = scenario();
    for (const command of [
      PASS,
      FINISH,
      activate('vader', 'alpha'),
      mv(['u-01'], 'alpha', 'beta'),
      ACCEPT,
    ]) {
      expect(rejected(state, 'empire', command, K.notYourTurn).details).toEqual({
        actor: 'empire',
      });
    }
  });

  it('hot-seat: handoffPending blocks everything but ACCEPT_HANDOFF; ACCEPT without handoff (TC-U-29)', () => {
    const pending = scenario({ activeSide: 'empire', handoffPending: true });
    rejected(pending, 'empire', activate('vader', 'alpha'), K.handoffPending);
    rejected(pending, 'empire', PASS, K.handoffPending);
    rejected(pending, 'rebels', ACCEPT, K.notYourTurn);
    const accepted = ok(pending, 'empire', ACCEPT);
    expect(accepted.state.handoffPending).toBe(false);
    expect(accepted.state.version).toBe(2);
    expect(accepted.events).toMatchObject([
      { type: 'HANDOFF_ACCEPTED', actor: 'empire', payload: {} },
    ]);
    rejected(scenario(), 'rebels', ACCEPT, K.handoffNotAvailable);
    rejected(scenario({ settings: REBELS_VS_AI }), 'rebels', ACCEPT, K.handoffNotAvailable);
  });

  it('wrongPhase on a synthetic state outside the command phase (TC-U-19, Q-6)', () => {
    for (const phase of ['assignment', 'refresh'] as const) {
      const state = { ...scenario(), phase };
      for (const command of [PASS, FINISH, activate('leia', 'alpha')]) {
        rejected(state, 'rebels', command, K.wrongPhase);
      }
    }
  });
});

describe('ACTIVATE_SYSTEM (R-4)', () => {
  it('places an own pool leader in any system: plain, remote, with enemy units / leaders (TC-U-21, TC-U-27)', () => {
    const base = scenario({ leadersAt: { vader: 'gamma' } });
    for (const systemId of ['delta', 'epsilon', 'alpha', 'gamma', 'zeta', 'theta']) {
      const { state, events } = ok(base, 'rebels', activate('leia', systemId));
      expect(state.leaders.find((l) => l.id === 'leia')?.systemId).toBe(systemId);
      expect(state.activation).toEqual({ side: 'rebels', leaderId: 'leia', systemId });
      expect(state.version).toBe(2);
      expect(state.activeSide).toBe('rebels');
      expect(events).toEqual([
        {
          seq: 4,
          type: 'SYSTEM_ACTIVATED',
          actor: 'rebels',
          payload: { leaderId: 'leia', systemId },
          at: '2026-11-08T10:05:00.000Z',
        },
      ]);
    }
  });

  it('a system with an own leader may be activated again: two own leaders there (TC-U-26b, Q-BE-3)', () => {
    const state = scenario({ leadersAt: { leia: 'delta' } });
    const next = ok(state, 'rebels', activate('dodonna', 'delta')).state;
    expect(next.leaders.filter((l) => l.systemId === 'delta').map((l) => l.id)).toEqual([
      'leia',
      'dodonna',
    ]);
    expect(next.activation?.systemId).toBe('delta');
  });

  it('rejections with keys and request-only details (TC-U-23..U-28, U-26a)', () => {
    const state = scenario({ leadersAt: { leia: 'delta' } });
    expect(rejected(state, 'rebels', activate('leia', 'beta'), K.leaderNotInPool).details).toEqual({
      leaderId: 'leia',
    });
    rejected(state, 'rebels', activate('vader', 'beta'), K.leaderNotInPool);
    expect(rejected(state, 'rebels', activate('nobody', 'beta'), K.unknownLeader).details).toEqual({
      leaderId: 'nobody',
    });
    // A catalogue leader that is not in the game (D-7) is unknown.
    rejected(state, 'rebels', activate('ackbar', 'beta'), K.unknownLeader);
    expect(
      rejected(state, 'rebels', activate('mothma', 'beta'), K.leaderCannotActivate).details,
    ).toEqual({
      leaderId: 'mothma',
    });
    expect(
      rejected(state, 'rebels', activate('dodonna', 'nowhere'), K.unknownSystem).details,
    ).toEqual({
      systemId: 'nowhere',
    });
    const running = scenario({ activation: { leaderId: 'leia', systemId: 'delta' } });
    rejected(running, 'rebels', activate('dodonna', 'beta'), K.activationInProgress);
  });

  it('check order: activationInProgress → unknownLeader → leaderNotInPool → leaderCannotActivate → unknownSystem (TC-U-30a)', () => {
    const running = scenario({ activation: { leaderId: 'leia', systemId: 'delta' } });
    expect(errorKey(running, 'rebels', activate('nobody', 'nowhere'))).toBe(K.activationInProgress);
    const state = scenario();
    expect(errorKey(state, 'rebels', activate('nobody', 'nowhere'))).toBe(K.unknownLeader);
    expect(errorKey(state, 'rebels', activate('vader', 'nowhere'))).toBe(K.leaderNotInPool);
    expect(errorKey(state, 'rebels', activate('mothma', 'nowhere'))).toBe(K.leaderCannotActivate);
    expect(errorKey(state, 'rebels', activate('leia', 'nowhere'))).toBe(K.unknownSystem);
  });

  it('legal actions: ACTIVATE_SYSTEM = own pool leaders that can activate × all systems, + PASS (TC-U-31, Q-40)', () => {
    const state = scenario({ leadersAt: { dodonna: 'beta', vader: 'alpha' } });
    expect(getLegalActions(state, 'rebels')).toEqual([
      { type: 'ACTIVATE_SYSTEM', leaderIds: ['leia', 'rieekan'], systemIds: [...SYSTEM_IDS] },
      { type: 'PASS' },
    ]);
    expect(getLegalActions(state, 'empire')).toEqual([]);
    const onlyMothma = scenario({ leadersAt: { leia: 'beta', dodonna: 'beta', rieekan: 'delta' } });
    expect(getLegalActions(onlyMothma, 'rebels')).toEqual([{ type: 'PASS' }]);
    rejected(onlyMothma, 'rebels', activate('mothma', 'alpha'), K.leaderCannotActivate);
    const running = scenario({ activation: { leaderId: 'leia', systemId: 'epsilon' } });
    expect(getLegalActions(running, 'rebels').map((a) => a.type)).not.toContain('ACTIVATE_SYSTEM');
    expect(getLegalActions(running, 'rebels').map((a) => a.type)).not.toContain('PASS');
  });
});
