import { PlayerViewSchema, UNKNOWN_TYPE_KEY, type GameState } from '../../src/schema';
import { describe, expect, it } from 'vitest';
import { applyCommand, toPlayerEvents, toPlayerView, toSideView } from '../../src/rules';
import {
  ACCEPT,
  APPLY_CTX,
  END_TURN,
  REBELLION_VS_AI,
  REBELS_VS_HUMAN,
  adjacent,
  clone,
  deepFreeze,
  env,
  hiddenPieceOf,
  move,
  newGame,
} from './helpers';

/** State assembled in the test: empire piece made hidden (the mock scenario has none). */
function withHiddenEmpirePiece(
  state: GameState,
  typeKey: string,
): { state: GameState; id: string } {
  const target = state.pieces.find((p) => p.owner === 'empire')!;
  return {
    id: target.id,
    state: {
      ...state,
      pieces: state.pieces.map((p) => (p.id === target.id ? { ...p, hidden: true, typeKey } : p)),
    },
  };
}

describe('toPlayerView — hidden information (A-11, Q-2)', () => {
  it('TC-GC-19: empire does not see the unrevealed rebel base anywhere', () => {
    const state = deepFreeze(newGame());
    const S_X = state.rebelBase.systemId!;
    const view = toSideView(state, 'empire');

    expect(view.rebelBase).toEqual({ systemId: null, revealed: false });
    expect(JSON.stringify(view.rebelBase)).not.toContain(S_X);
    expect(JSON.stringify(view.log)).not.toContain(S_X);
    expect(JSON.stringify(view.legalActions)).not.toContain(S_X);
  });

  it('TC-GC-20: rebellion sees its own base', () => {
    const state = deepFreeze(newGame());
    expect(toSideView(state, 'rebels').rebelBase).toEqual({
      systemId: state.rebelBase.systemId,
      revealed: false,
    });
  });

  it('TC-GC-21: a revealed base is visible to the empire', () => {
    const base = newGame();
    const state = deepFreeze({ ...base, rebelBase: { ...base.rebelBase, revealed: true } });
    expect(toSideView(state, 'empire').rebelBase).toEqual({
      systemId: base.rebelBase.systemId,
      revealed: true,
    });
  });

  it('TC-GC-22: hidden rebel piece → typeKey unknown for the empire; id and systemId visible; real type absent from view', () => {
    const state = deepFreeze(newGame());
    const P_RH = hiddenPieceOf(state, 'rebels');
    // Uniqueness of the hidden typeKey makes the "absent from the serialized view" check meaningful.
    expect(state.pieces.filter((p) => p.typeKey === P_RH.typeKey)).toHaveLength(1);

    const view = toSideView(state, 'empire');
    const seen = view.pieces.find((p) => p.id === P_RH.id);
    expect(seen).toEqual({ ...P_RH, typeKey: UNKNOWN_TYPE_KEY });
    expect(seen?.systemId).toBe(P_RH.systemId);
    expect(JSON.stringify(view)).not.toContain(P_RH.typeKey);
    // Visible (non-hidden) enemy pieces keep their type.
    for (const p of state.pieces.filter((x) => x.owner === 'rebels' && !x.hidden)) {
      expect(view.pieces.find((v) => v.id === p.id)?.typeKey).toBe(p.typeKey);
    }
  });

  it('TC-GC-23: rebellion sees the real typeKey of its own hidden piece', () => {
    const state = deepFreeze(newGame(REBELLION_VS_AI));
    const P_RH = hiddenPieceOf(state, 'rebels');
    const view = toSideView(state, 'rebels');
    expect(view.pieces.find((p) => p.id === P_RH.id)).toEqual(P_RH);
  });

  it('TC-GC-24: symmetric — a hidden empire piece shows typeKey unknown to the rebellion (Q-2)', () => {
    const secret = 'empire-secret-xyz';
    const { state, id } = withHiddenEmpirePiece(newGame(REBELLION_VS_AI), secret);
    deepFreeze(state);

    const rebelView = toSideView(state, 'rebels');
    expect(rebelView.pieces.find((p) => p.id === id)?.typeKey).toBe(UNKNOWN_TYPE_KEY);
    expect(rebelView.pieces.find((p) => p.id === id)?.hidden).toBe(true);
    expect(JSON.stringify(rebelView)).not.toContain(secret);

    const empireView = toSideView(state, 'empire');
    expect(empireView.pieces.find((p) => p.id === id)?.typeKey).toBe(secret);
  });

  it('TC-GC-27: toSideView throws on an invalid viewer (programming error)', () => {
    const state = newGame();
    // @ts-expect-error — deliberately invalid viewer
    expect(() => toSideView(state, 'jedi')).toThrow();
  });

  it('TC-GC-28: log with PIECES_MOVED of the hidden rebel piece leaks neither its typeKey nor the base to the empire', () => {
    // Hot-seat: the rebels move their hidden piece and pass the turn; the empire takes the seat.
    const s0 = newGame(REBELS_VS_HUMAN);
    const P_RH = hiddenPieceOf(s0, 'rebels');
    const to = adjacent(s0, P_RH.systemId)[0]!;
    const moved = applyCommand(s0, env(s0, move([P_RH.id], P_RH.systemId, to)), APPLY_CTX);
    if (!moved.ok) throw new Error('move failed');
    const ended = applyCommand(moved.state, env(moved.state, END_TURN), APPLY_CTX);
    if (!ended.ok) throw new Error('end turn failed');
    expect(toPlayerEvents(ended.events, ended.state)).toEqual([]);
    const accepted = applyCommand(ended.state, env(ended.state, ACCEPT), APPLY_CTX);
    if (!accepted.ok) throw new Error('accept failed');
    const state = deepFreeze(accepted.state);
    const S_X = state.rebelBase.systemId!;
    expect(to).not.toBe(S_X);

    const sessionView = toPlayerView(state, 'prototype');
    if (sessionView.kind !== 'player') throw new Error('expected the board');
    expect(sessionView.viewer).toBe('empire');
    const view = toSideView(state, 'empire');
    expect(sessionView).toEqual(view);
    const event = view.log.find((e) => e.type === 'PIECES_MOVED');
    expect(event).toEqual({
      seq: 2,
      type: 'PIECES_MOVED',
      actor: 'rebels',
      payload: { pieceIds: [P_RH.id], fromSystemId: P_RH.systemId, toSystemId: to },
      at: APPLY_CTX.now,
    });
    const logJson = JSON.stringify(view.log);
    expect(logJson).not.toContain(P_RH.typeKey);
    expect(logJson).not.toContain(S_X);
    expect(JSON.stringify(view)).not.toContain(P_RH.typeKey);
    expect(view.rebelBase.systemId).toBeNull();

    // toPlayerEvents (used by the API for `events` of a CommandResult) is redacted for the active side.
    expect(toPlayerEvents(accepted.events, state)).toEqual([
      { seq: 4, type: 'HANDOFF_ACCEPTED', actor: 'empire', payload: {}, at: APPLY_CTX.now },
    ]);
    expect(JSON.stringify(toPlayerEvents(state.log, state))).not.toContain(P_RH.typeKey);
  });

  it('TC-GC-30: every view passes the strict PlayerViewSchema and contains only PlayerView fields', () => {
    const states = [newGame(), newGame(REBELLION_VS_AI)];
    const { state: withHidden } = withHiddenEmpirePiece(newGame(REBELLION_VS_AI), 'x-secret');
    states.push(withHidden);
    for (const state of states) {
      for (const viewer of ['empire', 'rebels'] as const) {
        const view = toSideView(deepFreeze(state), viewer);
        const parsed = PlayerViewSchema.safeParse(view);
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
        expect(Object.keys(view).sort()).toEqual(
          [
            'kind',
            'viewer',
            'activeSide',
            'settings',
            'id',
            'version',
            'round',
            'phase',
            'systems',
            'pieces',
            'rebelBase',
            'log',
            'legalActions',
          ].sort(),
        );
      }
    }
  });

  it('TC-GC-30: the view shares no mutable objects with the state', () => {
    const state = newGame();
    const snapshot = clone(state);
    const view = toSideView(state, 'empire');
    view.pieces[0]!.systemId = 'mutated';
    view.systems[0]!.adjacentSystemIds.push('mutated');
    view.settings.opponentType = 'human';
    const firstEvent = view.log[0]!;
    if (firstEvent.type === 'GAME_CREATED') firstEvent.payload.scenarioId = 'mutated';
    expect(state).toEqual(snapshot);
  });
});
