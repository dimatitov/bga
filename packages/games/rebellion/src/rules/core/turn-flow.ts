/**
 * Turn order and automatic phases (R-3, R-6, R-7; Q-BE-2, Q-5, Q-28).
 * - After `FINISH_ACTIVATION` / `PASS` the turn goes to the other side only if it has NOT passed; otherwise
 *   the same side acts again (consecutive turns, no handoff).
 * - A pass lasts until the end of the command phase (`passed[side]`). When both sides have passed the
 *   command phase ends inside the same command: refresh (R-7 step 1 `LEADERS_RETURNED`, step 5
 *   `TIME_ADVANCED`) → Rebels win when time reaches reputation (R-9) → otherwise the empty assignment
 *   phase (D-2) and a new command phase with the Rebels first, `passed` reset.
 * - Hot-seat: `handoffPending = true` only when the active side actually changes (never at `outcome`);
 *   AI games never get a handoff (the server's auto-play moves for the AI side, W5).
 * - `payload.auto` marks the server's automatic AI move (`ctx.origin === 'auto'`, AM-BE-4).
 */
import { opponentOf, type CoreGameState, type Faction } from '../../schema';
import { isHotSeat, type Transition } from './helpers';
import { checkEmpireVictory, endGame, revealBase, revealsBaseNow } from './victory';

/** Give the turn to the other side unless it has passed (R-3/R-6). */
function handOver(transition: Transition, actor: Faction): Transition {
  const { state } = transition;
  const other = opponentOf(actor);
  if (state.passed[other]) return transition;
  return {
    state: { ...state, activeSide: other, handoffPending: isHotSeat(state) },
    drafts: transition.drafts,
  };
}

/** `FINISH_ACTIVATION` (validated: an own activation is running). Order: ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER (Q-41). */
export function applyFinishActivation(
  state: CoreGameState,
  actor: Faction,
  auto: boolean,
): Transition {
  const activation = state.activation;
  if (activation === null) throw new Error('core-v1: FINISH_ACTIVATION without an activation');
  let transition: Transition = {
    state: { ...state, activation: null },
    drafts: [{ type: 'ACTIVATION_FINISHED', actor, payload: { auto } }],
  };
  if (actor === 'empire' && revealsBaseNow(transition.state, activation.systemId)) {
    transition = checkEmpireVictory(revealBase(transition));
    if (transition.state.outcome !== null) return transition;
  }
  return handOver(transition, actor);
}

/** `PASS` (validated: no activation running). */
export function applyPass(state: CoreGameState, actor: Faction, auto: boolean): Transition {
  const passed = { ...state.passed, [actor]: true };
  const transition: Transition = {
    state: { ...state, passed },
    drafts: [{ type: 'PASSED', actor, payload: { auto } }],
  };
  return passed.rebels && passed.empire
    ? endCommandPhase(transition, actor)
    : handOver(transition, actor);
}

/** Both sides passed: refresh (steps 1 and 5, D-3), then a new round or the Rebel victory. */
function endCommandPhase(transition: Transition, lastActor: Faction): Transition {
  const { state } = transition;
  const from = state.round;
  const to = from + 1;
  const returned = state.leaders.filter((l) => l.systemId !== null).map((l) => l.id);
  const refreshed: Transition = {
    state: {
      ...state,
      phase: 'refresh',
      activation: null,
      leaders: state.leaders.map((l) => (l.systemId === null ? l : { ...l, systemId: null })),
      round: to,
    },
    drafts: [
      ...transition.drafts,
      { type: 'PHASE_STARTED', actor: 'system', payload: { round: from, phase: 'refresh' } },
      { type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: returned } },
      { type: 'TIME_ADVANCED', actor: 'system', payload: { from, to } },
    ],
  };
  if (to >= state.reputation) {
    return endGame(refreshed, { winner: 'rebels', reason: 'timeReachedReputation' });
  }
  const activeSide: Faction = 'rebels';
  return {
    state: {
      ...refreshed.state,
      phase: 'command',
      passed: { rebels: false, empire: false },
      activeSide,
      handoffPending: isHotSeat(state) && activeSide !== lastActor,
    },
    drafts: [
      ...refreshed.drafts,
      { type: 'PHASE_STARTED', actor: 'system', payload: { round: to, phase: 'assignment' } },
      { type: 'PHASE_STARTED', actor: 'system', payload: { round: to, phase: 'command' } },
    ],
  };
}

/** `ACCEPT_HANDOFF` (validated: hot-seat, pending, actor = new active side). */
export function applyAcceptHandoff(state: CoreGameState, actor: Faction): Transition {
  return {
    state: { ...state, handoffPending: false },
    drafts: [{ type: 'HANDOFF_ACCEPTED', actor, payload: {} }],
  };
}
