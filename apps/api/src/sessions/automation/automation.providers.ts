/** Nest wiring of the automation runner (SWR-006 plan-backend §6.3). */
import { Logger, type Provider } from '@nestjs/common';
import { AiDecisionService } from '../../ai/ai-decision.service';
import { AI_RUNTIME } from '../../ai/ai.tokens';
import type { AiRuntime } from '../../ai/ai.types';
import { APP_CONFIG } from '../../config/app-config.tokens';
import type { AppConfig } from '../../config/env';
import { formatErrorLine } from './automation-log';
import { AutomationRunner } from './automation-runner.service';
import {
  AUTOMATION_TEST_OVERRIDES,
  COMMANDER_STRATEGY,
  type AutomationTestOverrides,
} from './automation.tokens';
import { BotCommanderStrategy, type CommanderStrategy } from './commander-strategy';
import { OpenAiCommanderStrategy } from './openai-commander.strategy';

/** The strategy of `config.aiCommander.provider` (a test override wins). */
export function createCommanderStrategy(
  config: AppConfig,
  overrides: AutomationTestOverrides,
  decisions: AiDecisionService,
  runtime: AiRuntime,
): CommanderStrategy {
  if (overrides.strategy) return overrides.strategy;
  if (config.aiCommander.provider !== 'openai') return new BotCommanderStrategy();
  const logger = new Logger('Automation');
  return new OpenAiCommanderStrategy({
    decisions,
    modelRole: config.aiCommander.modelRole,
    monotonicNow: runtime.monotonicNow,
    // Review F-5: the line carries the run's sessionId (= `AiUsage.budgetKey`); the strategy does not know the
    // gameId or the step number, so they stay `-` / 0 (the runner's step / run lines of the same session carry them).
    onUnexpectedError: (error, sessionId) =>
      (overrides.logSink ?? ((_level: string, line: string) => logger.warn(line)))(
        'warn',
        formatErrorLine({ sessionId, gameId: '-', step: 0, code: 'STRATEGY_ERROR', error }),
      ),
  });
}

export const AUTOMATION_PROVIDERS: Provider[] = [
  {
    provide: COMMANDER_STRATEGY,
    inject: [APP_CONFIG, AUTOMATION_TEST_OVERRIDES, AiDecisionService, AI_RUNTIME],
    useFactory: createCommanderStrategy,
  },
  AutomationRunner,
];
