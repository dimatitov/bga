import type { Faction, GameState } from '../../src/schema';
import { describe, expect, it } from 'vitest';
import { applyCommand, getLegalActions, toSideView } from '../../src/rules';
import {
  ADVANCE,
  APPLY_CTX,
  REBELLION_VS_AI,
  adjacent,
  deepFreeze,
  env,
  move,
  newGame,
} from './helpers';

function checkLegalActionsFor(state: GameState, viewer: Faction) {
  const actions = getLegalActions(state, viewer);
  const moves = actions.filter((a) => a.type === 'MOVE_PIECES');
  const own = state.pieces.filter((p) => p.owner === viewer);

  expect(moves.map((m) => m.pieceId).sort()).toEqual(own.map((p) => p.id).sort());
  for (const m of moves) {
    const p = state.pieces.find((x) => x.id === m.pieceId)!;
    expect(p.owner).toBe(viewer);
    expect(m.toSystemIds).toEqual(adjacent(state, p.systemId));
  }
  expect(actions.filter((a) => a.type === 'ADVANCE_PHASE')).toEqual([{ type: 'ADVANCE_PHASE' }]);
  // AI game: no hot-seat action (AM-FE-7).
  expect(actions.filter((a) => a.type === 'END_TURN')).toEqual([]);
  expect(toSideView(state, viewer).legalActions).toEqual(actions);
}

describe('getLegalActions', () => {
  it('TC-GC-25: human = empire → MOVE only for empire pieces to adjacent systems, plus ADVANCE_PHASE', () => {
    checkLegalActionsFor(deepFreeze(newGame()), 'empire');
  });

  it('TC-GC-25: human = rebellion → MOVE only for rebellion pieces, plus ADVANCE_PHASE', () => {
    checkLegalActionsFor(deepFreeze(newGame(REBELLION_VS_AI)), 'rebels');
  });

  for (const human of ['empire', 'rebels'] as const) {
    it(`TC-GC-26: legalActions ↔ applyCommand are consistent for every own piece × every system (human = ${human})`, () => {
      const state = deepFreeze(newGame(human === 'empire' ? undefined : REBELLION_VS_AI));
      const actions = getLegalActions(state, human);
      let accepted = 0;
      let rejected = 0;
      for (const p of state.pieces.filter((x) => x.owner === human)) {
        const legal = actions.find((a) => a.type === 'MOVE_PIECES' && a.pieceId === p.id);
        const targets = legal && legal.type === 'MOVE_PIECES' ? legal.toSystemIds : [];
        for (const sys of state.systems) {
          const result = applyCommand(
            state,
            env(state, move([p.id], p.systemId, sys.id)),
            APPLY_CTX,
          );
          expect(result.ok, `${p.id} → ${sys.id}`).toBe(targets.includes(sys.id));
          if (result.ok) accepted += 1;
          else rejected += 1;
        }
      }
      expect(accepted).toBeGreaterThan(0);
      expect(rejected).toBeGreaterThan(0);
      expect(applyCommand(state, env(state, ADVANCE), APPLY_CTX).ok).toBe(true);
    });
  }

  it('TC-GC-27: viewer ≠ active side → [] (getLegalActions and view.legalActions, AM-4)', () => {
    const empireGame = deepFreeze(newGame());
    expect(getLegalActions(empireGame, 'rebels')).toEqual([]);
    expect(toSideView(empireGame, 'rebels').legalActions).toEqual([]);

    const rebelGame = deepFreeze(newGame(REBELLION_VS_AI));
    expect(getLegalActions(rebelGame, 'empire')).toEqual([]);
    expect(toSideView(rebelGame, 'empire').legalActions).toEqual([]);
  });

  it('TC-GC-31: legalActions contain MOVE_PIECES in every phase', () => {
    let state = newGame();
    for (const phase of ['assignment', 'command', 'refresh'] as const) {
      expect(state.phase).toBe(phase);
      const moves = getLegalActions(state, 'empire').filter((a) => a.type === 'MOVE_PIECES');
      expect(moves.length).toBe(state.pieces.filter((p) => p.owner === 'empire').length);
      const r = applyCommand(state, env(state, ADVANCE), APPLY_CTX);
      if (!r.ok) throw new Error('advance failed');
      state = r.state;
    }
  });

  it('TC-GC-25: legal targets follow the piece after a move', () => {
    const state = newGame();
    const p = state.pieces.find((x) => x.owner === 'empire')!;
    const to = adjacent(state, p.systemId)[0]!;
    const r = applyCommand(state, env(state, move([p.id], p.systemId, to)), APPLY_CTX);
    if (!r.ok) throw new Error('move failed');
    const action = getLegalActions(r.state, 'empire').find(
      (a) => a.type === 'MOVE_PIECES' && a.pieceId === p.id,
    );
    expect(action).toEqual({
      type: 'MOVE_PIECES',
      pieceId: p.id,
      toSystemIds: adjacent(r.state, to),
    });
  });
});
