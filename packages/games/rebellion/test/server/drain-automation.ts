/**
 * Test stand-in for the server automation runner (SWR-006 plan-backend §9.1): while `pendingActor` is set,
 * `decisionPoint` → choose a candidate id (default: the bot's own `fallbackCandidateId`) → `applyCandidate`.
 * Every decision point is validated with the platform schema (as the runner does, Q-9) and every resulting
 * state with the full stored-state schema. No I/O, no clock: time only from `now`.
 */
import {
  AutomationDecisionPointSchema,
  type AutomationDecisionPoint,
  type ServerGameModule,
} from '@bga/platform';
import { GameStateSchema, type GameEvent, type GameState } from '../../src/schema';
import { createRebellionServerModule } from '../../src/server';
import { chooseAutoCommand } from '../../src/ai';

/** The module with the SWR-005 auto-pass policy (AM-BE-6) — golden games stay byte-identical. */
export const passModule: ServerGameModule = createRebellionServerModule({
  automation: { policy: chooseAutoCommand },
});

export interface DrainOptions {
  /** Picks the candidate id; default — `point.fallbackCandidateId`. */
  choose?: (point: AutomationDecisionPoint, step: number) => string;
  /** Upper bound of automated steps (default 256); exceeding it throws. */
  maxSteps?: number;
  /** Called with every decision point (after validation), before the candidate is applied. */
  onPoint?: (point: AutomationDecisionPoint, state: GameState) => void;
}

export interface Drained<S extends GameState = GameState> {
  state: S;
  /** Events of the automated steps, in order. */
  events: GameEvent[];
  steps: number;
}

export function drain<S extends GameState>(
  module: ServerGameModule,
  state: S,
  now: string,
  options: DrainOptions = {},
): Drained<S> {
  const automation = module.automation;
  if (!automation) throw new Error('drain: the module has no automation');
  const maxSteps = options.maxSteps ?? 256;
  const events: GameEvent[] = [];
  let current: GameState = state;
  let steps = 0;
  while (automation.pendingActor(current) !== null) {
    if (steps >= maxSteps) throw new Error(`drain: more than ${maxSteps} automated steps`);
    const point = AutomationDecisionPointSchema.parse(automation.decisionPoint(current));
    options.onPoint?.(point, current);
    const id = options.choose ? options.choose(point, steps) : point.fallbackCandidateId;
    const result = automation.applyCandidate(current, id, { now });
    if (!result.ok) {
      throw new Error(`drain: step ${steps} rejected (${result.error.messageKey})`);
    }
    current = GameStateSchema.parse(JSON.parse(JSON.stringify(result.state)));
    events.push(...(result.events as GameEvent[]));
    steps += 1;
  }
  return { state: current as S, events, steps };
}
