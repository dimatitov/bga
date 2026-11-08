/**
 * Internal helpers of the `core-v1` engine (SWR-005 W3). Nothing here mutates its input: a command builds a
 * `Transition` (next state without version/log + event drafts) and `finalize` stamps the events and bumps
 * the version exactly once per accepted command.
 */
import {
  type CoreEvent,
  type CoreGameState,
  type CoreLeader,
  type CoreUnit,
  type Faction,
  type SystemData,
  type UnitType,
} from '../../schema';
import type { DistributiveOmit } from '../internal/state';
import type { CoreError } from '../result';

/** An event before `seq` and `at` are assigned by `finalize`. */
export type CoreEventDraft = DistributiveOmit<CoreEvent, 'seq' | 'at'>;

/** Intermediate result of an accepted command (version and log are not touched yet). */
export interface Transition {
  state: CoreGameState;
  drafts: CoreEventDraft[];
}

/** `details` only ever echo fields of the request (never state data, plan-backend §5.1). */
export function illegal(
  messageKey: CoreError['messageKey'],
  details: Record<string, unknown>,
): CoreError {
  return { code: 'ILLEGAL_COMMAND', messageKey, details };
}

export function systemById(state: CoreGameState, id: string): SystemData | undefined {
  return state.map.systems.find((s) => s.id === id);
}

export function unitById(state: CoreGameState, id: string): CoreUnit | undefined {
  return state.units.find((u) => u.id === id);
}

export function leaderById(state: CoreGameState, id: string): CoreLeader | undefined {
  return state.leaders.find((l) => l.id === id);
}

/** The unit type of a unit; a missing type is a corrupt state (the state schema forbids it) → throws. */
export function typeOf(state: CoreGameState, typeKey: string): UnitType {
  const type = state.unitTypes.find((t) => t.typeKey === typeKey);
  if (!type) throw new Error('core-v1: unit of an unknown type');
  return type;
}

export function hasOwnLeaderIn(state: CoreGameState, side: Faction, systemId: string): boolean {
  return state.leaders.some((l) => l.owner === side && l.systemId === systemId);
}

export function isHotSeat(state: CoreGameState): boolean {
  return state.settings.opponentType === 'human';
}

/** Stamp the drafts (consecutive `seq`, `at = now`), append them to the log, `version + 1`. */
export function finalize(
  original: CoreGameState,
  transition: Transition,
  now: string,
): { state: CoreGameState; events: CoreEvent[] } {
  const last = original.log[original.log.length - 1];
  const base = last ? last.seq : 0;
  const events = transition.drafts.map(
    (draft, i) => ({ ...draft, seq: base + i + 1, at: now }) as CoreEvent,
  );
  return {
    state: {
      ...transition.state,
      version: original.version + 1,
      log: [...original.log, ...events],
    },
    events,
  };
}
