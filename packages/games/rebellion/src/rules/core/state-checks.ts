/**
 * THE state-check point of `core-v1` (SWR-008, DISC-009; specification R-3, QD-1, QD-2; plan-backend §7).
 *
 * `runStateChecks` runs after every accepted command (`applyCoreCommand`, after the command's own transition and
 * before the turn is handed over on `FINISH_ACTIVATION`) and once at game creation (`createCoreGame`). It is the
 * ONLY place that reveals the Rebel base (`revealBase`) and the place that checks the Imperial victory.
 *
 * Official rule (RR p.11, LTP p.12; KB `rebellion:base.reveal-condition`, `rebellion:base.reveal-timing`,
 * `rebellion:command.activate.steps`): the base is revealed as soon as the Empire has loyalty or ground units in
 * the base system; after a move, only once all movement of the activation is over (step 3 of 5, before combat).
 * core-v1 has no loyalty (DISC-005) and no combat (D-1), so: an Imperial ground unit in the base system reveals
 * the base at the first check point where no Imperial activation is running — the `FINISH_ACTIVATION` of ANY
 * system, or at once after a command outside an Imperial activation (future deployments/missions; QD-1).
 *
 * Event order of one command: `…, ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER` (SWR-005 Q-41). Idempotent:
 * `revealed = true` never reveals again, a finished game is never touched, so running the checks on their own
 * result adds nothing. Pure: never mutates its input, no version/log changes (`finalize` does that).
 */
import { unitTypeRevealsRebelBase, type CoreGameState } from '../../schema';
import { typeOf, type Transition } from './helpers';
import { checkEmpireVictory, revealBase } from './victory';

/**
 * R-3 condition, core-v1: an Imperial GROUND unit (`unitTypeRevealsRebelBase`) stands in the base system.
 * Ships, TIE fighters, the Death Star and leaders never reveal. Imperial loyalty is part of the official
 * condition but does not exist in core-v1 (DISC-005, A-2) — extension point: add `|| empireHasLoyaltyIn(base)`
 * here when the loyalty slice lands.
 */
export function baseRevealConditionMet(state: CoreGameState): boolean {
  const baseId = state.rebelBase.systemId;
  return state.units.some(
    (u) =>
      u.systemId === baseId &&
      u.owner === 'empire' &&
      unitTypeRevealsRebelBase(typeOf(state, u.typeKey)),
  );
}

/**
 * R-3 timing: `false` while an Imperial activation is running (its movement step is not over; the reveal waits
 * for its `FINISH_ACTIVATION`, whichever system was activated — QD-1); `true` otherwise.
 * Combat slice: the reveal must stay after movement and before combat (activation step 3).
 */
export function revealTimingAllows(state: CoreGameState): boolean {
  return state.activation?.side !== 'empire';
}

/**
 * The state checks, in order: (1) a finished game (`outcome !== null`) is returned unchanged; (2) the base is
 * revealed once if it is hidden, the timing allows it and the condition holds (`BASE_REVEALED`); (3) the
 * Imperial victory is checked (`GAME_OVER` — after a reveal and after every move, as before SWR-008).
 * Returns the same `transition` object when nothing changes.
 */
export function runStateChecks(transition: Transition): Transition {
  if (transition.state.outcome !== null) return transition;
  let checked = transition;
  const { state } = checked;
  if (!state.rebelBase.revealed && revealTimingAllows(state) && baseRevealConditionMet(state)) {
    checked = revealBase(checked);
  }
  return checkEmpireVictory(checked);
}
