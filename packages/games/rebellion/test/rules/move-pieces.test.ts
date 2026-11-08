import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import { REBELLION_ERROR_MESSAGE_KEYS, type MockGameState } from '../../src/schema';
import { describe, expect, it } from 'vitest';
import { applyCommand, type ApplyResult } from '../../src/rules';
import {
  ADVANCE,
  APPLY_CTX,
  REBELLION_VS_AI,
  adjacent,
  clone,
  deepFreeze,
  env,
  move,
  newGame,
  pickNonAdjacent,
  piece,
  stackOf,
} from './helpers';

// Fixture roles (test-cases.md): P_E1/P_E2 — empire pieces stacked in S_A; S_B — adjacent to S_A;
// S_C — not adjacent to S_A; P_E3 — empire piece outside S_A; P_R1 — rebellion piece.
function fixture() {
  const state = deepFreeze(newGame());
  const { systemId: S_A, pieceIds } = stackOf(state, 'empire');
  const [P_E1, P_E2] = pieceIds as [string, string];
  const S_B = adjacent(state, S_A)[0]!;
  const S_C = pickNonAdjacent(state, S_A);
  const P_E3 = state.pieces.find((p) => p.owner === 'empire' && p.systemId !== S_A)!.id;
  const P_R1 = state.pieces.find((p) => p.owner === 'rebels')!.id;
  return { state, S_A, S_B, S_C, P_E1, P_E2, P_E3, P_R1 };
}

function expectRejected(
  state: MockGameState,
  snapshot: MockGameState,
  result: ApplyResult,
  code: string,
  messageKey: string,
) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  expect(result.error.messageKey).toBe(messageKey);
  expect(state).toEqual(snapshot);
}

describe('applyCommand — MOVE_PIECES (mock rules)', () => {
  it('TC-GC-02: one own piece moves to an adjacent system', () => {
    const { state, S_A, S_B, P_E1 } = fixture();
    const result = applyCommand(state, env(state, move([P_E1], S_A, S_B)), APPLY_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(piece(result.state, P_E1).systemId).toBe(S_B);
    for (const p of state.pieces.filter((x) => x.id !== P_E1)) {
      expect(piece(result.state, p.id)).toEqual(p);
    }
    expect(result.state.version).toBe(2);
    expect(result.state.log).toHaveLength(2);
    const expected = {
      seq: 2,
      type: 'PIECES_MOVED',
      actor: 'empire',
      payload: { pieceIds: [P_E1], fromSystemId: S_A, toSystemId: S_B },
      at: APPLY_CTX.now,
    };
    expect(result.events).toEqual([expected]);
    expect(result.state.log[1]).toEqual(expected);
    expect(result.state).not.toBe(state);
    expect(piece(state, P_E1).systemId).toBe(S_A);
  });

  it('TC-GC-03: two empire pieces move together — version +1 once, one event', () => {
    const { state, S_A, S_B, P_E1, P_E2 } = fixture();
    const result = applyCommand(state, env(state, move([P_E1, P_E2], S_A, S_B)), APPLY_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(piece(result.state, P_E1).systemId).toBe(S_B);
    expect(piece(result.state, P_E2).systemId).toBe(S_B);
    expect(result.state.version).toBe(state.version + 1);
    expect(result.events).toHaveLength(1);
    expect(result.state.log).toHaveLength(state.log.length + 1);
  });

  it('TC-GC-03: two rebellion pieces move together (human = rebellion)', () => {
    const state = deepFreeze(newGame(REBELLION_VS_AI));
    const { systemId, pieceIds } = stackOf(state, 'rebels');
    const to = adjacent(state, systemId)[0]!;
    const result = applyCommand(state, env(state, move(pieceIds, systemId, to)), APPLY_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of pieceIds) expect(piece(result.state, id).systemId).toBe(to);
    expect(result.state.version).toBe(2);
    expect(result.events).toEqual([
      {
        seq: 2,
        type: 'PIECES_MOVED',
        actor: 'rebels',
        payload: { pieceIds, fromSystemId: systemId, toSystemId: to },
        at: APPLY_CTX.now,
      },
    ]);
  });

  it('TC-GC-07: non-adjacent target → ILLEGAL_COMMAND notAdjacent (result, not exception)', () => {
    const { state, S_A, S_C, P_E1 } = fixture();
    const snapshot = clone(state);
    const result = applyCommand(state, env(state, move([P_E1], S_A, S_C)), APPLY_CTX);
    expectRejected(
      state,
      snapshot,
      result,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.notAdjacent,
    );
  });

  it('TC-GC-08: moving an enemy piece → ILLEGAL_COMMAND notOwner', () => {
    const { state, P_R1 } = fixture();
    const snapshot = clone(state);
    const from = piece(state, P_R1).systemId;
    const result = applyCommand(
      state,
      env(state, move([P_R1], from, adjacent(state, from)[0]!)),
      APPLY_CTX,
    );
    expectRejected(
      state,
      snapshot,
      result,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.notOwner,
    );
    if (!result.ok) expect(result.error.details).toEqual({ pieceId: P_R1 });
  });

  it('TC-GC-09: piece not in fromSystemId → ILLEGAL_COMMAND notInFromSystem', () => {
    const { state, S_B, P_E1 } = fixture();
    const snapshot = clone(state);
    const target = adjacent(state, S_B)[0]!;
    const result = applyCommand(state, env(state, move([P_E1], S_B, target)), APPLY_CTX);
    expectRejected(
      state,
      snapshot,
      result,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.notInFromSystem,
    );
  });

  it('TC-GC-10: unknown piece id → ILLEGAL_COMMAND unknownPiece', () => {
    const { state, S_A, S_B } = fixture();
    const snapshot = clone(state);
    const result = applyCommand(state, env(state, move(['no-such-piece'], S_A, S_B)), APPLY_CTX);
    expectRejected(
      state,
      snapshot,
      result,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.unknownPiece,
    );
    if (!result.ok) expect(result.error.details).toEqual({ pieceId: 'no-such-piece' });
  });

  it('TC-GC-11: empty pieceIds → VALIDATION (schema)', () => {
    const { state, S_A, S_B } = fixture();
    const snapshot = clone(state);
    const result = applyCommand(state, env(state, move([], S_A, S_B)), APPLY_CTX);
    expectRejected(state, snapshot, result, 'VALIDATION', ERROR_MESSAGE_KEYS.validation);
  });

  it('TC-GC-12: one valid + one piece outside fromSystem → rejected, nothing moves (A-6)', () => {
    const { state, S_A, S_B, P_E1, P_E3 } = fixture();
    const snapshot = clone(state);
    const result = applyCommand(state, env(state, move([P_E1, P_E3], S_A, S_B)), APPLY_CTX);
    expectRejected(
      state,
      snapshot,
      result,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.notInFromSystem,
    );
    expect(piece(state, P_E1).systemId).toBe(S_A);
  });

  it('TC-GC-13: from === to → ILLEGAL_COMMAND sameSystem', () => {
    const { state, S_A, P_E1 } = fixture();
    const snapshot = clone(state);
    const result = applyCommand(state, env(state, move([P_E1], S_A, S_A)), APPLY_CTX);
    expectRejected(
      state,
      snapshot,
      result,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.sameSystem,
    );
  });

  it('TC-GC-14: unknown toSystemId and unknown fromSystemId → ILLEGAL_COMMAND unknownSystem', () => {
    const { state, S_A, S_B, P_E1 } = fixture();
    const snapshot = clone(state);
    const toUnknown = applyCommand(
      state,
      env(state, move([P_E1], S_A, 'no-such-system')),
      APPLY_CTX,
    );
    expectRejected(
      state,
      snapshot,
      toUnknown,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.unknownSystem,
    );
    const fromUnknown = applyCommand(
      state,
      env(state, move([P_E1], 'no-such-system', S_B)),
      APPLY_CTX,
    );
    expectRejected(
      state,
      snapshot,
      fromUnknown,
      'ILLEGAL_COMMAND',
      REBELLION_ERROR_MESSAGE_KEYS.unknownSystem,
    );
  });

  it('TC-GC-15: duplicate pieceIds → VALIDATION (A-6)', () => {
    const { state, S_A, S_B, P_E1 } = fixture();
    const snapshot = clone(state);
    const result = applyCommand(state, env(state, move([P_E1, P_E1], S_A, S_B)), APPLY_CTX);
    expectRejected(state, snapshot, result, 'VALIDATION', ERROR_MESSAGE_KEYS.validation);
  });

  it('TC-GC-31: MOVE_PIECES is accepted in the command and refresh phases too', () => {
    const { state: s0, S_A, S_B, P_E1 } = fixture();
    let state = s0;
    for (const phase of ['command', 'refresh'] as const) {
      const advanced = applyCommand(state, env(state, ADVANCE), APPLY_CTX);
      if (!advanced.ok) throw new Error('advance failed');
      state = advanced.state;
      expect(state.phase).toBe(phase);

      const moveAction = applyCommand(state, env(state, move([P_E1], S_A, S_B)), APPLY_CTX);
      expect(moveAction.ok).toBe(true);
      if (moveAction.ok) {
        expect(piece(moveAction.state, P_E1).systemId).toBe(S_B);
        expect(moveAction.state.phase).toBe(phase);
      }
    }
  });
});
