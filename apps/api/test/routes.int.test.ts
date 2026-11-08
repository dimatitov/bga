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
  createGame,
  dbSnapshot,
  expectError,
  movable,
  moveEnv,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

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

describe('routes and error bodies', () => {
  let db: TestDb;
  let app: INestApplication;
  let gameId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url);
    gameId = (await createGame(app, EMPIRE_AI)).gameId;
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-API-23 / TC-ARCH-06: the only mutating routes are POST /api/games and POST /api/games/:id/commands', () => {
    const routes = listRoutes(app);
    expect(routes).toEqual([
      'GET /api/games',
      'GET /api/games/:id',
      'GET /api/health',
      'POST /api/games',
      'POST /api/games/:id/commands',
    ]);
    const src = sourceFiles(join(API_ROOT, 'src'));
    for (const file of src) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/@(Put|Patch|Delete|All)\(/);
    }
    // `state` is written only by GamesRepository (insertGame / commitCommand).
    const writers = src.filter((f) =>
      /\.(game|gameEvent)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(writers.map((f) => f.slice(API_ROOT.length))).toEqual(['src/games/games.repository.ts']);
  });

  it.each(['put', 'patch', 'delete'] as const)(
    'TC-API-24: %s /api/games/:id → 404 unified body, state unchanged',
    async (method) => {
      const before = await dbSnapshot(app, gameId);
      const res = await api(app)[method](`/api/games/${gameId}`).send({ version: 99 });
      expectError(res, 404, 'NOT_FOUND', 'errors.notFound');
      expect(await dbSnapshot(app, gameId)).toEqual(before);
    },
  );

  it('TC-API-24: unknown route → 404 unified body', async () => {
    const res = await api(app).get('/api/nope');
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' },
    });
    expect(res.status).toBe(404);
  });

  it('TC-API-25: 400/404/409/422 bodies carry only the contract error', async () => {
    const m = movable('empire');
    const responses = [
      await postCommand(app, gameId, { bad: true }),
      await postCommand(app, 'missing', {}),
      await postCommand(app, gameId, moveEnv('empire', 9, [m.pieceId], m.from, m.adjacent)),
      await postCommand(app, gameId, moveEnv('empire', 1, [m.pieceId], m.from, m.nonAdjacent)),
    ];
    expect(responses.map((r) => r.status)).toEqual([400, 404, 409, 422]);
    for (const res of responses) {
      expect(Object.keys(res.body).sort()).toEqual(['error', 'ok']);
      expect(res.text).not.toMatch(/stack|prisma|Invalid `|at .*\.ts:|"pieces"|"state"/i);
      expect(res.text).not.toContain(HIDDEN_REBEL.typeKey);
    }
  });

  it('TC-API-25 (Q-4): corrupted Game.state → 500 INTERNAL without internals', async () => {
    await prismaOf(app).game.update({ where: { id: gameId }, data: { state: '{"broken":' } });
    // GET /api/games skips corrupt rows instead of failing (review #1, games.int.test.ts).
    const list = await api(app).get('/api/games');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    for (const res of [
      await api(app).get(`/api/games/${gameId}`),
      await postCommand(app, gameId, {
        actor: 'empire',
        expectedVersion: 1,
        command: { type: 'ADVANCE_PHASE' },
      }),
    ]) {
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        error: { code: 'INTERNAL', messageKey: 'errors.internal' },
      });
    }
  });

  it('TC-API-25: schema-valid JSON but wrong snapshot shape → 500, not 400', async () => {
    await prismaOf(app).game.update({ where: { id: gameId }, data: { state: '{"id":1}' } });
    const res = await api(app).get(`/api/games/${gameId}`);
    expectError(res, 500, 'INTERNAL', 'errors.internal');
    expect(res.text).not.toMatch(/issues|invalid_type|expected/i);
  });
});
