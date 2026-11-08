/**
 * `mock-v1` hot-seat turn passing (SWR-004) — real platform behaviour for two humans at one device, not mock rules.
 * Preconditions (human game, actor is the active side, handoff state) are checked by `applyCommand`.
 * - END_TURN: `activeSide → opponentOf(activeSide)`, `handoffPending = true`, event TURN_ENDED;
 *   round and phase are unchanged (Q-10).
 * - ACCEPT_HANDOFF: `handoffPending = false`, event HANDOFF_ACCEPTED (actor = the new active side).
 * Both: `version + 1` exactly once, the input state is never mutated.
 */
import {
  opponentOf,
  type AcceptHandoffCommand,
  type EndTurnCommand,
  type Faction,
  type MockGameState,
  type RebellionSettings,
} from '../schema';
import { commit, stampEvents } from './internal/state';

export interface TurnOutcome {
  state: MockGameState;
  events: MockGameState['log'];
}

export function applyEndTurn(
  state: MockGameState,
  actor: Faction,
  _command: EndTurnCommand,
  now: string,
): TurnOutcome {
  const toSide = opponentOf(state.activeSide);
  const events = stampEvents(state, [{ type: 'TURN_ENDED', actor, payload: { toSide } }], now);
  return { state: commit(state, { activeSide: toSide, handoffPending: true }, events), events };
}

export function applyAcceptHandoff(
  state: MockGameState,
  actor: Faction,
  _command: AcceptHandoffCommand,
  now: string,
): TurnOutcome {
  const events = stampEvents(state, [{ type: 'HANDOFF_ACCEPTED', actor, payload: {} }], now);
  return { state: commit(state, { handoffPending: false }, events), events };
}

/** Sides that take part in the game: the player, plus the opponent when it is a human (Q-11). Both engines. */
export function participants(state: { settings: RebellionSettings }): Faction[] {
  const { playerFaction, opponentFaction, opponentType } = state.settings;
  return opponentType === 'human' ? [playerFaction, opponentFaction] : [playerFaction];
}
