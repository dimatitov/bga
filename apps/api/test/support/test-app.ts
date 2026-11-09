import { randomUUID } from 'node:crypto';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, type CreateAppOptions } from '../../src/app.factory';
import { TEMPLATE_DB, TMP_DIR } from '../global-setup';
import { testConfig, type TestConfigOverrides } from './test-config';

export interface TestDb {
  file: string;
  url: string;
}

/** Fresh migrated SQLite file per test (copy of the template made by global-setup). */
export function createTestDb(): TestDb {
  const file = join(TMP_DIR, `test-${randomUUID()}.db`);
  copyFileSync(TEMPLATE_DB, file);
  return { file, url: `file:${file}` };
}

export function removeTestDb(db: TestDb): void {
  for (const suffix of ['', '-journal']) rmSync(`${db.file}${suffix}`, { force: true });
}

export type StartAppOptions = Omit<CreateAppOptions, 'config'> & {
  /** Overrides of `testConfig()` (never read from `process.env` / `.env`). */
  config?: Omit<TestConfigOverrides, 'databaseUrl'>;
};

/** Real Nest app (same factory as main.ts), initialised but not listening. */
export async function startApp(
  databaseUrl: string,
  options: StartAppOptions = {},
): Promise<INestApplication> {
  const { config, ...rest } = options;
  const app = await createApp({
    logger: ['error'],
    ...rest,
    config: testConfig({ ...config, databaseUrl }),
  });
  await app.init();
  return app;
}

/** Closes the app; removes the DB file only when `db` is given (TC-API-21 keeps the file). */
export async function stopApp(app: INestApplication, db?: TestDb): Promise<void> {
  await app.close();
  if (db) removeTestDb(db);
}

/** supertest agent bound to the app's HTTP server. */
export function api(app: INestApplication) {
  return request(app.getHttpServer());
}
