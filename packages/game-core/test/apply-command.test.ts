import { CommandEnvelopeSchema, ERROR_MESSAGE_KEYS, type GameState } from '@swr/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand, type ApplyResult } from '../src';
import {
  ADVANCE,
  APPLY_CTX,
  adjacent,
  clone,
  deepFreeze,
  env,
  move,
  newGame,
  pickNonAdjacent,
  stackOf,
} from './helpers';

function stateAtVersion(version: number): GameState {
  let state = newGame();
  while (state.version < version) {
    const r = applyCommand(state, env(state, ADVANCE), APPLY_CTX);
    if (!r.ok) throw new Error('advance failed');
    state = r.state;
  }
  return deepFreeze(state);
}

function expectError(result: ApplyResult, code: string, messageKey: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    expect(result.error.messageKey).toBe(messageKey);
  }
}

describe('applyCommand — envelope, version and side checks (A-2, A-5)', () => {
  it('TC-GC-16: stale/future expectedVersion → VERSION_CONFLICT with currentVersion; 409 beats 422', () => {
    const state = stateAtVersion(5);
    expect(state.version).toBe(5);
    const snapshot = clone(state);
    const { systemId: S_A, pieceIds } = stackOf(state, 'empire');
    const S_C = pickNonAdjacent(state, S_A);

    const envelopes = [
      env(state, ADVANCE, { expectedVersion: 4 }),
      env(state, ADVANCE, { expectedVersion: 6 }),
      env(state, move([pieceIds[0]!], S_A, S_C), { expectedVersion: 4 }), // stale + illegal
      env(state, ADVANCE, { expectedVersion: 4, actor: 'rebellion' }), // stale + not your side
    ];
    for (const envelope of envelopes) {
      const result = applyCommand(state, envelope, APPLY_CTX);
      expectError(result, 'VERSION_CONFLICT', ERROR_MESSAGE_KEYS.versionConflict);
      if (!result.ok) expect(result.error.details).toEqual({ currentVersion: 5 });
    }
    expect(state).toEqual(snapshot);
  });

  it('TC-GC-16: VALIDATION is checked before VERSION_CONFLICT (400 beats 409)', () => {
    const state = stateAtVersion(5);
    const { systemId: S_A, pieceIds } = stackOf(state, 'empire');
    const result = applyCommand(
      state,
      env(state, move([pieceIds[0]!, pieceIds[0]!], S_A, adjacent(state, S_A)[0]!), {
        expectedVersion: 4,
      }),
      APPLY_CTX,
    );
    expectError(result, 'VALIDATION', ERROR_MESSAGE_KEYS.validation);
  });

  it('TC-GC-17: actor ≠ humanFaction → ILLEGAL_COMMAND notYourSide (MOVE of own rebel piece and ADVANCE_PHASE)', () => {
    const state = deepFreeze(newGame()); // human = empire
    const snapshot = clone(state);
    const { systemId, pieceIds } = stackOf(state, 'rebellion');
    const rebelMove = env(state, move([pieceIds[0]!], systemId, adjacent(state, systemId)[0]!), {
      actor: 'rebellion',
    });
    const rebelAdvance = env(state, ADVANCE, { actor: 'rebellion' });

    for (const envelope of [rebelMove, rebelAdvance]) {
      const result = applyCommand(state, envelope, APPLY_CTX);
      expectError(result, 'ILLEGAL_COMMAND', ERROR_MESSAGE_KEYS.notYourSide);
    }
    expect(state).toEqual(snapshot);
  });

  it('TC-GC-18: malformed envelopes are rejected by the schema and by applyCommand as VALIDATION', () => {
    const state = deepFreeze(newGame());
    const snapshot = clone(state);
    const { systemId: S_A, pieceIds } = stackOf(state, 'empire');
    const S_B = adjacent(state, S_A)[0]!;
    const validMove = {
      type: 'MOVE_PIECES',
      pieceIds: [pieceIds[0]],
      fromSystemId: S_A,
      toSystemId: S_B,
    };

    const malformed: unknown[] = [
      { actor: 'empire', expectedVersion: 1, command: { type: 'BLOW_UP_PLANET' } }, // unknown type
      { actor: 'empire', expectedVersion: 1, command: { type: 'ADVANCE_PHASE', extra: 1 } }, // strict
      { actor: 'empire', expectedVersion: 1, command: validMove, extra: true }, // strict envelope
      {
        actor: 'empire',
        expectedVersion: 1,
        command: { type: 'MOVE_PIECES', pieceIds: [pieceIds[0]] },
      }, // missing
      { actor: 'empire', command: { type: 'ADVANCE_PHASE' } }, // missing expectedVersion
      { actor: 'empire', expectedVersion: '1', command: { type: 'ADVANCE_PHASE' } }, // wrong type
      { actor: 'jedi', expectedVersion: 1, command: { type: 'ADVANCE_PHASE' } }, // unknown faction
      { actor: 'empire', expectedVersion: 0, command: { type: 'ADVANCE_PHASE' } }, // not positive
      null,
      'MOVE_PIECES',
      [],
    ];
    for (const envelope of malformed) {
      expect(CommandEnvelopeSchema.safeParse(envelope).success).toBe(false);
      const result = applyCommand(state, envelope, APPLY_CTX);
      expectError(result, 'VALIDATION', ERROR_MESSAGE_KEYS.validation);
      if (!result.ok) {
        const details = result.error.details as { issues: unknown[] };
        expect(Array.isArray(details.issues)).toBe(true);
        expect(details.issues.length).toBeGreaterThan(0);
      }
    }
    expect(state).toEqual(snapshot);
  });
});
