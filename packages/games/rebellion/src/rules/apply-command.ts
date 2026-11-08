import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import {
  CommandEnvelopeSchema,
  REBELLION_ERROR_MESSAGE_KEYS,
  type Faction,
  type GameState,
} from '../schema';
import type { ApplyContext } from './context';
import { applyAdvancePhase, applyMove, validateMove } from './mock-rules';
import type { ApplyResult, CoreError } from './result';
import { applyAcceptHandoff, applyEndTurn, participants } from './turn';

function fail(error: CoreError): ApplyResult {
  return { ok: false, error };
}

/** `details` echo only the actor from the request (never state data). */
function illegal(messageKey: CoreError['messageKey'], actor: Faction): CoreError {
  return { code: 'ILLEGAL_COMMAND', messageKey, details: { actor } };
}

/**
 * Check order (A-5, SWR-004 plan-backend §4.2): schema (VALIDATION) → version (VERSION_CONFLICT) →
 * notYourSide (actor does not take part) → notYourTurn (actor ≠ activeSide) → handoffNotAvailable
 * (END_TURN/ACCEPT_HANDOFF in an AI game) → handoffPending (anything but ACCEPT_HANDOFF while the seat
 * changes hands) → handoffNotAvailable (ACCEPT_HANDOFF with nothing pending) → mock rules / turn.
 * The first failure is returned; `state` is never mutated and rejections are results, not exceptions (AM-4).
 */
export function applyCommand(state: GameState, envelope: unknown, ctx: ApplyContext): ApplyResult {
  const parsed = CommandEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    return fail({
      code: 'VALIDATION',
      messageKey: ERROR_MESSAGE_KEYS.validation,
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
          code: issue.code,
          message: issue.message,
        })),
      },
    });
  }
  const { actor, expectedVersion, command } = parsed.data;

  if (expectedVersion !== state.version) {
    return fail({
      code: 'VERSION_CONFLICT',
      messageKey: ERROR_MESSAGE_KEYS.versionConflict,
      details: { currentVersion: state.version },
    });
  }

  // Q-11: a side that does not take part (the AI side of an AI game) → notYourSide.
  if (!participants(state).includes(actor)) {
    return fail(illegal(REBELLION_ERROR_MESSAGE_KEYS.notYourSide, actor));
  }
  // Hot-seat: a participant acts only on its own turn.
  if (actor !== state.activeSide) {
    return fail(illegal(REBELLION_ERROR_MESSAGE_KEYS.notYourTurn, actor));
  }
  const isHandoffCommand = command.type === 'END_TURN' || command.type === 'ACCEPT_HANDOFF';
  // Q-10: no turn passing against the AI.
  if (isHandoffCommand && state.settings.opponentType === 'ai') {
    return fail(illegal(REBELLION_ERROR_MESSAGE_KEYS.handoffNotAvailable, actor));
  }
  // While the seat changes hands only ACCEPT_HANDOFF is accepted.
  if (state.handoffPending && command.type !== 'ACCEPT_HANDOFF') {
    return fail(illegal(REBELLION_ERROR_MESSAGE_KEYS.handoffPending, actor));
  }

  switch (command.type) {
    case 'MOVE_PIECES': {
      const error = validateMove(state, actor, command);
      if (error) return fail(error);
      return { ok: true, ...applyMove(state, actor, command, ctx.now) };
    }
    case 'ADVANCE_PHASE':
      return { ok: true, ...applyAdvancePhase(state, actor, command, ctx.now) };
    case 'END_TURN':
      return { ok: true, ...applyEndTurn(state, actor, command, ctx.now) };
    case 'ACCEPT_HANDOFF':
      if (!state.handoffPending) {
        return fail(illegal(REBELLION_ERROR_MESSAGE_KEYS.handoffNotAvailable, actor));
      }
      return { ok: true, ...applyAcceptHandoff(state, actor, command, ctx.now) };
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}
