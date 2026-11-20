import type {
  AutomationRunSummary,
  AutomationStrategyId,
  ServerGameModule,
  SessionAutomation,
} from '@bga/platform';

/**
 * `SessionResponse.automation` of a stored state (SWR-006 plan-backend §3, Q-11/Q-16): `strategy` is the configured
 * strategy when the session has an automated participant (even if every step fell back to the bot), otherwise
 * `null`; `pending` — an automated move is expected now (the client then calls `POST …/automation/run`).
 */
export function automationEnvelope(
  module: ServerGameModule,
  state: unknown,
  provider: AutomationStrategyId,
): SessionAutomation {
  const automation = module.automation;
  if (!automation || !automation.isAutomated(state)) return { pending: false, strategy: null };
  return { pending: automation.pendingActor(state) !== null, strategy: provider };
}

/** Summary of a request without automated steps (`stopReason: 'none'`). */
export function idleRunSummary(envelope: SessionAutomation): AutomationRunSummary {
  return {
    steps: 0,
    pending: envelope.pending,
    strategy: envelope.strategy,
    fallbacks: 0,
    fallbackReasons: [],
    stopReason: 'none',
  };
}
