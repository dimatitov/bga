/**
 * Physical Sync v0 (SWR-010 plan-backend §5): the queue of physical-table tasks of a `physical_companion` game.
 * - The queue (`state.table.tasks`, head = `[0]`) exists only in `physical_companion` games (always vs the AI).
 * - Initial tasks at creation (`initialTableState`, version 1): `initialSetup` and, for a human Rebel player,
 *   `registerBase` (completed by `REGISTER_CARD`, never by a confirmation).
 * - After every accepted command `tasksFromEvents` turns the command's events into tasks. It reads ONLY the events
 *   as the human sees them (`corePlayerEvents`, the single redaction point): the AI Rebels' base is never named
 *   before the reveal / the end of the game (S1), the AI Empire's probe cards are never named (S2).
 * - Tasks are built once and never change afterwards; the human's own commands produce none (A-5), but the system
 *   consequences of them (Refresh after the human's pass, the reveal after the human's FINISH) do.
 * - `CONFIRM_TABLE_TASK` removes the head task (`applyConfirmTask`): nothing else in the state changes.
 * Pure: nothing here mutates its input.
 */
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  opponentOf,
  probeDefinitionId,
  type ConfirmTableTaskCommand,
  type CoreEvent,
  type CoreGameState,
  type CoreTableState,
  type CoreViewEvent,
  type Faction,
  type RebellionSettings,
  type TableStep,
  type TableTask,
  type TableTaskKind,
  type TableView,
} from '../../schema';
import type { CoreError } from '../result';
import { illegal, type Transition } from './helpers';
import { corePlayerEvents } from './redact';

/** The version a new game is created with (the initial tasks carry it). */
const CREATED_VERSION = 1;

type Affected = TableTask['affected'];

function affected(partial: Partial<Affected> = {}): Affected {
  return {
    cardDefinitionIds: partial.cardDefinitionIds ?? [],
    leaderIds: partial.leaderIds ?? [],
    unitIds: partial.unitIds ?? [],
    systemIds: partial.systemIds ?? [],
  };
}

function step(name: string, params: TableStep['params'] = {}): TableStep {
  return { key: `table.steps.${name}` as TableStep['key'], params };
}

function task(
  id: string,
  kind: TableTaskKind,
  actor: TableTask['actor'],
  createdAtVersion: number,
  steps: TableStep[],
  affectedPieces: Affected,
  completion: TableTask['completion'] = 'confirm',
): TableTask {
  return {
    id,
    kind,
    actor,
    titleKey: `table.tasks.${kind}`,
    createdAtVersion,
    affected: affectedPieces,
    steps,
    completion,
  };
}

/**
 * The table of a new `physical_companion` game (§5.3): `t-1-1` `initialSetup`; for a human Rebel player also
 * `t-1-2` `registerBase` and `baseRegistration` (the systems whose probe card may be registered as the Location).
 * The human Empire's setup only puts a placeholder on the "Rebel Base" space (never a system).
 */
export function initialTableState(
  settings: RebellionSettings,
  eligibleSystemIds: readonly string[],
): CoreTableState {
  const humanRebels = settings.playerFaction === 'rebels';
  const removed = FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS.map(probeDefinitionId);
  const setupSteps = [
    step('setupFirstGame'),
    step('removeProbeCards', { definitionIds: [...removed] }),
    ...(humanRebels ? [] : [step('placeLocationPlaceholder')]),
    step('setAsideReferenceStack'),
  ];
  const tasks: TableTask[] = [
    task(
      `t-${CREATED_VERSION}-1`,
      'initialSetup',
      'system',
      CREATED_VERSION,
      setupSteps,
      affected({ cardDefinitionIds: [...removed] }),
    ),
  ];
  if (humanRebels) {
    tasks.push(
      task(
        `t-${CREATED_VERSION}-2`,
        'registerBase',
        'rebels',
        CREATED_VERSION,
        [step('registerBaseCard')],
        affected(),
        'register',
      ),
    );
  }
  return {
    tasks,
    baseRegistration: humanRebels ? { eligibleSystemIds: [...eligibleSystemIds] } : null,
  };
}

/** A Refresh being collected: `PHASE_STARTED{refresh}` … `TIME_ADVANCED`. */
interface RefreshDraft {
  leaderIds: string[];
  draw: TableStep | null;
  drawnIds: string[];
}

/**
 * Tasks for the events of ONE accepted command (§5.3), in event order, ids `t-<version>-<n>`. The events are
 * first redacted for `human` against `state` (the state after the command): every system / card id in a task is
 * one the human may see at that moment.
 */
export function tasksFromEvents(
  events: readonly CoreEvent[],
  state: CoreGameState,
  human: Faction,
  version: number,
): TableTask[] {
  const ai = opponentOf(human);
  const tasks: TableTask[] = [];
  const add = (
    kind: TableTaskKind,
    actor: TableTask['actor'],
    steps: TableStep[],
    pieces: Affected,
  ) => {
    tasks.push(task(`t-${version}-${tasks.length + 1}`, kind, actor, version, steps, pieces));
  };
  let refresh: RefreshDraft | null = null;

  for (const event of corePlayerEvents(events, state, human) satisfies CoreViewEvent[]) {
    switch (event.type) {
      case 'SYSTEM_ACTIVATED':
        if (event.actor !== ai) break;
        add(
          'aiActivation',
          ai,
          [
            step('placeLeader', {
              leaderId: event.payload.leaderId,
              systemId: event.payload.systemId,
            }),
          ],
          affected({ leaderIds: [event.payload.leaderId], systemIds: [event.payload.systemId] }),
        );
        break;
      case 'PIECES_MOVED':
        if (event.actor !== ai) break;
        add(
          'aiMove',
          ai,
          [
            step('moveUnits', {
              unitIds: [...event.payload.pieceIds],
              fromSystemId: event.payload.fromSystemId,
              toSystemId: event.payload.toSystemId,
            }),
          ],
          affected({
            unitIds: [...event.payload.pieceIds],
            systemIds: [event.payload.fromSystemId, event.payload.toSystemId],
          }),
        );
        break;
      case 'PHASE_STARTED':
        if (event.payload.phase === 'refresh') {
          refresh = { leaderIds: [], draw: null, drawnIds: [] };
        }
        break;
      case 'LEADERS_RETURNED':
        if (refresh) refresh.leaderIds = [...event.payload.leaderIds];
        break;
      case 'CARDS_DRAWN':
        if (!refresh) break;
        if (event.payload.side === human) {
          // The human's own draw (Empire): take exactly these cards from the reference stack (A-10).
          const ids = event.payload.definitionIds ?? [];
          refresh.draw = step('takeProbeCards', { definitionIds: [...ids] });
          refresh.drawnIds = [...ids];
        } else {
          // The AI Empire's draw: only the count is public (S2).
          refresh.draw = step('opponentDrewProbeCards', { count: event.payload.count });
        }
        break;
      case 'TIME_ADVANCED': {
        const collected: RefreshDraft = refresh ?? { leaderIds: [], draw: null, drawnIds: [] };
        add(
          'refresh',
          'system',
          [
            ...(collected.leaderIds.length > 0
              ? [step('returnLeaders', { leaderIds: [...collected.leaderIds] })]
              : []),
            ...(collected.draw ? [collected.draw] : []),
            step('advanceTime', { from: event.payload.from, to: event.payload.to }),
          ],
          affected({
            leaderIds: [...collected.leaderIds],
            cardDefinitionIds: [...collected.drawnIds],
          }),
        );
        refresh = null;
        break;
      }
      case 'BASE_REVEALED': {
        const systemId = event.payload.systemId;
        add(
          'baseRevealed',
          'system',
          [
            step(human === 'empire' ? 'revealBase' : 'revealOwnBase', { systemId }),
            step('moveBaseUnits', { systemId }),
          ],
          affected({ cardDefinitionIds: [probeDefinitionId(systemId)], systemIds: [systemId] }),
        );
        break;
      }
      // No physical consequence of their own (A-5, C-4): the human's commands, passes, finishes, phase markers,
      // the end of the game, the registration and confirmations.
      case 'GAME_CREATED':
      case 'HANDOFF_ACCEPTED':
      case 'ACTIVATION_FINISHED':
      case 'PASSED':
      case 'GAME_OVER':
      case 'CARD_REGISTERED':
      case 'TABLE_TASK_CONFIRMED':
        break;
      default: {
        const unreachable: never = event;
        return unreachable;
      }
    }
  }
  return tasks;
}

/** CONFIRM_TABLE_TASK checks (§5.4), the table exists: not found → not the head → head needs a registration. */
export function validateConfirmTask(
  state: CoreGameState,
  c: ConfirmTableTaskCommand,
): CoreError | null {
  const tasks = state.table?.tasks ?? [];
  const index = tasks.findIndex((t) => t.id === c.taskId);
  if (index < 0) return illegal(K.tableTaskNotFound, { taskId: c.taskId });
  if (index > 0) return illegal(K.tableTaskNotHead, { taskId: c.taskId });
  if (tasks[0]?.completion === 'register') {
    return illegal(K.tableTaskNeedsRegistration, { taskId: c.taskId });
  }
  return null;
}

/** Remove the (validated) head task; `TABLE_TASK_CONFIRMED`. Nothing else changes (version/log: `finalize`). */
export function applyConfirmTask(
  state: CoreGameState,
  actor: Faction,
  c: ConfirmTableTaskCommand,
): Transition {
  const table = state.table;
  const head = table?.tasks[0];
  if (!table || !head || head.id !== c.taskId) {
    throw new Error('core-v1: CONFIRM_TABLE_TASK without a matching head task');
  }
  return {
    state: { ...state, table: { ...table, tasks: table.tasks.slice(1) } },
    drafts: [
      { type: 'TABLE_TASK_CONFIRMED', actor, payload: { taskId: head.id, kind: head.kind } },
    ],
  };
}

/** After `REGISTER_CARD`: the `registerBase` task leaves the queue, no registration is expected any more. */
export function completeRegistration(t: Transition): Transition {
  const table = t.state.table;
  if (!table) throw new Error('core-v1: registration without a table');
  return {
    state: {
      ...t.state,
      table: {
        tasks: table.tasks.filter((task0) => task0.kind !== 'registerBase'),
        baseRegistration: null,
      },
    },
    drafts: t.drafts,
  };
}

/** The table as `viewer` sees it: only the human player has one (the AI side's view gets `null`). */
export function tableViewFor(state: CoreGameState, viewer: Faction): TableView | null {
  const table = state.table;
  if (!table || viewer !== state.settings.playerFaction) return null;
  const aiSide = opponentOf(state.settings.playerFaction);
  return {
    tasks: JSON.parse(JSON.stringify(table.tasks)) as TableTask[],
    aiWaiting: table.tasks.length > 0 && state.outcome === null && state.activeSide === aiSide,
    registration:
      table.baseRegistration === null
        ? null
        : {
            zoneId: 'rebels-location',
            eligibleDefinitionIds: table.baseRegistration.eligibleSystemIds.map(probeDefinitionId),
          },
  };
}

/** Non-empty queue: every other game command waits (422 `tableSyncPending`), no legal actions, the AI waits. */
export function tableBlocks(state: CoreGameState): boolean {
  return (state.table?.tasks.length ?? 0) > 0;
}
