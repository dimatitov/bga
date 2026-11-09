import 'reflect-metadata';
import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { GameDefinition, ServerGameModule } from '@bga/platform';
import type { AiTestOverrides } from './ai/ai.types';
import { AppModule, isDevRoutesEnabled } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import type { Clock, IdGenerator } from './common/runtime.tokens';
import type { AppConfig } from './config/env';
import { DEV_AI_PATH, devAiBodyGate } from './dev/ai/dev-ai-body.middleware';
import { GAME_DEFINITIONS } from './game-registry/definitions';
import { SERVER_GAME_MODULES } from './game-registry/registry';

export interface CreateAppOptions {
  /**
   * Validated configuration (SWR-005B, AC-01): `main.ts` passes `loadAppConfig()`, tests pass `testConfig()`.
   * `createApp` never reads the environment or `.env`; the SQLite URL is `config.databaseUrl` (R-5, R-6).
   */
  config: AppConfig;
  logger?: LogLevel[] | false;
  /** Deterministic time source for tests (R-5); defaults to the system clock. */
  clock?: Clock;
  /** Deterministic session ids for tests (R-5); defaults to random UUIDs. */
  idGenerator?: IdGenerator;
  /** Server game modules (TR-3); defaults to `SERVER_GAME_MODULES`. Tests add a fake game here. */
  gameModules?: readonly ServerGameModule[];
  /** Catalogue definitions incl. coming_soon (TR-3); defaults to `GAME_DEFINITIONS`. */
  gameDefinitions?: readonly GameDefinition[];
  /**
   * Test-only AI overrides (SWR-005B §5.9: fake fetch for the real OpenAI SDK, mock failure script, clocks, log sink,
   * dev rate limits). Refused with `nodeEnv: 'production'`.
   */
  ai?: AiTestOverrides;
}

/** `createApp` was given test-only options under `nodeEnv: 'production'`. */
export class ProductionOverridesError extends Error {
  constructor() {
    super('AI test overrides are not allowed in production');
    this.name = 'ProductionOverridesError';
  }
}

/**
 * Single app factory for `main.ts` and integration tests. Returns the app WITHOUT `listen`
 * (tests call `init()`). Global prefix `/api`; global ApiExceptionFilter gives every non-2xx
 * response the unified body `{ ok: false, error }` (R-8). Several apps may be created in turn
 * on the same DB file (TC-API-21). An inconsistent game registry makes it throw (validateRegistry).
 */
export async function createApp(options: CreateAppOptions): Promise<INestApplication> {
  if (options.config.nodeEnv === 'production' && options.ai !== undefined) {
    throw new ProductionOverridesError();
  }
  const app = await NestFactory.create(
    AppModule.forRoot({
      config: options.config,
      clock: options.clock,
      idGenerator: options.idGenerator,
      gameModules: options.gameModules ?? SERVER_GAME_MODULES,
      gameDefinitions: options.gameDefinitions ?? GAME_DEFINITIONS,
      ai: options.ai,
    }),
    { logger: options.logger ?? ['error', 'warn', 'log'] },
  );
  // Dev AI routes: loopback guard + 8 KiB body reader BEFORE the global body parsers (non-production only).
  if (isDevRoutesEnabled(options.config)) app.use(DEV_AI_PATH, devAiBodyGate());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
