/**
 * R-8 base reveal and R-9 victories (checked immediately, inside the command that causes them).
 * - Reveal: WHEN and IF the base is revealed is decided only by the central state check (`./state-checks`
 *   `runStateChecks`, SWR-008 DISC-009); this module only performs it (`revealBase`).
 * - Empire wins: the base is revealed, at least one Imperial unit (any) and NO Rebel unit (any, structures
 *   included) in the base system — checked by `runStateChecks` after every accepted command (in particular after
 *   the reveal and after every `MOVE_PIECES` of either side).
 * - Rebels win: the time marker reaches the reputation marker (refresh, `./turn-flow`).
 * The end of the game: `outcome` set, no activation, no handoff, event `GAME_OVER` (no system in it).
 */
import type { CoreGameState, Outcome } from '../../schema';
import type { Transition } from './helpers';

/** R-9 (Empire): revealed base with ≥1 Imperial unit and no Rebel unit in it. */
export function empireCapturedBase(state: CoreGameState): boolean {
  if (!state.rebelBase.revealed) return false;
  const here = state.units.filter((u) => u.systemId === state.rebelBase.systemId);
  return here.some((u) => u.owner === 'empire') && !here.some((u) => u.owner === 'rebels');
}

/** Reveal the base: `revealed = true`, `BASE_REVEALED{systemId}` (public from now on). Called only by `runStateChecks`. */
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

/** End the game if the Empire has captured the base (called by `runStateChecks`). */
export function checkEmpireVictory(transition: Transition): Transition {
  return empireCapturedBase(transition.state)
    ? endGame(transition, { winner: 'empire', reason: 'rebelBaseCaptured' })
    : transition;
}
