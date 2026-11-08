import type { CommandEnvelope, MockGameState } from '../../src/schema';
import { GameStateSchema } from '../../src/schema';
import { describe, expect, it } from 'vitest';
import { applyCommand, getLegalActions } from '../../src/rules';
import {
  ADVANCE,
  APPLY_CTX,
  REBELLION_VS_AI,
  clone,
  deepFreeze,
  env,
  move,
  newGame,
  mulberry32,
} from './helpers';

function pick<T>(rand: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

/** A legal command chosen from getLegalActions (MOVE of 1..n stacked own pieces, or ADVANCE_PHASE). */
function legalCommand(state: MockGameState, rand: () => number): CommandEnvelope['command'] {
  const actions = getLegalActions(state, state.settings.playerFaction);
  const action = pick(rand, actions);
  if (action.type === 'ADVANCE_PHASE') return ADVANCE;
  if (action.type === 'END_TURN') throw new Error('AI game: END_TURN is never legal');
  const from = state.pieces.find((p) => p.id === action.pieceId)!.systemId;
  const to = pick(rand, action.toSystemIds);
  // Sometimes move the whole own stack (multi-piece move).
  const stack = state.pieces
    .filter((p) => p.owner === state.settings.playerFaction && p.systemId === from)
    .map((p) => p.id);
  return move(rand() < 0.3 ? stack : [action.pieceId], from, to);
}

/** An illegal command (target not adjacent / enemy piece / stale version), or null when none applies. */
function illegalEnvelope(state: MockGameState, rand: () => number): unknown {
  const human = state.settings.playerFaction;
  const own = pick(
    rand,
    state.pieces.filter((p) => p.owner === human),
  );
  const from = state.systems.find((s) => s.id === own.systemId)!;
  const nonAdjacent = state.systems.find(
    (s) => s.id !== from.id && !from.adjacentSystemIds.includes(s.id),
  );
  const enemy = pick(
    rand,
    state.pieces.filter((p) => p.owner !== human),
  );
  const options: unknown[] = [
    env(state, ADVANCE, { expectedVersion: state.version - 1 || state.version + 1 }),
    env(state, move([enemy.id], enemy.systemId, from.id)),
    env(state, ADVANCE, { actor: human === 'empire' ? 'rebels' : 'empire' }),
  ];
  if (nonAdjacent) options.push(env(state, move([own.id], own.systemId, nonAdjacent.id)));
  return pick(rand, options);
}

function checkInvariants(prev: MockGameState, next: MockGameState) {
  expect(next.version).toBe(prev.version + 1);
  expect(next.log.length).toBe(prev.log.length + 1);
  next.log.forEach((event, i) => expect(event.seq).toBe(i + 1));
  const prevIds = prev.pieces.map((p) => p.id).sort();
  const nextIds = next.pieces.map((p) => p.id).sort();
  expect(nextIds).toEqual(prevIds); // no loss, no duplicates
  const systemIds = new Set(next.systems.map((s) => s.id));
  for (const p of next.pieces) expect(systemIds.has(p.systemId)).toBe(true);
  expect(next.systems).toEqual(prev.systems);
  expect(next.rebelBase).toEqual(prev.rebelBase);
}

describe('invariants over random legal sequences', () => {
  for (const [label, setup, seed] of [
    ['empire', undefined, 20261108],
    ['rebels', REBELLION_VS_AI, 42],
  ] as const) {
    it(`TC-GC-06: 500 seeded steps (human = ${label}) keep version/log/piece invariants; rejected commands change nothing`, () => {
      const rand = mulberry32(seed);
      let state = deepFreeze(newGame(setup));
      const initialIds = state.pieces.map((p) => p.id).sort();
      let accepted = 0;
      let moves = 0;

      for (let step = 0; step < 500; step += 1) {
        if (rand() < 0.2) {
          const snapshot = clone(state);
          const rejected = applyCommand(state, illegalEnvelope(state, rand), APPLY_CTX);
          expect(rejected.ok).toBe(false);
          expect(state).toEqual(snapshot);
          continue;
        }
        const command = legalCommand(state, rand);
        const result = applyCommand(state, env(state, command), APPLY_CTX);
        expect(result.ok, `step ${step}: ${JSON.stringify(command)}`).toBe(true);
        if (!result.ok) return;
        checkInvariants(state, result.state);
        expect(result.events).toEqual([result.state.log[result.state.log.length - 1]]);
        if (command.type === 'MOVE_PIECES') moves += 1;
        accepted += 1;
        state = deepFreeze(result.state);
      }

      expect(accepted).toBeGreaterThan(300);
      expect(moves).toBeGreaterThan(100);
      expect(state.pieces.map((p) => p.id).sort()).toEqual(initialIds);
      expect(GameStateSchema.safeParse(state).success).toBe(true);
    });
  }

  it('TC-GC-29 (precondition): deepFreeze really makes mutation throw', () => {
    const frozen = deepFreeze(newGame());
    expect(() => {
      frozen.pieces[0]!.systemId = 'x';
    }).toThrow(TypeError);
    expect(() => {
      frozen.log.push(frozen.log[0]!);
    }).toThrow(TypeError);
  });

  it('TC-GC-29: applyCommand on a deep-frozen state does not throw and returns a new object (accepted and rejected)', () => {
    const state = deepFreeze(newGame());
    const snapshot = clone(state);
    const own = state.pieces.find((p) => p.owner === 'empire')!;
    const to = state.systems.find((s) => s.id === own.systemId)!.adjacentSystemIds[0]!;

    const moved = applyCommand(
      state,
      deepFreeze(env(state, move([own.id], own.systemId, to))),
      APPLY_CTX,
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.state).not.toBe(state);
      expect(moved.state.pieces).not.toBe(state.pieces);
      expect(moved.state.log).not.toBe(state.log);
    }
    const advanced = applyCommand(state, env(state, ADVANCE), APPLY_CTX);
    expect(advanced.ok).toBe(true);
    const rejected = applyCommand(
      state,
      env(state, move([own.id], own.systemId, own.systemId)),
      APPLY_CTX,
    );
    expect(rejected.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it('TC-GC-29 (R-1): applyCommand is deterministic — same state, envelope and ctx give deep-equal results', () => {
    const state = deepFreeze(newGame());
    const own = state.pieces.find((p) => p.owner === 'empire')!;
    const to = state.systems.find((s) => s.id === own.systemId)!.adjacentSystemIds[0]!;
    const envelope = env(state, move([own.id], own.systemId, to));
    expect(applyCommand(state, envelope, APPLY_CTX)).toEqual(
      applyCommand(clone(state), clone(envelope), { ...APPLY_CTX }),
    );
  });
});
