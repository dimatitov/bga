import type { SessionStatus } from '@bga/platform';
import {
  FactionSchema,
  UNKNOWN_TYPE_KEY,
  type Faction,
  type GameEvent,
  type GameState,
  type HandoffView,
  type Piece,
  type PlayerView,
  type PlayerViewPlayer,
} from '../schema';
import { getLegalActions } from './legal-actions';

/** Hidden pieces of the viewer's opponent (either side, Q-2) lose their `typeKey`; id/owner/kind/systemId stay (A-11). */
function redactPiece(piece: Piece, viewer: Faction): Piece {
  if (piece.hidden === true && piece.owner !== viewer) {
    return { ...piece, typeKey: UNKNOWN_TYPE_KEY };
  }
  return { ...piece };
}

/**
 * Single point for redacting secret event payloads. Current events carry no secrets by construction
 * (no typeKey, no rebel base) — a new event type must decide here what the viewer may see.
 */
function redactEvent(event: GameEvent, _state: GameState, _viewer: Faction): GameEvent {
  switch (event.type) {
    case 'GAME_CREATED':
      return { ...event, payload: { ...event.payload } };
    case 'PIECES_MOVED':
      return { ...event, payload: { ...event.payload, pieceIds: [...event.payload.pieceIds] } };
    case 'PHASE_ADVANCED':
      return { ...event, payload: { ...event.payload } };
    case 'TURN_ENDED':
      return { ...event, payload: { ...event.payload } };
    case 'HANDOFF_ACCEPTED':
      return { ...event, payload: {} };
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

/**
 * Events of one command as the client may see them: `[]` while a handoff is pending (the response to
 * END_TURN carries no log, AC-14); otherwise redacted for the active side (the viewer of `toPlayerView`).
 */
export function toPlayerEvents(events: readonly GameEvent[], state: GameState): GameEvent[] {
  if (state.handoffPending) return [];
  return events.map((event) => redactEvent(event, state, state.activeSide));
}

/**
 * Board projection of `state` for `viewer`: hidden info removed, `legalActions` added (empty unless
 * `viewer` is the active side). Pure building block — the session view is `toPlayerView`, which picks the
 * viewer itself and never shows a board during a handoff; this one is for the server's own consumers
 * (e.g. the future AI receiving its own side's view). Throws on an invalid viewer.
 */
export function toSideView(state: GameState, viewer: Faction): PlayerViewPlayer {
  const who = FactionSchema.parse(viewer);
  const baseHidden = who === 'empire' && !state.rebelBase.revealed;
  return {
    kind: 'player',
    viewer: who,
    activeSide: state.activeSide,
    settings: { ...state.settings },
    id: state.id,
    version: state.version,
    round: state.round,
    phase: state.phase,
    systems: state.systems.map((s) => ({ ...s, adjacentSystemIds: [...s.adjacentSystemIds] })),
    pieces: state.pieces.map((p) => redactPiece(p, who)),
    rebelBase: {
      systemId: baseHidden ? null : state.rebelBase.systemId,
      revealed: state.rebelBase.revealed,
    },
    log: state.log.map((event) => redactEvent(event, state, who)),
    legalActions: getLegalActions(state, who),
  };
}

/** Handoff screen: public metadata only (AM-BE-1). */
export function toHandoffView(state: GameState, sessionStatus: SessionStatus): HandoffView {
  return {
    kind: 'handoff',
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
export function toPlayerView(state: GameState, sessionStatus: SessionStatus): PlayerView {
  return state.handoffPending
    ? toHandoffView(state, sessionStatus)
    : toSideView(state, state.activeSide);
}
