/**
 * `mock-v1` board projection (SWR-002…004 behaviour, moved from `./player-view` in SWR-005; the only change
 * is `rulesEngine: 'mock-v1'` in the view, AM-BE-6).
 */
import {
  UNKNOWN_TYPE_KEY,
  type Faction,
  type GameEvent,
  type MockEvent,
  type MockGameState,
  type MockPlayerView,
  type Piece,
} from '../schema';
import { getMockLegalActions } from './legal-actions';

/** Hidden pieces of the viewer's opponent (either side, Q-2) lose their `typeKey`; id/owner/kind/systemId stay (A-11). */
function redactPiece(piece: Piece, viewer: Faction): Piece {
  if (piece.hidden === true && piece.owner !== viewer) {
    return { ...piece, typeKey: UNKNOWN_TYPE_KEY };
  }
  return { ...piece };
}

/**
 * Single point for redacting secret event payloads of `mock-v1`. Mock events carry no secrets by construction
 * (no typeKey, no rebel base). A `core-v1` event can never be in a `mock-v1` state → programming error.
 */
export function redactMockEvent(
  event: GameEvent,
  _state: MockGameState,
  _viewer: Faction,
): MockEvent {
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
    default:
      throw new Error(`event type ${event.type} does not belong to the mock-v1 engine`);
  }
}

export function mockSideView(state: MockGameState, viewer: Faction): MockPlayerView {
  const baseHidden = viewer === 'empire' && !state.rebelBase.revealed;
  return {
    kind: 'player',
    rulesEngine: 'mock-v1',
    viewer,
    activeSide: state.activeSide,
    settings: { ...state.settings },
    id: state.id,
    version: state.version,
    round: state.round,
    phase: state.phase,
    systems: state.systems.map((s) => ({ ...s, adjacentSystemIds: [...s.adjacentSystemIds] })),
    pieces: state.pieces.map((p) => redactPiece(p, viewer)),
    rebelBase: {
      systemId: baseHidden ? null : state.rebelBase.systemId,
      revealed: state.rebelBase.revealed,
    },
    log: state.log.map((event) => redactMockEvent(event, state, viewer)),
    legalActions: getMockLegalActions(state, viewer),
  };
}
