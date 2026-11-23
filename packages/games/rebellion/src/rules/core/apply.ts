/**
 * `core-v1` command pipeline (plan-backend BD-7 / §3.3 + Clarifications). The envelope is already
 * schema-valid (the dispatcher returned 400 otherwise). Check order:
 * 422 `gameOver` → 409 → 422 `commandUnavailable` (ADVANCE_PHASE / END_TURN) → `notYourSide` → `notYourTurn`
 * → hot-seat (`handoffNotAvailable` for ACCEPT_HANDOFF in an AI game → `handoffPending` → `handoffNotAvailable`
 * with nothing pending) → `wrongPhase` → the command's own checks.
 * `notYourSide`: with `origin: 'player'` (default) the actor must be a human side; with `origin: 'auto'`
 * it must be the AI side of an AI game (the auto-play loop itself is the server's, W5).
 * The first failure is returned; `state` is never mutated; every accepted command is `version + 1` once.
 * After the command's own transition the central state checks run (`runStateChecks`: base reveal + Empire
 * victory, SWR-008 DISC-009); after `FINISH_ACTIVATION` the turn is handed over only then, if the game goes on.
 *
 * SWR-010 Physical Sync v0 (plan-backend §5.5):
 * - `CONFIRM_TABLE_TASK` / `REGISTER_CARD` take their own branch BEFORE `gameOver` (a confirmation is allowed
 *   after the end of the game, C-5): 409 → no table (`commandUnavailable` / `registrationUnavailable`) →
 *   `notYourSide` (only the human player, never `origin: 'auto'`) → CONFIRM: `tableTaskNotFound` →
 *   `tableTaskNotHead` → `tableTaskNeedsRegistration`; REGISTER: `gameOver` → `registrationUnavailable` →
 *   `unknownCard` → `cardNotEligible`.
 * - every other command: … `notYourSide` → `tableSyncPending` (non-empty queue) → `notYourTurn` …
 * - after `finalize`, in a game with a table, the command's events become tasks (`tasksFromEvents`, built from the
 *   events as the human sees them); the version is not bumped a second time.
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
  type ConfirmTableTaskCommand,
  type CoreEvent,
  type Faction,
  type RegisterCardCommand,
} from '../../schema';
import type { ApplyContext } from '../context';
import type { ApplyResult, CoreError } from '../result';
import { participants } from '../turn';
import { applyActivate, validateActivate } from './activation';
import { applyRegisterLocation, validateRegisterLocation } from './cards';
import { finalize, illegal, type Transition } from './helpers';
import { applyMove, validateMove } from './movement';
import { runStateChecks } from './state-checks';
import {
  applyConfirmTask,
  completeRegistration,
  tableBlocks,
  tasksFromEvents,
  validateConfirmTask,
} from './table';
import { applyAcceptHandoff, applyFinishActivation, applyPass, handOver } from './turn-flow';

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
  const { actor, command } = envelope;
  let transition: Transition;
  if (command.type === 'CONFIRM_TABLE_TASK' || command.type === 'REGISTER_CARD') {
    const error = checkTableCommand(state, { ...envelope, command }, ctx);
    if (error) return fail(error);
    if (command.type === 'CONFIRM_TABLE_TASK') {
      // Nothing but the queue changes: no state checks, no new tasks (TABLE_TASK_CONFIRMED creates none).
      return { ok: true, ...finalize(state, applyConfirmTask(state, actor, command), ctx.now) };
    }
    transition = completeRegistration(applyRegisterLocation(state, actor, command));
  } else {
    const result = gameTransition(state, envelope, ctx);
    if (!result.ok) return fail(result.error);
    transition = result.transition;
  }
  let checked = runStateChecks(transition);
  if (command.type === 'FINISH_ACTIVATION' && checked.state.outcome === null) {
    checked = handOver(checked, actor);
  }
  return accept(state, checked, ctx);
}

/** The game commands (everything but the table branch): checks in order, then the command's own transition. */
function gameTransition(
  state: CoreGameState,
  envelope: CommandEnvelope,
  ctx: ApplyContext,
): { ok: true; transition: Transition } | { ok: false; error: CoreError } {
  const { actor, expectedVersion, command } = envelope;
  const origin: CommandOrigin = ctx.origin ?? 'player';
  const no = (error: CoreError) => ({ ok: false as const, error });
  const yes = (transition: Transition) => ({ ok: true as const, transition });

  if (state.outcome !== null) return no(illegal(K.gameOver, { actor }));
  if (expectedVersion !== state.version) return no(versionConflict(state));
  if (!isCoreCommand(command)) {
    return no(illegal(K.commandUnavailable, { actor, type: command.type }));
  }
  if (!controls(state, actor, origin)) return no(illegal(K.notYourSide, { actor }));
  if (tableBlocks(state)) return no(illegal(K.tableSyncPending, { actor }));
  if (actor !== state.activeSide) return no(illegal(K.notYourTurn, { actor }));
  if (command.type === 'ACCEPT_HANDOFF' && state.settings.opponentType === 'ai') {
    return no(illegal(K.handoffNotAvailable, { actor }));
  }
  if (state.handoffPending && command.type !== 'ACCEPT_HANDOFF') {
    return no(illegal(K.handoffPending, { actor }));
  }
  if (command.type === 'ACCEPT_HANDOFF' && !state.handoffPending) {
    return no(illegal(K.handoffNotAvailable, { actor }));
  }
  if (state.phase !== 'command') return no(illegal(K.wrongPhase, { actor }));

  const auto = origin === 'auto';
  switch (command.type) {
    case 'ACTIVATE_SYSTEM': {
      const error = validateActivate(state, actor, command);
      return error ? no(error) : yes(applyActivate(state, actor, command));
    }
    case 'MOVE_PIECES': {
      const error = validateMove(state, actor, command);
      return error ? no(error) : yes(applyMove(state, actor, command));
    }
    case 'FINISH_ACTIVATION':
      if (state.activation === null) return no(illegal(K.noActivation, { actor }));
      return yes(applyFinishActivation(state, actor, auto));
    case 'PASS':
      if (state.activation !== null) return no(illegal(K.activationInProgress, { actor }));
      return yes(applyPass(state, actor, auto));
    case 'ACCEPT_HANDOFF':
      return yes(applyAcceptHandoff(state, actor));
    case 'CONFIRM_TABLE_TASK':
    case 'REGISTER_CARD':
      throw new Error('core-v1: table commands take the table branch');
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

function versionConflict(state: CoreGameState): CoreError {
  return {
    code: 'VERSION_CONFLICT',
    messageKey: ERROR_MESSAGE_KEYS.versionConflict,
    details: { currentVersion: state.version },
  };
}

/** `finalize`, then (game with a table) queue the tasks of this command's events (§5.3). */
function accept(
  original: CoreGameState,
  transition: Transition,
  ctx: ApplyContext,
): ApplyResult<CoreGameState> {
  const done = finalize(original, transition, ctx.now);
  const table = done.state.table;
  if (!table) return { ok: true, ...done };
  const added = tasksFromEvents(
    done.events satisfies CoreEvent[],
    done.state,
    done.state.settings.playerFaction,
    done.state.version,
  );
  if (added.length === 0) return { ok: true, ...done };
  return {
    ok: true,
    state: { ...done.state, table: { ...table, tasks: [...table.tasks, ...added] } },
    events: done.events,
  };
}

/**
 * The physical-table branch checks (§5.5), BEFORE `gameOver` (a confirmation is allowed after the end of the game):
 * 409 → no table → `notYourSide` → CONFIRM: not found / not head / needs registration; REGISTER: `./cards` checks.
 */
function checkTableCommand(
  state: CoreGameState,
  envelope: CommandEnvelope & { command: ConfirmTableTaskCommand | RegisterCardCommand },
  ctx: ApplyContext,
): CoreError | null {
  const { actor, expectedVersion, command } = envelope;
  if (expectedVersion !== state.version) return versionConflict(state);
  if (!state.table) {
    return command.type === 'CONFIRM_TABLE_TASK'
      ? illegal(K.commandUnavailable, { actor, type: command.type })
      : illegal(K.registrationUnavailable, {
          zoneId: command.zoneId,
          definitionId: command.definitionId,
        });
  }
  if (ctx.origin === 'auto' || actor !== state.settings.playerFaction) {
    return illegal(K.notYourSide, { actor });
  }
  return command.type === 'CONFIRM_TABLE_TASK'
    ? validateConfirmTask(state, command)
    : // gameOver → registrationUnavailable → unknownCard → cardNotEligible (W3, `./cards`).
      validateRegisterLocation(state, actor, command);
}
