/**
 * R-8 base reveal and R-9 victories (checked immediately, inside the command that causes them).
 * - Reveal: at the end of an Imperial activation (`FINISH_ACTIVATION`) of the base system, if an Imperial
 *   GROUND unit stands there (`unitTypeRevealsRebelBase`); ships, the Death Star and leaders never reveal.
 * - Empire wins: the base is revealed, at least one Imperial unit (any) and NO Rebel unit (any, structures
 *   included) in the base system — checked after the reveal and after every `MOVE_PIECES` of either side.
 * - Rebels win: the time marker reaches the reputation marker (refresh, `./turn-flow`).
 * The end of the game: `outcome` set, no activation, no handoff, event `GAME_OVER` (no system in it).
 */
import { unitTypeRevealsRebelBase, type CoreGameState, type Outcome } from '../../schema';
import { typeOf, type Transition } from './helpers';

/** R-8: would the base be revealed now at the end of this Imperial activation? */
export function revealsBaseNow(state: CoreGameState, activatedSystemId: string): boolean {
  const baseId = state.rebelBase.systemId;
  if (state.rebelBase.revealed || activatedSystemId !== baseId) return false;
  return state.units.some(
    (u) =>
      u.systemId === baseId &&
      u.owner === 'empire' &&
      unitTypeRevealsRebelBase(typeOf(state, u.typeKey)),
  );
}

/** R-9 (Empire): revealed base with ≥1 Imperial unit and no Rebel unit in it. */
export function empireCapturedBase(state: CoreGameState): boolean {
  if (!state.rebelBase.revealed) return false;
  const here = state.units.filter((u) => u.systemId === state.rebelBase.systemId);
  return here.some((u) => u.owner === 'empire') && !here.some((u) => u.owner === 'rebels');
}

/** Reveal the base: `revealed = true`, `BASE_REVEALED{systemId}` (public from now on). */
export function revealBase(transition: Transition): Transition {
  const { state } = transition;
  return {
    state: { ...state, rebelBase: { ...state.rebelBase, revealed: true } },
    drafts: [
      ...transition.drafts,
      { type: 'BASE_REVEALED', actor: 'system', payload: { systemId: state.rebelBase.systemId } },
    ],
  };
}

/** End the game: `outcome`, no activation, no handoff (Q-14), `GAME_OVER`. `activeSide` is unchanged. */
export function endGame(transition: Transition, outcome: Outcome): Transition {
  return {
    state: { ...transition.state, outcome, activation: null, handoffPending: false },
    drafts: [...transition.drafts, { type: 'GAME_OVER', actor: 'system', payload: { ...outcome } }],
  };
}

/** After a move or a reveal: end the game if the Empire has captured the base. */
export function checkEmpireVictory(transition: Transition): Transition {
  return empireCapturedBase(transition.state)
    ? endGame(transition, { winner: 'empire', reason: 'rebelBaseCaptured' })
    : transition;
}
