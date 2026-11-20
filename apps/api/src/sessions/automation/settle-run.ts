/**
 * The non-throwing guard around `AutomationRunner.run` shared by every caller (create, command, `automation/run`;
 * SWR-006 review F-1). The runner is designed never to reject, but its `finish()` (summary schema, log sink) and the
 * game's `pendingActor` can still throw on a programming error. A request whose own write was already committed
 * (a created session, an accepted human command) must never turn into a 500 because of that.
 */
import type { Logger } from '@nestjs/common';
import type {
  AutomationStrategyId,
  ServerGameModule,
  SessionAutomation,
  SessionStatus,
} from '@bga/platform';
import type { AutomationRunner, AutomationRunResult } from './automation-runner.service';
import { automationEnvelope, idleRunSummary } from './session-automation';

/** A run result whose final state is known (the runner's, or the caller's when the runner could not read the row). */
export type SettledRun = AutomationRunResult & {
  final: NonNullable<AutomationRunResult['final']>;
};

/**
 * `automationEnvelope` that never throws. When the game's `isAutomated` / `pendingActor` throws for a game that has
 * automation, the answer is "pending" with the configured strategy (the client may retry `POST …/automation/run`),
 * like the runner's own `pending` rule; a game without automation is `{ pending: false, strategy: null }`.
 */
export function bestEffortEnvelope(
  module: ServerGameModule,
  state: unknown,
  strategyId: AutomationStrategyId,
): SessionAutomation {
  try {
    return automationEnvelope(module, state, strategyId);
  } catch {
    return module.automation
      ? { pending: true, strategy: strategyId }
      : { pending: false, strategy: null };
  }
}

/**
 * Runs the automation of `sessionId` and never rejects. `state` / `status` are the caller's last committed values:
 * they become `final` when the runner could not read the row or failed; the summary then says `error`.
 */
export async function settleRun(
  runner: AutomationRunner,
  logger: Pick<Logger, 'error'>,
  sessionId: string,
  module: ServerGameModule,
  state: unknown,
  status: SessionStatus,
): Promise<SettledRun> {
  try {
    const run = await runner.run(sessionId);
    return { ...run, final: run.final ?? { state, status } };
  } catch {
    logger.error(`sessionId=${sessionId} code=AUTOMATION_ERROR`);
    const envelope = bestEffortEnvelope(module, state, runner.strategyId);
    return {
      final: { state, status },
      events: [],
      summary: { ...idleRunSummary(envelope), stopReason: 'error' },
    };
  }
}
