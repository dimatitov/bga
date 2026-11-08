import { CommandEnvelopeSchema, ERROR_MESSAGE_KEYS, type GameState } from '@swr/contracts';
import type { ApplyContext } from './context';
import { applyAdvancePhase, applyMove, validateMove } from './mock-rules';
import type { ApplyResult, CoreError } from './result';

function fail(error: CoreError): ApplyResult {
  return { ok: false, error };
}

/**
 * Check order (A-5): schema (VALIDATION) → version (VERSION_CONFLICT) → side (notYourSide) → mock rules.
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

  // A-2: only the human side acts in SWR-002 (the AI side does not move yet).
  if (actor !== state.setup.humanFaction) {
    return fail({
      code: 'ILLEGAL_COMMAND',
      messageKey: ERROR_MESSAGE_KEYS.notYourSide,
      details: { actor },
    });
  }

  switch (command.type) {
    case 'MOVE_PIECES': {
      const error = validateMove(state, actor, command);
      if (error) return fail(error);
      return { ok: true, ...applyMove(state, actor, command, ctx.now) };
    }
    case 'ADVANCE_PHASE':
      return { ok: true, ...applyAdvancePhase(state, actor, command, ctx.now) };
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}
