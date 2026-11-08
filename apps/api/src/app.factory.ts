import 'reflect-metadata';
import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import type { Clock, IdGenerator } from './common/runtime.tokens';

export interface CreateAppOptions {
  /** SQLite URL; defaults to `process.env.DATABASE_URL`. Tests pass a per-test file (R-5, R-6). */
  databaseUrl?: string;
  logger?: LogLevel[] | false;
  /** Deterministic time source for tests (R-5); defaults to the system clock. */
  clock?: Clock;
  /** Deterministic game ids for tests (R-5); defaults to random UUIDs. */
  idGenerator?: IdGenerator;
}

/**
 * Single app factory for `main.ts` and integration tests. Returns the app WITHOUT `listen`
 * (tests call `init()`). Global prefix `/api`; global ApiExceptionFilter gives every non-2xx
 * response the unified body `{ ok: false, error }` (R-8). Several apps may be created in turn
 * on the same DB file (TC-API-21).
 */
export async function createApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
  }
  const app = await NestFactory.create(
    AppModule.forRoot({
      databaseUrl,
      clock: options.clock,
      idGenerator: options.idGenerator,
    }),
    { logger: options.logger ?? ['error', 'warn', 'log'] },
  );
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
