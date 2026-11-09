/**
 * Nest wiring of the framework-free AI layer (SWR-005B, plan-backend §1, BD-4). Every provider is a `useFactory`
 * over plain classes. The OpenAI client is created lazily on first use and only when `openai.enabled`; under
 * `nodeEnv: 'test'` an enabled config without a fake fetch is refused here (a test can never reach OpenAI).
 * Log lines (allow-listed, ai-log.ts) go to Nest `Logger('AI')` unless a test sink is given.
 */
import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '../config/env';
import { PrismaService } from '../persistence/prisma.service';
import { AiDecisionService } from './ai-decision.service';
import { AiStatusService } from './ai-status.service';
import { AI_RUNTIME, AI_TEST_OVERRIDES } from './ai.tokens';
import { aiRuntime, type AiRuntime, type AiTestOverrides } from './ai.types';
import { AiUsageRepository } from './ai-usage.repository';
import { BudgetService } from './budget.service';
import { ModelAvailabilityService } from './model-availability.service';
import { MockAIProvider } from './providers/mock.provider';
import { lazyOpenAIClient, type OpenAIClient } from './providers/openai-client';
import { OpenAIProvider } from './providers/openai.provider';

export interface AiModuleOptions {
  config: AppConfig;
  /** Test-only overrides (`createApp({ ai })`); `{}` otherwise. */
  overrides?: AiTestOverrides;
}

/** Thrown at wiring time for a configuration that could reach the network from a test process. */
export class AiModuleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiModuleConfigError';
  }
}

/** Plain construction of the AI services (shared by the Nest module and usable without Nest). */
export function buildAiServices(
  config: AppConfig,
  overrides: AiTestOverrides,
  prisma: PrismaService,
  runtime: AiRuntime,
): { decisions: AiDecisionService; status: AiStatusService; usage: AiUsageRepository } {
  const { openai } = config;
  const usage = new AiUsageRepository(prisma);
  const budget = new BudgetService(usage);
  const mock = new MockAIProvider({
    runtime,
    maxRetries: openai.maxRetries,
    script: overrides.mockScript,
  });
  let availability: ModelAvailabilityService | null = null;
  let openaiProvider: OpenAIProvider | null = null;
  if (openai.enabled) {
    const client: () => OpenAIClient = lazyOpenAIClient({
      openai,
      nodeEnv: config.nodeEnv,
      fetch: overrides.openaiFetch,
    });
    availability = new ModelAvailabilityService({
      client,
      monotonicNow: overrides.monotonicNow,
    });
    const models = availability;
    openaiProvider = new OpenAIProvider({
      openai,
      client,
      runtime,
      onModelNotFound: (model) => models.invalidate(model),
    });
  }
  const decisions = new AiDecisionService({
    openai,
    mock,
    openaiProvider,
    availability,
    budget,
    usage,
    runtime,
  });
  const status = new AiStatusService({ openai, availability, decisions });
  return { decisions, status, usage };
}

const AI_SERVICES = Symbol('AI_SERVICES');

@Module({})
export class AiModule {
  static forRoot(options: AiModuleOptions): DynamicModule {
    const { config } = options;
    const overrides = options.overrides ?? {};
    if (config.nodeEnv === 'test' && config.openai.enabled && !overrides.openaiFetch) {
      throw new AiModuleConfigError(
        'OpenAI is enabled under NODE_ENV=test without a fake fetch (ai.openaiFetch)',
      );
    }
    return {
      module: AiModule,
      global: true,
      providers: [
        { provide: AI_TEST_OVERRIDES, useValue: overrides },
        {
          provide: AI_RUNTIME,
          useFactory: (): AiRuntime => {
            const logger = new Logger('AI');
            return aiRuntime(overrides, (line) => logger.log(line));
          },
        },
        {
          provide: AI_SERVICES,
          inject: [PrismaService, AI_RUNTIME],
          useFactory: (prisma: PrismaService, runtime: AiRuntime) =>
            buildAiServices(config, overrides, prisma, runtime),
        },
        {
          provide: AiDecisionService,
          inject: [AI_SERVICES],
          useFactory: (s: ReturnType<typeof buildAiServices>) => s.decisions,
        },
        {
          provide: AiStatusService,
          inject: [AI_SERVICES],
          useFactory: (s: ReturnType<typeof buildAiServices>) => s.status,
        },
        {
          provide: AiUsageRepository,
          inject: [AI_SERVICES],
          useFactory: (s: ReturnType<typeof buildAiServices>) => s.usage,
        },
      ],
      exports: [
        AI_TEST_OVERRIDES,
        AI_RUNTIME,
        AiDecisionService,
        AiStatusService,
        AiUsageRepository,
      ],
    };
  }
}
