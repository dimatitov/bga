import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  advanceEnv,
  createGame,
  dbSnapshot,
  expectError,
  movable,
  moveEnv,
  postCommand,
} from './support/fixtures';
import { createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

describe('TC-API-20: optimistic concurrency', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    db = createTestDb();
    app = await startApp(db.url);
  });

  afterAll(async () => {
    await stopApp(app, db);
  });

  it('two parallel commands with the same expectedVersion → exactly one 200 and one 409', async () => {
    const { gameId } = await createGame(app, EMPIRE_AI);
    const m = movable('empire');
    const [a, b] = await Promise.all([
      postCommand(app, gameId, moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent)),
      postCommand(app, gameId, advanceEnv('empire', 1)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    const err = expectError(conflict, 409, 'VERSION_CONFLICT');
    expect(err.error.details).toEqual({ currentVersion: 2 });

    const { game, events } = await dbSnapshot(app, gameId);
    expect(game?.version).toBe(2);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('repeated races keep version and event rows consistent', async () => {
    const { gameId } = await createGame(app, EMPIRE_AI);
    for (let v = 1; v <= 5; v++) {
      const results = await Promise.all(
        [0, 1, 2].map(() => postCommand(app, gameId, advanceEnv('empire', v))),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    }
    const { game, events } = await dbSnapshot(app, gameId);
    expect(game?.version).toBe(6);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
