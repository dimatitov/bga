/**
 * MOCK RULES — not Rebellion rules.
 *
 * All temporary game logic of SWR-002 lives in this file only (TC-ARCH-10):
 * - MOVE_PIECES is legal when every piece belongs to the actor, stands in `fromSystemId`,
 *   and `toSystemId` is adjacent to `fromSystemId`; all-or-nothing (A-6); allowed in any phase.
 * - ADVANCE_PHASE cycles assignment → command → refresh → (round + 1) assignment.
 * Real rules arrive in stage E.
 */
import {
  ERROR_MESSAGE_KEYS,
  type AdvancePhaseCommand,
  type Faction,
  type GameState,
  type LegalAction,
  type MovePiecesCommand,
  type Phase,
} from '@swr/contracts';
import type { CoreError } from './result';
import { commit, pieceById, stampEvents, systemById } from './internal/state';

export interface RuleOutcome {
  state: GameState;
  events: GameState['log'];
}

function illegal(messageKey: CoreError['messageKey'], details: Record<string, unknown>): CoreError {
  return { code: 'ILLEGAL_COMMAND', messageKey, details };
}

/**
 * Semantic validation of MOVE_PIECES (order fixed by plan-backend §5 / A-5).
 * `details` only carry ids taken from the request — never data about enemy pieces.
 */
export function validateMove(
  state: GameState,
  actor: Faction,
  command: MovePiecesCommand,
): CoreError | null {
  const { pieceIds, fromSystemId, toSystemId } = command;
  const from = systemById(state, fromSystemId);
  if (!from) return illegal(ERROR_MESSAGE_KEYS.unknownSystem, { systemId: fromSystemId });
  if (!systemById(state, toSystemId)) {
    return illegal(ERROR_MESSAGE_KEYS.unknownSystem, { systemId: toSystemId });
  }
  if (fromSystemId === toSystemId) {
    return illegal(ERROR_MESSAGE_KEYS.sameSystem, { fromSystemId, toSystemId });
  }
  for (const pieceId of pieceIds) {
    const piece = pieceById(state, pieceId);
    if (!piece) return illegal(ERROR_MESSAGE_KEYS.unknownPiece, { pieceId });
    if (piece.owner !== actor) return illegal(ERROR_MESSAGE_KEYS.notOwner, { pieceId });
    if (piece.systemId !== fromSystemId) {
      return illegal(ERROR_MESSAGE_KEYS.notInFromSystem, { pieceId, fromSystemId });
    }
  }
  if (!from.adjacentSystemIds.includes(toSystemId)) {
    return illegal(ERROR_MESSAGE_KEYS.notAdjacent, { fromSystemId, toSystemId });
  }
  return null;
}

/** Apply an already validated MOVE_PIECES: all listed pieces move at once, one PIECES_MOVED event. */
export function applyMove(
  state: GameState,
  actor: Faction,
  command: MovePiecesCommand,
  now: string,
): RuleOutcome {
  const { pieceIds, fromSystemId, toSystemId } = command;
  const moving = new Set(pieceIds);
  const pieces = state.pieces.map((p) => (moving.has(p.id) ? { ...p, systemId: toSystemId } : p));
  const events = stampEvents(
    state,
    [
      {
        type: 'PIECES_MOVED',
        actor,
        payload: { pieceIds: [...pieceIds], fromSystemId, toSystemId },
      },
    ],
    now,
  );
  return { state: commit(state, { pieces }, events), events };
}

const PHASE_ORDER: readonly Phase[] = ['assignment', 'command', 'refresh'];

/** assignment → command → refresh → (round + 1) assignment. */
export function nextPhase(round: number, phase: Phase): { round: number; phase: Phase } {
  const index = PHASE_ORDER.indexOf(phase);
  const next = PHASE_ORDER[index + 1];
  return next ? { round, phase: next } : { round: round + 1, phase: 'assignment' };
}

export function applyAdvancePhase(
  state: GameState,
  actor: Faction,
  _command: AdvancePhaseCommand,
  now: string,
): RuleOutcome {
  const to = nextPhase(state.round, state.phase);
  const events = stampEvents(
    state,
    [
      {
        type: 'PHASE_ADVANCED',
        actor,
        payload: {
          fromRound: state.round,
          fromPhase: state.phase,
          toRound: to.round,
          toPhase: to.phase,
        },
      },
    ],
    now,
  );
  return { state: commit(state, { round: to.round, phase: to.phase }, events), events };
}

/**
 * Mock legal actions of `faction` (who may act is decided by the caller):
 * every own piece may move to any system adjacent to its current one; ADVANCE_PHASE is always available.
 */
export function mockLegalActions(state: GameState, faction: Faction): LegalAction[] {
  const moves: LegalAction[] = state.pieces
    .filter((p) => p.owner === faction)
    .map((p) => ({
      type: 'MOVE_PIECES',
      pieceId: p.id,
      toSystemIds: [...(systemById(state, p.systemId)?.adjacentSystemIds ?? [])],
    }));
  return [...moves, { type: 'ADVANCE_PHASE' }];
}
