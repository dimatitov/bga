/** Immutable helpers over a `mock-v1` state (`MockGameState`). Nothing here mutates its input. */
import type { MockEvent, MockGameState, Piece, System } from '../../schema';

/** Distributive `Omit` so that it keeps the discriminated union of events intact. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before `seq` and `at` are assigned by `appendEvents`. */
export type EventDraft = DistributiveOmit<MockEvent, 'seq' | 'at'>;

export function systemById(state: Pick<MockGameState, 'systems'>, id: string): System | undefined {
  return state.systems.find((s) => s.id === id);
}

export function pieceById(state: Pick<MockGameState, 'pieces'>, id: string): Piece | undefined {
  return state.pieces.find((p) => p.id === id);
}

export function lastSeq(state: Pick<MockGameState, 'log'>): number {
  const last = state.log[state.log.length - 1];
  return last ? last.seq : 0;
}

/** Assign consecutive `seq` (after the last one in the log) and `at = now` to the drafts. */
export function stampEvents(
  state: Pick<MockGameState, 'log'>,
  drafts: EventDraft[],
  now: string,
): MockEvent[] {
  const base = lastSeq(state);
  return drafts.map((draft, i) => ({ ...draft, seq: base + i + 1, at: now }) as MockEvent);
}

/**
 * Commit an accepted command: `version + 1` (exactly once per command) and append the events.
 * `changes` replaces top-level fields (new arrays/objects, never mutated in place).
 */
export function commit(
  state: MockGameState,
  changes: Partial<
    Pick<
      MockGameState,
      'round' | 'phase' | 'pieces' | 'rebelBase' | 'activeSide' | 'handoffPending'
    >
  >,
  events: MockEvent[],
): MockGameState {
  return {
    ...state,
    ...changes,
    version: state.version + 1,
    log: [...state.log, ...events],
  };
}
