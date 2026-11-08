import type { SessionStatus } from '@bga/platform';
import {
  FactionSchema,
  type CoreGameState,
  type CorePlayerView,
  type Faction,
  type GameEvent,
  type GameState,
  type HandoffView,
  type MockGameState,
  type MockPlayerView,
  type PlayerEvent,
  type PlayerView,
  type PlayerViewPlayer,
} from '../schema';
import { corePlayerEvents, coreSideView } from './core';
import { mockSideView, redactMockEvent } from './mock-player-view';

/**
 * Events of one command as the client may see them: `[]` while a handoff is pending (the response to a
 * turn change carries no log, AC-14); otherwise redacted for the active side (the viewer of `toPlayerView`).
 */
export function toPlayerEvents(events: readonly GameEvent[], state: GameState): PlayerEvent[] {
  if (state.handoffPending) return [];
  switch (state.rulesEngine) {
    case 'mock-v1':
      return events.map((event) => redactMockEvent(event, state, state.activeSide));
    case 'core-v1':
      return corePlayerEvents(events, state, state.activeSide);
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

/**
 * Board projection of `state` for `viewer`, by the state's rules engine: hidden info removed, `legalActions`
 * added (empty unless `viewer` is the active side). Pure building block — the session view is `toPlayerView`,
 * which picks the viewer itself and never shows a board during a handoff; this one is for the server's own
 * consumers (e.g. the AI receiving its own side's view). Throws on an invalid viewer.
 */
export function toSideView(state: MockGameState, viewer: Faction): MockPlayerView;
export function toSideView(state: CoreGameState, viewer: Faction): CorePlayerView;
export function toSideView(state: GameState, viewer: Faction): PlayerViewPlayer;
export function toSideView(state: GameState, viewer: Faction): PlayerViewPlayer {
  const who = FactionSchema.parse(viewer);
  switch (state.rulesEngine) {
    case 'mock-v1':
      return mockSideView(state, who);
    case 'core-v1':
      return coreSideView(state, who);
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

/** Handoff screen: public metadata only (AM-BE-1) + the public `rulesEngine` (AM-FE-8). Both engines. */
export function toHandoffView(state: GameState, sessionStatus: SessionStatus): HandoffView {
  return {
    kind: 'handoff',
    rulesEngine: state.rulesEngine,
    id: state.id,
    version: state.version,
    activeSide: state.activeSide,
    round: state.round,
    phase: state.phase,
    sessionStatus,
  };
}

/**
 * The session view (spec "Hot-seat"): while `handoffPending` — only the handoff screen; otherwise the
 * board of the active side (in an AI game that is always the player's side). The viewer is never taken
 * from a request.
 */
export function toPlayerView(
  state: MockGameState,
  sessionStatus: SessionStatus,
): MockPlayerView | HandoffView;
export function toPlayerView(
  state: CoreGameState,
  sessionStatus: SessionStatus,
): CorePlayerView | HandoffView;
export function toPlayerView(state: GameState, sessionStatus: SessionStatus): PlayerView;
export function toPlayerView(state: GameState, sessionStatus: SessionStatus): PlayerView {
  return state.handoffPending
    ? toHandoffView(state, sessionStatus)
    : toSideView(state, state.activeSide);
}
