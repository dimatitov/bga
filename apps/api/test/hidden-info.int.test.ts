import type { INestApplication } from '@nestjs/common';
import { PlayerViewSchema, UNKNOWN_TYPE_KEY, type PlayerView } from '@swr/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  HIDDEN_REBEL,
  REBELLION_HUMAN,
  REBEL_BASE_SYSTEM,
  advanceEnv,
  createGame,
  movable,
  moveEnv,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

/** Every response body for an Empire player must hide the base and hidden Rebel typeKeys (A-11). */
function expectNoSecrets(raw: string, view?: PlayerView) {
  expect(raw).not.toContain(HIDDEN_REBEL.typeKey);
  expect(raw).not.toContain('"state"');
  expect(raw).not.toMatch(new RegExp(`"rebelBase":\\{"systemId":"${REBEL_BASE_SYSTEM}"`));
  if (view) {
    expect(view.rebelBase.systemId).toBeNull();
    const hidden = view.pieces.find((p) => p.id === HIDDEN_REBEL.id);
    expect(hidden).toBeDefined();
    expect(hidden?.typeKey).toBe(UNKNOWN_TYPE_KEY);
  }
}

describe('hidden information (PlayerView only leaves the server)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('TC-API-11: empire never sees the rebel base or hidden typeKeys in any response', async () => {
    const created = await api(app).post('/api/games').send(EMPIRE_AI);
    expect(created.status).toBe(201);
    expectNoSecrets(created.text, PlayerViewSchema.parse(created.body.view));
    const gameId: string = created.body.gameId;

    // The secret really is stored server-side.
    const row = await prismaOf(app).game.findUnique({ where: { id: gameId } });
    const stored = JSON.parse(row!.state);
    expect(stored.rebelBase).toEqual({ systemId: REBEL_BASE_SYSTEM, revealed: false });
    expect(row!.state).toContain(HIDDEN_REBEL.typeKey);

    const got = await api(app).get(`/api/games/${gameId}`);
    expectNoSecrets(got.text, PlayerViewSchema.parse(got.body));

    const m = movable('empire');
    const moved = await postCommand(
      app,
      gameId,
      moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent),
    );
    expect(moved.status).toBe(200);
    expectNoSecrets(moved.text, PlayerViewSchema.parse(moved.body.view));

    const advanced = await postCommand(app, gameId, advanceEnv('empire', 2));
    expect(advanced.status).toBe(200);
    expectNoSecrets(advanced.text, PlayerViewSchema.parse(advanced.body.view));

    const list = await api(app).get('/api/games');
    expect(list.status).toBe(200);
    expectNoSecrets(list.text);
    expect(list.text).not.toContain('rebelBase');
  });

  it('TC-API-12: a rebellion player sees the real base system', async () => {
    const { gameId } = await createGame(app, REBELLION_HUMAN);
    const res = await api(app).get(`/api/games/${gameId}`);
    expect(res.status).toBe(200);
    const view = PlayerViewSchema.parse(res.body);
    expect(view.rebelBase.systemId).toBe(REBEL_BASE_SYSTEM);
    expect(view.pieces.find((p) => p.id === HIDDEN_REBEL.id)?.typeKey).toBe(HIDDEN_REBEL.typeKey);
  });

  it('TC-API-13: hidden rebel piece — id/systemId visible, typeKey "unknown" for empire', async () => {
    const { gameId } = await createGame(app, EMPIRE_AI);
    const res = await api(app).get(`/api/games/${gameId}`);
    const view = PlayerViewSchema.parse(res.body);
    const piece = view.pieces.find((p) => p.id === HIDDEN_REBEL.id);
    expect(piece).toMatchObject({
      id: HIDDEN_REBEL.id,
      systemId: HIDDEN_REBEL.systemId,
      owner: 'rebellion',
      hidden: true,
      typeKey: UNKNOWN_TYPE_KEY,
    });
    expect(res.text).not.toContain(HIDDEN_REBEL.typeKey);
  });
});
