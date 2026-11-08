/**
 * Automatic AI move of the `core-v1` slice (SWR-005 PO-3, plan-backend §4): the deterministic policy
 * "pass". Pure, no clock, no randomness, no OpenAI; it imports only `../schema` (ESLint B-6).
 *
 * Invariant: the policy sees ONLY the view of its own side (`toSideView(state, aiSide)`, the same redaction as
 * a player's view — the AI Empire never learns the hidden base) and picks a command from that view's
 * `legalActions`, which the rules computed. The move then goes through the full engine validation (the
 * server's auto-play loop, `src/server/auto-play.ts`).
 */
import type { Command, CorePlayerView, FinishActivationCommand, PassCommand } from '../schema';

/** Identifies the policy (logs/tests); a future AI Commander gets its own id. */
export const AUTO_POLICY_ID = 'auto-pass-v1';

/** What the auto-pass policy can answer with. */
export type AutoCommand = PassCommand | FinishActivationCommand;

/**
 * Signature of an automatic policy: own side's view → a command (validated by the engine anyway) or `null`.
 * The server's auto-play loop accepts a replacement in tests (TC-AI-09/12); a future AI Commander fits it too.
 */
export type AutoPolicy = (view: CorePlayerView) => Command | null;

/**
 * `PASS` if it is legal; otherwise `FINISH_ACTIVATION` if legal (an activation is running); otherwise `null`
 * (not this side's turn / game over) — the caller treats `null` as a server fault.
 */
export function chooseAutoCommand(view: CorePlayerView): AutoCommand | null {
  const types = new Set(view.legalActions.map((action) => action.type));
  if (types.has('PASS')) return { type: 'PASS' };
  if (types.has('FINISH_ACTIVATION')) return { type: 'FINISH_ACTIVATION' };
  return null;
}
