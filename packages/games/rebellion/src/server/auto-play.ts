/**
 * Server auto-play of the AI side in a `core-v1` AI game (SWR-005 BD-5, plan-backend §4, spec "AI авто-пас").
 * While the game is not over and the AI side is active: the policy receives ONLY `toSideView(state, aiSide)`
 * → its command goes through the full engine pipeline (`applyCommand`, `ctx.origin = 'auto'`, so the event
 * carries `payload.auto = true` and `actor = <AI side>`). Every engine command is `version + 1` (Q-19).
 * Everything happens inside one `module.applyCommand` / `createInitialState` call, i.e. one commit.
 *
 * A policy without a move, an engine rejection of the AI move or more than `MAX_AUTO_STEPS` steps is a
 * server fault: it throws (→ 500, nothing written, Q-27). Messages never carry state data.
 * Pure and deterministic (time only from `options.now`); the input state is never mutated.
 */
import { chooseAutoCommand, type AutoPolicy } from '../ai';
import { applyCommand, toSideView } from '../rules';
import type { CoreGameState, Faction, GameEvent } from '../schema';

/** Upper bound of automatic moves in one call (the auto-pass policy needs at most 2). */
export const MAX_AUTO_STEPS = 16;

export interface AutoPlayOptions {
  /** ISO-8601 timestamp for the automatic moves' events. */
  now: string;
  /** Replacement policy — tests only (TC-AI-12); default: `chooseAutoCommand` (auto-pass-v1). */
  policy?: AutoPolicy;
  /** Step limit — tests only (TC-AI-09); default `MAX_AUTO_STEPS`. */
  maxSteps?: number;
}

export interface AutoPlayResult {
  state: CoreGameState;
  /** Events of the automatic moves, in order (empty when the AI had nothing to do). */
  events: GameEvent[];
}

/** The AI side of an AI game; `null` in a hot-seat game. */
export function aiSideOf(state: CoreGameState): Faction | null {
  return state.settings.opponentType === 'ai' ? state.settings.opponentFaction : null;
}

export function runAutoPlay(state: CoreGameState, options: AutoPlayOptions): AutoPlayResult {
  const aiSide = aiSideOf(state);
  const policy = options.policy ?? chooseAutoCommand;
  const maxSteps = options.maxSteps ?? MAX_AUTO_STEPS;
  const events: GameEvent[] = [];
  let current = state;

  for (let step = 0; ; step += 1) {
    if (aiSide === null || current.outcome !== null || current.activeSide !== aiSide) {
      return { state: current, events };
    }
    if (step >= maxSteps) {
      throw new Error(`auto-play: more than ${maxSteps} automatic moves`);
    }
    const command = policy(toSideView(current, aiSide));
    if (command === null) throw new Error('auto-play: the AI policy returned no move');
    const result = applyCommand(
      current,
      { actor: aiSide, expectedVersion: current.version, command },
      { now: options.now, origin: 'auto' },
    );
    if (!result.ok) {
      throw new Error(`auto-play: the engine rejected the AI move (${result.error.code})`);
    }
    current = result.state;
    events.push(...result.events);
  }
}
