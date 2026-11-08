import type { INestApplication } from '@nestjs/common';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import { UNKNOWN_TYPE_KEY, type PlayerViewPlayer } from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  HIDDEN_REBEL,
  REBELS_HUMAN,
  R,
  REBEL_BASE_SYSTEM,
  advanceEnv,
  createRebellionSession,
  movable,
  moveEnv,
  playerView,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

/** Every response body for an Empire player must hide the base and hidden Rebel typeKeys (A-11). */
function expectNoSecrets(raw: string, view?: PlayerViewPlayer) {
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
    const created = await api(app).post('/api/sessions').send({ gameId: R, setup: EMPIRE_AI });
    expect(created.status).toBe(201);
    expectNoSecrets(created.text, playerView(created.body.view));
    const sessionId: string = created.body.sessionId;

    // The secret really is stored server-side.
    const row = await prismaOf(app).session.findUnique({ where: { id: sessionId } });
    const stored = JSON.parse(row!.state);
    expect(stored.rebelBase).toEqual({ systemId: REBEL_BASE_SYSTEM, revealed: false });
    expect(row!.state).toContain(HIDDEN_REBEL.typeKey);

    const got = await api(app).get(`/api/sessions/${sessionId}`);
    expectNoSecrets(got.text, playerView(SessionResponseSchema.parse(got.body).view));

    const m = movable('empire');
    const moved = await postCommand(
      app,
      sessionId,
      moveEnv('empire', 1, [m.pieceId], m.from, m.adjacent),
    );
    expect(moved.status).toBe(200);
    expectNoSecrets(moved.text, playerView(moved.body.view));

    const advanced = await postCommand(app, sessionId, advanceEnv('empire', 2));
    expect(advanced.status).toBe(200);
    expectNoSecrets(advanced.text, playerView(advanced.body.view));

    // TC-SES-13: session summaries (`details`) carry nothing hidden, with and without the gameId filter.
    for (const url of ['/api/sessions', `/api/sessions?gameId=${R}`]) {
      const list = await api(app).get(url);
      expect(list.status).toBe(200);
      expect(ListSessionsResponseSchema.parse(list.body)).toHaveLength(1);
      expectNoSecrets(list.text);
      expect(list.text).not.toContain('rebelBase');
      expect(list.text).not.toContain(REBEL_BASE_SYSTEM);
      expect(list.text).not.toContain('"state"');
    }
  });

  it('TC-API-12: a rebellion player sees the real base system', async () => {
    const { sessionId } = await createRebellionSession(app, REBELS_HUMAN);
    const res = await api(app).get(`/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const view = playerView(res.body.view);
    expect(view.rebelBase.systemId).toBe(REBEL_BASE_SYSTEM);
    expect(view.pieces.find((p) => p.id === HIDDEN_REBEL.id)?.typeKey).toBe(HIDDEN_REBEL.typeKey);
  });

  it('TC-API-13: hidden rebel piece — id/systemId visible, typeKey "unknown" for empire', async () => {
    const { sessionId } = await createRebellionSession(app, EMPIRE_AI);
    const res = await api(app).get(`/api/sessions/${sessionId}`);
    const view = playerView(res.body.view);
    const piece = view.pieces.find((p) => p.id === HIDDEN_REBEL.id);
    expect(piece).toMatchObject({
      id: HIDDEN_REBEL.id,
      systemId: HIDDEN_REBEL.systemId,
      owner: 'rebels',
      hidden: true,
      typeKey: UNKNOWN_TYPE_KEY,
    });
    expect(res.text).not.toContain(HIDDEN_REBEL.typeKey);
  });
});
