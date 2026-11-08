/** R-8 base reveal at the end of an Imperial activation of the base by GROUND units (TC-U-57..TC-U-59, TC-U-61). Base = zeta. */
import { describe, expect, it } from 'vitest';
import type { CoreGameState } from '../../../src/schema';
import { toSideView } from '../../../src/rules';
import { T, type TypeKey } from './fixtures/mini-data';
import { FINISH, activate, eventTypes, mv, ok, play, scenario } from './helpers';

const UNITS: [TypeKey, string][] = [
  [T.AC, 'delta'], // u-01
  [T.ST, 'delta'], // u-02
  [T.SD, 'epsilon'], // u-03
  [T.TIE, 'epsilon'], // u-04
  [T.DS, 'eta'], // u-05
  [T.RT, 'zeta'], // u-06 Rebels on the base
  [T.XW, 'zeta'], // u-07
];

function empireTurn(units: [TypeKey, string][] = UNITS): CoreGameState {
  return scenario({ base: 'zeta', units, activeSide: 'empire', passed: { rebels: false } });
}

describe('base reveal (R-8)', () => {
  it('ground units moved into the base reveal it only at FINISH_ACTIVATION (TC-U-57, TC-U-61)', () => {
    const moved = play(empireTurn(), [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-01', 'u-02'], 'delta', 'zeta')],
    ]);
    expect(moved.rebelBase.revealed).toBe(false);
    expect(eventTypes(moved.log)).not.toContain('BASE_REVEALED');
    const { state, events } = ok(moved, 'empire', FINISH);
    expect(events.map((e) => [e.type, e.actor, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', 'empire', { auto: false }],
      ['BASE_REVEALED', 'system', { systemId: 'zeta' }],
    ]);
    // Rebel units remain: no victory, the turn passes as usual (TC-U-61)
    expect(state).toMatchObject({
      rebelBase: { systemId: 'zeta', revealed: true },
      outcome: null,
      activeSide: 'rebels',
      handoffPending: true,
    });
    expect(toSideView(state, 'empire').rebelBase).toEqual({ systemId: 'zeta', revealed: true });
  });

  it('only when the activated system is the base (TC-U-57a)', () => {
    const state = play(empireTurn(), [
      ['empire', activate('vader', 'beta')],
      ['empire', mv(['u-01', 'u-02'], 'delta', 'beta')],
    ]);
    expect(ok(state, 'empire', FINISH).state.rebelBase.revealed).toBe(false);
  });

  it('the Rebels finishing an activation of their own base never reveal it (TC-U-57b, D-4)', () => {
    const state = play(scenario({ base: 'zeta', units: UNITS }), [
      ['rebels', activate('leia', 'zeta')],
    ]);
    const finished = ok(state, 'rebels', FINISH);
    expect(finished.state.rebelBase.revealed).toBe(false);
    expect(eventTypes(finished.events)).toEqual(['ACTIVATION_FINISHED']);
  });

  it('ships, TIE fighters and the Death Star do not reveal (TC-U-58)', () => {
    const state = play(empireTurn(), [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-03', 'u-04'], 'epsilon', 'zeta')],
      ['empire', mv(['u-05'], 'eta', 'zeta')],
    ]);
    expect(ok(state, 'empire', FINISH).state.rebelBase.revealed).toBe(false);
  });

  it('a leader alone does not reveal (TC-U-59, Q-11)', () => {
    const state = ok(empireTurn(), 'empire', activate('vader', 'zeta')).state;
    expect(ok(state, 'empire', FINISH).state.rebelBase.revealed).toBe(false);
  });

  it('an Imperial ground unit already standing in the base reveals it when the base is activated', () => {
    const state = empireTurn([...UNITS, [T.ATAT, 'zeta']]);
    const finished = play(state, [
      ['empire', activate('tarkin', 'zeta')],
      ['empire', FINISH],
    ]);
    expect(finished.rebelBase.revealed).toBe(true);
  });
});
