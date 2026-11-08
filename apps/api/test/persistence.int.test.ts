import { PlayerViewSchema } from '@swr/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  advanceEnv,
  createGame,
  movable,
  moveEnv,
  postCommand,
} from './support/fixtures';
import { api, createTestDb, removeTestDb, startApp, stopApp } from './support/test-app';

describe('TC-API-21: state survives an app restart on the same DB file', () => {
  it('app#2 returns the same view as app#1 left it', async () => {
    const db = createTestDb();
    try {
      const app1 = await startApp(db.url);
      const { gameId } = await createGame(app1, EMPIRE_AI);
      const m = movable('empire');
      expect(
        (await postCommand(app1, gameId, moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent)))
          .status,
      ).toBe(200);
      const last = await postCommand(app1, gameId, advanceEnv('empire', 2));
      expect(last.status).toBe(200);
      const remembered = PlayerViewSchema.parse(last.body.view);
      await stopApp(app1); // keep the file

      const app2 = await startApp(db.url);
      try {
        const res = await api(app2).get(`/api/games/${gameId}`);
        expect(res.status).toBe(200);
        expect(PlayerViewSchema.parse(res.body)).toEqual(remembered);
        expect(remembered).toMatchObject({ version: 3, round: 1, phase: 'command' });
        expect(remembered.pieces.find((p) => p.id === m.pieceId)?.systemId).toBe(m.adjacent);
        expect(remembered.log).toHaveLength(3);

        const list = await api(app2).get('/api/games');
        expect(list.body.map((s: { gameId: string }) => s.gameId)).toContain(gameId);
      } finally {
        await stopApp(app2);
      }
    } finally {
      removeTestDb(db);
    }
  });
});
