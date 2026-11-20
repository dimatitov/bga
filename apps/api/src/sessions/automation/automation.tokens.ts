/** DI tokens and test overrides of the automation runner (SWR-006 plan-backend §6.3). */
import type { AutomationLogSink } from './automation-log';
import type { CommanderStrategy } from './commander-strategy';

/** The `CommanderStrategy` of this process (from `config.aiCommander.provider`, or a test override). */
export const COMMANDER_STRATEGY = Symbol('COMMANDER_STRATEGY');

/** Test-only `AutomationTestOverrides` given to `createApp({ automation })` (`{}` in normal runs). */
export const AUTOMATION_TEST_OVERRIDES = Symbol('AUTOMATION_TEST_OVERRIDES');

/**
 * Test-only overrides of the automation runner. Set only from test code via `createApp({ automation })`;
 * `createApp` refuses them when `nodeEnv === 'production'` (like the `ai` overrides).
 */
export interface AutomationTestOverrides {
  /** Replaces the configured strategy (gated / throwing / scripted strategies of runner tests). */
  strategy?: CommanderStrategy;
  /** Receives every runner log line (allow-listed, see automation-log.ts). */
  logSink?: AutomationLogSink;
}
