import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_ROOT } from './global-setup';
import {
  EMPIRE_AI,
  HIDDEN_REBEL,
  SEEDED,
  advanceEnv,
  createSeededDb,
  dbSnapshot,
  expectError,
  movableIn,
  moveEnv,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, startApp, stopApp, type TestDb } from './support/test-app';

function joinPath(...parts: string[]): string {
  return (
    '/' +
    parts
      .flatMap((p) => p.split('/'))
      .filter(Boolean)
      .join('/')
  );
}

/** All routes registered by controllers, read from Nest metadata (no test-only code in src). */
function listRoutes(app: INestApplication): string[] {
  const routes: string[] = [];
  for (const moduleRef of app.get(ModulesContainer).values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!ctrl) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (method === undefined || path === undefined) continue;
        routes.push(`${RequestMethod[method]} ${joinPath('api', base, path)}`);
      }
    }
  }
  return routes.sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * SWR-005 W6a (Q-1): the error bodies are provoked with mock-v1 commands, so the session is the seeded
 * SWR-004 row `empireAi` (the DB holds all three seeded rows).
 */
const ROW = SEEDED.empireAi;
const SEEDED_IDS = Object.values(SEEDED).map((s) => s.id);

describe('routes and error bodies', () => {
  let db: TestDb;
  let app: INestApplication;
  const sessionId = ROW.id;
  const m = movableIn(ROW, 'empire');

  beforeEach(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-SES-15 / TC-ARCH-03: routes are exactly the spec table; mutating only POST /api/sessions(/:id/commands)', () => {
    const routes = listRoutes(app);
    expect(routes).toEqual([
      'GET /api/health',
      'GET /api/sessions',
      'GET /api/sessions/:sessionId',
      'POST /api/sessions',
      'POST /api/sessions/:sessionId/commands',
    ]);
    const src = sourceFiles(join(API_ROOT, 'src'));
    for (const file of src) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/@(Put|Patch|Delete|All)\(/);
    }
    // Session / SessionEvent are written only by SessionsRepository (insert / commit).
    const prismaWrite =
      /\.(session|sessionEvent)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const writers = src.filter((f) => prismaWrite.test(readFileSync(f, 'utf8')));
    expect(writers.map((f) => f.slice(API_ROOT.length))).toEqual([
      'src/sessions/sessions.repository.ts',
    ]);
    // Raw SQL is not used anywhere in src.
    for (const file of src) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\$(executeRaw|queryRaw)/);
    }
  });

  it.each(['put', 'patch', 'delete'] as const)(
    'TC-API-24: %s /api/sessions/:id → 404 unified body, state unchanged',
    async (method) => {
      const before = await dbSnapshot(app, sessionId);
      const res = await api(app)[method](`/api/sessions/${sessionId}`).send({ version: 99 });
      expectError(res, 404, 'NOT_FOUND', 'errors.notFound');
      expect(await dbSnapshot(app, sessionId)).toEqual(before);
    },
  );

  it('TC-SES-14: the SWR-002 /api/games* routes are gone → 404 unified body, nothing written', async () => {
    const before = await dbSnapshot(app, sessionId);
    const responses = [
      await api(app).get('/api/games'),
      await api(app).post('/api/games').send(EMPIRE_AI),
      await api(app).get(`/api/games/${sessionId}`),
      await api(app)
        .post(`/api/games/${sessionId}/commands`)
        .send(moveEnv('empire', ROW.version, [m.pieceId], m.from, m.adjacent)),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' },
      });
    }
    expect(await dbSnapshot(app, sessionId)).toEqual(before);
    expect(await prismaOf(app).session.count()).toBe(SEEDED_IDS.length);
  });

  it('TC-API-24: unknown route → 404 unified body', async () => {
    const res = await api(app).get('/api/nope');
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' },
    });
    expect(res.status).toBe(404);
  });

  it('TC-API-25: 400/404/409/422 bodies carry only the contract error', async () => {
    const responses = [
      await postCommand(app, sessionId, { bad: true }),
      await postCommand(app, 'missing', {}),
      await postCommand(app, sessionId, moveEnv('empire', 9, [m.pieceId], m.from, m.adjacent)),
      await postCommand(
        app,
        sessionId,
        moveEnv('empire', ROW.version, [m.pieceId], m.from, m.nonAdjacent),
      ),
    ];
    expect(responses.map((r) => r.status)).toEqual([400, 404, 409, 422]);
    for (const res of responses) {
      expect(Object.keys(res.body).sort()).toEqual(['error', 'ok']);
      expect(res.text).not.toMatch(/stack|prisma|Invalid `|at .*\.ts:|"pieces"|"state"/i);
      expect(res.text).not.toContain(HIDDEN_REBEL.typeKey);
    }
  });

  it('TC-API-25 / TC-SES-16: corrupted Session.state → 500 INTERNAL without internals', async () => {
    await prismaOf(app).session.update({
      where: { id: sessionId },
      data: { state: '{"broken":' },
    });
    // GET /api/sessions skips corrupt rows instead of failing (review #1, sessions.int.test.ts).
    const list = await api(app).get('/api/sessions');
    expect(list.status).toBe(200);
    expect(list.body.map((s: { sessionId: string }) => s.sessionId).sort()).toEqual(
      SEEDED_IDS.filter((id) => id !== sessionId).sort(),
    );
    for (const res of [
      await api(app).get(`/api/sessions/${sessionId}`),
      await postCommand(app, sessionId, advanceEnv('empire', ROW.version)),
    ]) {
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        error: { code: 'INTERNAL', messageKey: 'errors.internal' },
      });
    }
  });

  it('TC-API-25: schema-valid JSON but wrong snapshot shape → 500, not 400', async () => {
    await prismaOf(app).session.update({ where: { id: sessionId }, data: { state: '{"id":1}' } });
    const res = await api(app).get(`/api/sessions/${sessionId}`);
    expectError(res, 500, 'INTERNAL', 'errors.internal');
    expect(res.text).not.toMatch(/issues|invalid_type|expected/i);
  });
});
