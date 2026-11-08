/**
 * R-3, R-6, R-7, hot-seat (TC-U-05..TC-U-18): permanent pass, consecutive turns, end of the command phase,
 * refresh (leaders back, time + 1), new round with the Rebels first, handoff only on a real side change.
 */
import { describe, expect, it } from 'vitest';
import { REBELLION_ERROR_MESSAGE_KEYS as K, type CoreGameState } from '../../../src/schema';
import { getLegalActions } from '../../../src/rules';
import {
  ACCEPT,
  FINISH,
  LATER,
  PASS,
  REBELS_VS_AI,
  activate,
  eventTypes,
  ok,
  play,
  rejected,
  scenario,
} from './helpers';

describe('turn passing after FINISH_ACTIVATION / PASS', () => {
  it('activation + finish → the other side, hot-seat handoff (TC-U-05, TC-U-18)', () => {
    const activated = ok(scenario(), 'rebels', activate('leia', 'delta'));
    const finished = ok(activated.state, 'rebels', FINISH);
    expect(finished.state).toMatchObject({
      activeSide: 'empire',
      handoffPending: true,
      activation: null,
      version: 3,
    });
    expect(finished.events).toMatchObject([
      { type: 'ACTIVATION_FINISHED', actor: 'rebels', payload: { auto: false } },
    ]);
    // the leader stays in the system until the refresh
    expect(finished.state.leaders.find((l) => l.id === 'leia')?.systemId).toBe('delta');
  });

  it('PASS → passed.rebels, the other side, handoff; the phase continues (TC-U-06)', () => {
    const { state, events } = ok(scenario(), 'rebels', PASS);
    expect(state).toMatchObject({
      passed: { rebels: true, empire: false },
      activeSide: 'empire',
      handoffPending: true,
      phase: 'command',
      round: 1,
    });
    expect(events).toEqual([
      { seq: 4, type: 'PASSED', actor: 'rebels', payload: { auto: false }, at: LATER },
    ]);
  });

  it('AI game: no handoff when the turn goes to the AI side; the AI auto move is marked auto', () => {
    const state = scenario({ settings: REBELS_VS_AI });
    const passed = ok(state, 'rebels', PASS).state;
    expect(passed).toMatchObject({ activeSide: 'empire', handoffPending: false });
    const ai = ok(passed, 'empire', PASS, { origin: 'auto' });
    expect(ai.events[0]).toMatchObject({
      type: 'PASSED',
      actor: 'empire',
      payload: { auto: true },
    });
    expect(ai.state).toMatchObject({ activeSide: 'rebels', handoffPending: false, round: 2 });
  });

  it('both passed → refresh and a new round in the same command, version + 1 once (TC-U-07)', () => {
    const afterRebels = play(scenario(), [
      ['rebels', PASS],
      ['empire', ACCEPT],
    ]);
    const { state, events } = ok(afterRebels, 'empire', PASS);
    expect(state.version).toBe(afterRebels.version + 1);
    expect(events.map((e) => [e.type, e.actor, e.payload])).toEqual([
      ['PASSED', 'empire', { auto: false }],
      ['PHASE_STARTED', 'system', { round: 1, phase: 'refresh' }],
      ['LEADERS_RETURNED', 'system', { leaderIds: [] }],
      ['TIME_ADVANCED', 'system', { from: 1, to: 2 }],
      ['PHASE_STARTED', 'system', { round: 2, phase: 'assignment' }],
      ['PHASE_STARTED', 'system', { round: 2, phase: 'command' }],
    ]);
    expect(events.map((e) => e.seq)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(state).toMatchObject({
      round: 2,
      phase: 'command',
      activeSide: 'rebels',
      passed: { rebels: false, empire: false },
      handoffPending: true, // Empire passed last → the seat goes to the Rebels (TC-HS-04)
      activation: null,
      outcome: null,
    });
  });

  it('Rebels passed: the Empire acts in consecutive turns without handoff; the phase ends on its pass (TC-U-08, TC-HS-05a)', () => {
    let state = play(scenario(), [
      ['rebels', PASS],
      ['empire', ACCEPT],
    ]);
    for (const leader of ['vader', 'tarkin']) {
      state = play(state, [
        ['empire', activate(leader, 'alpha')],
        ['empire', FINISH],
      ]);
      expect(state).toMatchObject({ activeSide: 'empire', handoffPending: false, round: 1 });
    }
    expect(getLegalActions(state, 'rebels')).toEqual([]);
    state = ok(state, 'empire', PASS).state;
    expect(state).toMatchObject({ round: 2, activeSide: 'rebels', handoffPending: true });
  });

  it('Empire passed: the Rebels act consecutively; with only Mon Mothma left they can only pass (TC-U-09, TC-U-11, TC-HS-05)', () => {
    let state = play(scenario(), [
      ['rebels', activate('leia', 'delta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', PASS],
      ['rebels', ACCEPT],
      ['rebels', activate('dodonna', 'beta')],
      ['rebels', FINISH],
    ]);
    expect(state).toMatchObject({ activeSide: 'rebels', handoffPending: false });
    state = play(state, [
      ['rebels', activate('rieekan', 'gamma')],
      ['rebels', FINISH],
    ]);
    expect(getLegalActions(state, 'rebels')).toEqual([{ type: 'PASS' }]);
    rejected(state, 'rebels', activate('mothma', 'alpha'), K.leaderCannotActivate);
    const { state: next, events } = ok(state, 'rebels', PASS);
    // Rebels passed last and act first in the new round: no handoff (Q-28)
    expect(next).toMatchObject({ round: 2, activeSide: 'rebels', handoffPending: false });
    expect(events.find((e) => e.type === 'LEADERS_RETURNED')?.payload).toEqual({
      leaderIds: ['leia', 'dodonna', 'rieekan'],
    });
  });

  it('a side that passed has no turn and no legal actions (TC-U-10)', () => {
    const state = scenario({ activeSide: 'empire', passed: { rebels: true } });
    for (const command of [activate('leia', 'alpha'), PASS, FINISH]) {
      rejected(state, 'rebels', command, K.notYourTurn);
    }
    expect(getLegalActions(state, 'rebels')).toEqual([]);
  });

  it('pools without activating leaders: both only pass, the phase ends after 2 passes (TC-U-12)', () => {
    const state = scenario({
      leadersAt: {
        palpatine: 'alpha',
        vader: 'alpha',
        tarkin: 'gamma',
        tagge: 'gamma',
        leia: 'theta',
        dodonna: 'theta',
        rieekan: 'theta',
      },
    });
    expect(getLegalActions(state, 'rebels')).toEqual([{ type: 'PASS' }]);
    const one = play(state, [
      ['rebels', PASS],
      ['empire', ACCEPT],
    ]);
    expect(getLegalActions(one, 'empire')).toEqual([{ type: 'PASS' }]);
    const two = ok(one, 'empire', PASS).state;
    expect(two.round).toBe(2);
    expect(two.leaders.every((l) => l.systemId === null)).toBe(true);
  });

  it('longest phase: 3 Rebel + 4 Imperial activations + 2 passes, then the next round (TC-U-12a)', () => {
    let state: CoreGameState = scenario();
    let activations = 0;
    for (let step = 0; step < 50 && state.round === 1; step += 1) {
      const side = state.activeSide;
      if (state.handoffPending) {
        state = ok(state, side, ACCEPT).state;
        continue;
      }
      const activateAction = getLegalActions(state, side).find((a) => a.type === 'ACTIVATE_SYSTEM');
      if (activateAction && activateAction.type === 'ACTIVATE_SYSTEM') {
        state = play(state, [
          [side, activate(activateAction.leaderIds[0]!, 'theta')],
          [side, FINISH],
        ]);
        activations += 1;
      } else {
        state = ok(state, side, PASS).state;
      }
    }
    expect(activations).toBe(7);
    expect(state.round).toBe(2);
  });

  it('PASS when the other side already passed ends the phase at once (TC-U-12b)', () => {
    const state = scenario({ passed: { empire: true } });
    expect(ok(state, 'rebels', PASS).state).toMatchObject({ round: 2, activeSide: 'rebels' });
  });

  it('refresh: all leaders back in state.leaders order, units untouched, time + 1 (TC-U-13, TC-U-14)', () => {
    const state = scenario({
      activeSide: 'empire',
      passed: { rebels: true },
      leadersAt: { tagge: 'alpha', leia: 'zeta', vader: 'zeta', rieekan: 'beta' },
    });
    const { state: next, events } = ok(state, 'empire', PASS);
    expect(events.find((e) => e.type === 'LEADERS_RETURNED')?.payload).toEqual({
      leaderIds: ['vader', 'tagge', 'leia', 'rieekan'],
    });
    expect(next.leaders.every((l) => l.systemId === null)).toBe(true);
    expect(next.units).toEqual(state.units);
    expect(next.round).toBe(state.round + 1);
    expect(next.reputation).toBe(state.reputation);
    expect(next.activeSide).toBe('rebels');
  });

  it('PASS during an activation → activationInProgress; FINISH without one → noActivation (TC-U-16, TC-U-17)', () => {
    const running = scenario({ activation: { leaderId: 'leia', systemId: 'delta' } });
    expect(rejected(running, 'rebels', PASS, K.activationInProgress).details).toEqual({
      actor: 'rebels',
    });
    expect(rejected(scenario(), 'rebels', FINISH, K.noActivation).details).toEqual({
      actor: 'rebels',
    });
  });

  it('a full hot-seat round with all transitions in the log (TC-HS-07)', () => {
    const end = play(scenario(), [
      ['rebels', activate('leia', 'delta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', activate('vader', 'beta')],
      ['empire', FINISH],
      ['rebels', ACCEPT],
      ['rebels', PASS],
      ['empire', ACCEPT],
      ['empire', activate('tarkin', 'gamma')],
      ['empire', FINISH],
      ['empire', PASS],
      ['rebels', ACCEPT],
    ]);
    expect(end).toMatchObject({
      round: 2,
      activeSide: 'rebels',
      handoffPending: false,
      version: 13,
    });
    expect(eventTypes(end.log)).toEqual([
      'GAME_CREATED',
      'PHASE_STARTED',
      'PHASE_STARTED',
      'SYSTEM_ACTIVATED',
      'ACTIVATION_FINISHED',
      'HANDOFF_ACCEPTED',
      'SYSTEM_ACTIVATED',
      'ACTIVATION_FINISHED',
      'HANDOFF_ACCEPTED',
      'PASSED',
      'HANDOFF_ACCEPTED',
      'SYSTEM_ACTIVATED',
      'ACTIVATION_FINISHED',
      'PASSED',
      'PHASE_STARTED',
      'LEADERS_RETURNED',
      'TIME_ADVANCED',
      'PHASE_STARTED',
      'PHASE_STARTED',
      'HANDOFF_ACCEPTED',
    ]);
    expect(end.log.map((e) => e.seq)).toEqual(end.log.map((_, i) => i + 1));
  });
});
