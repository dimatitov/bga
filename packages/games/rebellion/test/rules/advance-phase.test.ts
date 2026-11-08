import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/rules';
import { ADVANCE, APPLY_CTX, deepFreeze, env, newGame } from './helpers';
import type { GameState } from '../../src/schema';

function advance(state: GameState, times: number): GameState[] {
  const states: GameState[] = [];
  let current = state;
  for (let i = 0; i < times; i += 1) {
    const result = applyCommand(current, env(current, ADVANCE), APPLY_CTX);
    if (!result.ok) throw new Error(`advance ${i} rejected: ${result.error.messageKey}`);
    current = result.state;
    states.push(current);
  }
  return states;
}

describe('applyCommand — ADVANCE_PHASE (mock)', () => {
  it('TC-GC-04: assignment → command → refresh → assignment; round 1,1,1,2; version +3; 3 PHASE_ADVANCED', () => {
    const state0 = deepFreeze(newGame());
    const states = advance(state0, 3);

    expect(states.map((s) => s.phase)).toEqual(['command', 'refresh', 'assignment']);
    expect(states.map((s) => s.round)).toEqual([1, 1, 2]);
    expect(states.map((s) => s.version)).toEqual([2, 3, 4]);

    const last = states[2]!;
    const events = last.log.slice(1);
    expect(events).toEqual([
      {
        seq: 2,
        type: 'PHASE_ADVANCED',
        actor: 'empire',
        payload: { fromRound: 1, fromPhase: 'assignment', toRound: 1, toPhase: 'command' },
        at: APPLY_CTX.now,
      },
      {
        seq: 3,
        type: 'PHASE_ADVANCED',
        actor: 'empire',
        payload: { fromRound: 1, fromPhase: 'command', toRound: 1, toPhase: 'refresh' },
        at: APPLY_CTX.now,
      },
      {
        seq: 4,
        type: 'PHASE_ADVANCED',
        actor: 'empire',
        payload: { fromRound: 1, fromPhase: 'refresh', toRound: 2, toPhase: 'assignment' },
        at: APPLY_CTX.now,
      },
    ]);
    expect(state0.phase).toBe('assignment');
    expect(state0.version).toBe(1);
  });

  it('TC-GC-04: each ADVANCE_PHASE result returns exactly the one new event', () => {
    const state0 = newGame();
    const result = applyCommand(state0, env(state0, ADVANCE), APPLY_CTX);
    expect(result.ok && result.events).toEqual([result.ok && result.state.log[1]]);
  });

  it('TC-GC-05: 6× ADVANCE_PHASE → round 3, assignment; pieces unchanged', () => {
    const state0 = deepFreeze(newGame());
    const states = advance(state0, 6);
    const last = states[5]!;
    expect(last.round).toBe(3);
    expect(last.phase).toBe('assignment');
    expect(last.version).toBe(7);
    expect(last.pieces).toEqual(state0.pieces);
    expect(last.systems).toEqual(state0.systems);
    expect(last.rebelBase).toEqual(state0.rebelBase);
  });
});
