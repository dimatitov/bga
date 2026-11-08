/**
 * `core-v1` command pipeline (plan-backend BD-7 / §3.3 + Clarifications). The envelope is already
 * schema-valid (the dispatcher returned 400 otherwise). Check order:
 * 422 `gameOver` → 409 → 422 `commandUnavailable` (ADVANCE_PHASE / END_TURN) → `notYourSide` → `notYourTurn`
 * → hot-seat (`handoffNotAvailable` for ACCEPT_HANDOFF in an AI game → `handoffPending` → `handoffNotAvailable`
 * with nothing pending) → `wrongPhase` → the command's own checks.
 * `notYourSide`: with `origin: 'player'` (default) the actor must be a human side; with `origin: 'auto'`
 * it must be the AI side of an AI game (the auto-play loop itself is the server's, W5).
 * The first failure is returned; `state` is never mutated; every accepted command is `version + 1` once.
 */
import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import {
  CORE_COMMAND_TYPES,
  REBELLION_ERROR_MESSAGE_KEYS as K,
  type Command,
  type CommandEnvelope,
  type CommandOrigin,
  type CoreCommand,
  type CoreGameState,
  type Faction,
} from '../../schema';
import type { ApplyContext } from '../context';
import type { ApplyResult, CoreError } from '../result';
import { participants } from '../turn';
import { applyActivate, validateActivate } from './activation';
import { finalize, illegal, type Transition } from './helpers';
import { applyMove, validateMove } from './movement';
import { applyAcceptHandoff, applyFinishActivation, applyPass } from './turn-flow';

function fail(error: CoreError): ApplyResult<CoreGameState> {
  return { ok: false, error };
}

function isCoreCommand(command: Command): command is CoreCommand {
  return (CORE_COMMAND_TYPES as readonly string[]).includes(command.type);
}

/** May this source issue commands for `actor`? (Q-11 + BD-5) */
function controls(state: CoreGameState, actor: Faction, origin: CommandOrigin): boolean {
  if (origin === 'auto') {
    return state.settings.opponentType === 'ai' && actor === state.settings.opponentFaction;
  }
  return participants(state).includes(actor);
}

export function applyCoreCommand(
  state: CoreGameState,
  envelope: CommandEnvelope,
  ctx: ApplyContext,
): ApplyResult<CoreGameState> {
  const { actor, expectedVersion, command } = envelope;
  const origin: CommandOrigin = ctx.origin ?? 'player';

  if (state.outcome !== null) return fail(illegal(K.gameOver, { actor }));
  if (expectedVersion !== state.version) {
    return fail({
      code: 'VERSION_CONFLICT',
      messageKey: ERROR_MESSAGE_KEYS.versionConflict,
      details: { currentVersion: state.version },
    });
  }
  if (!isCoreCommand(command)) {
    return fail(illegal(K.commandUnavailable, { actor, type: command.type }));
  }
  if (!controls(state, actor, origin)) return fail(illegal(K.notYourSide, { actor }));
  if (actor !== state.activeSide) return fail(illegal(K.notYourTurn, { actor }));
  if (command.type === 'ACCEPT_HANDOFF' && state.settings.opponentType === 'ai') {
    return fail(illegal(K.handoffNotAvailable, { actor }));
  }
  if (state.handoffPending && command.type !== 'ACCEPT_HANDOFF') {
    return fail(illegal(K.handoffPending, { actor }));
  }
  if (command.type === 'ACCEPT_HANDOFF' && !state.handoffPending) {
    return fail(illegal(K.handoffNotAvailable, { actor }));
  }
  if (state.phase !== 'command') return fail(illegal(K.wrongPhase, { actor }));

  const auto = origin === 'auto';
  let transition: Transition;
  switch (command.type) {
    case 'ACTIVATE_SYSTEM': {
      const error = validateActivate(state, actor, command);
      if (error) return fail(error);
      transition = applyActivate(state, actor, command);
      break;
    }
    case 'MOVE_PIECES': {
      const error = validateMove(state, actor, command);
      if (error) return fail(error);
      transition = applyMove(state, actor, command);
      break;
    }
    case 'FINISH_ACTIVATION':
      if (state.activation === null) return fail(illegal(K.noActivation, { actor }));
      transition = applyFinishActivation(state, actor, auto);
      break;
    case 'PASS':
      if (state.activation !== null) return fail(illegal(K.activationInProgress, { actor }));
      transition = applyPass(state, actor, auto);
      break;
    case 'ACCEPT_HANDOFF':
      transition = applyAcceptHandoff(state, actor);
      break;
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
  return { ok: true, ...finalize(state, transition, ctx.now) };
}
