import { describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  SEEDED,
  advanceEnv,
  createRebellionSession,
  createSeededDb,
  movableIn,
  moveEnv,
  playerView,
  postCommand,
} from './support/fixtures';
import { api, createTestDb, removeTestDb, startApp, stopApp } from './support/test-app';

describe('TC-API-21: state survives an app restart on the same DB file', () => {
  /** SWR-005 W6a (Q-1): the mock-v1 moves run on the seeded SWR-004 row `empireAi`. */
  it('app#2 returns the same view as app#1 left it (seeded mock-v1 row after a move and ADVANCE_PHASE)', async () => {
    const db = await createSeededDb();
    const row = SEEDED.empireAi;
    const sessionId = row.id;
    const v0 = row.version;
    try {
      const app1 = await startApp(db.url);
      const m = movableIn(row, 'empire');
      expect(
        (await postCommand(app1, sessionId, moveEnv('empire', v0, [m.pieceId], m.from, m.adjacent)))
          .status,
      ).toBe(200);
      const last = await postCommand(app1, sessionId, advanceEnv('empire', v0 + 1));
      expect(last.status).toBe(200);
      const remembered = playerView(last.body.view);
      await stopApp(app1); // keep the file

      const app2 = await startApp(db.url);
      try {
        const res = await api(app2).get(`/api/sessions/${sessionId}`);
        expect(res.status).toBe(200);
        expect(res.body.gameId).toBe('star-wars-rebellion');
        expect(playerView(res.body.view)).toEqual(remembered);
        expect(remembered).toMatchObject({ version: v0 + 2, round: 1, phase: 'command' });
        expect(remembered.pieces.find((p) => p.id === m.pieceId)?.systemId).toBe(m.adjacent);
        expect(remembered.log).toHaveLength(v0 + 2);

        const list = await api(app2).get('/api/sessions?gameId=star-wars-rebellion');
        const ids = list.body.map((s: { sessionId: string }) => s.sessionId);
        expect(ids[0]).toBe(sessionId);
        expect([...ids].sort()).toEqual(
          Object.values(SEEDED)
            .map((s) => s.id)
            .sort(),
        );
      } finally {
        await stopApp(app2);
      }
    } finally {
      removeTestDb(db);
    }
  });

  it('a new session: app#2 returns the same response as app#1 (engine-independent)', async () => {
    const db = createTestDb();
    try {
      const app1 = await startApp(db.url);
      const { sessionId } = await createRebellionSession(app1, EMPIRE_AI);
      const remembered = (await api(app1).get(`/api/sessions/${sessionId}`)).body;
      await stopApp(app1);

      const app2 = await startApp(db.url);
      try {
        const res = await api(app2).get(`/api/sessions/${sessionId}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(remembered);
        const list = await api(app2).get('/api/sessions?gameId=star-wars-rebellion');
        expect(list.body.map((s: { sessionId: string }) => s.sessionId)).toEqual([sessionId]);
      } finally {
        await stopApp(app2);
      }
    } finally {
      removeTestDb(db);
    }
  });
});
