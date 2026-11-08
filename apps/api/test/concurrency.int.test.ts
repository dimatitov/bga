import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SEEDED,
  advanceEnv,
  createSeededDb,
  dbSnapshot,
  expectError,
  movableIn,
  moveEnv,
  postCommand,
} from './support/fixtures';
import { startApp, stopApp, type TestDb } from './support/test-app';

/** SWR-005 W6a (Q-1): races on mock-v1 commands run on the seeded SWR-004 AI rows (one row per test). */
describe('TC-API-20: optimistic concurrency (seeded mock-v1 rows)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    db = await createSeededDb();
    app = await startApp(db.url);
  });

  afterAll(async () => {
    await stopApp(app, db);
  });

  it('two parallel commands with the same expectedVersion → exactly one 200 and one 409', async () => {
    const row = SEEDED.empireAi;
    const v0 = row.version;
    const m = movableIn(row, 'empire');
    const [a, b] = await Promise.all([
      postCommand(app, row.id, moveEnv('empire', v0, [m.pieceId], m.from, m.adjacent)),
      postCommand(app, row.id, advanceEnv('empire', v0)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    const err = expectError(conflict, 409, 'VERSION_CONFLICT');
    expect(err.error.details).toEqual({ currentVersion: v0 + 1 });

    const { session, events } = await dbSnapshot(app, row.id);
    expect(session?.version).toBe(v0 + 1);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: v0 + 1 }, (_, i) => i + 1));
  });

  it('repeated races keep version and event rows consistent', async () => {
    const row = SEEDED.rebelsAi;
    const v0 = row.version;
    for (let v = v0; v < v0 + 5; v++) {
      const results = await Promise.all(
        [0, 1, 2].map(() => postCommand(app, row.id, advanceEnv('rebels', v))),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    }
    const { session, events } = await dbSnapshot(app, row.id);
    expect(session?.version).toBe(v0 + 5);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: v0 + 5 }, (_, i) => i + 1));
  });
});
