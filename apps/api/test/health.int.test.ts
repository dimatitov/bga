import type { INestApplication } from '@nestjs/common';
import { HealthResponseSchema } from '@swr/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

describe('GET /api/health (TC-API-01)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    db = createTestDb();
    app = await startApp(db.url);
  });

  afterAll(async () => {
    await stopApp(app, db);
  });

  it('returns 200 { status: "ok" }', async () => {
    const res = await api(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('serves routes only under /api', async () => {
    const res = await api(app).get('/health');
    expect(res.status).toBe(404);
  });
});
