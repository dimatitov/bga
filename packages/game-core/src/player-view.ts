import {
  FactionSchema,
  UNKNOWN_TYPE_KEY,
  type Faction,
  type GameEvent,
  type GameState,
  type Piece,
  type PlayerView,
} from '@swr/contracts';
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
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

/** Redact events for `viewer`. */
export function toPlayerEvents(
  events: GameEvent[],
  state: GameState,
  viewer: Faction,
): GameEvent[] {
  const who = FactionSchema.parse(viewer);
  return events.map((event) => redactEvent(event, state, who));
}

/** Projection of `state` for `viewer`: hidden info removed, `legalActions` added. Throws on an invalid viewer. */
export function toPlayerView(state: GameState, viewer: Faction): PlayerView {
  const who = FactionSchema.parse(viewer);
  const baseHidden = who === 'empire' && !state.rebelBase.revealed;
  return {
    id: state.id,
    version: state.version,
    round: state.round,
    phase: state.phase,
    setup: { ...state.setup, opponent: { ...state.setup.opponent } },
    systems: state.systems.map((s) => ({ ...s, adjacentSystemIds: [...s.adjacentSystemIds] })),
    pieces: state.pieces.map((p) => redactPiece(p, who)),
    rebelBase: {
      systemId: baseHidden ? null : state.rebelBase.systemId,
      revealed: state.rebelBase.revealed,
    },
    log: toPlayerEvents(state.log, state, who),
    legalActions: getLegalActions(state, who),
  };
}
