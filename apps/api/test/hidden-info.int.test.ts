import type { INestApplication } from '@nestjs/common';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import {
  PlayerViewPlayerSchema,
  UNKNOWN_TYPE_KEY,
  type MockPlayerView,
} from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPIRE_AI,
  HIDDEN_REBEL,
  R,
  REBEL_BASE_SYSTEM,
  SEEDED,
  advanceEnv,
  createSeededDb,
  movableIn,
  moveEnv,
  seededPieces,
  playerView,
  postCommand,
  prismaOf,
} from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

/** Every response body for an Empire player must hide the base and hidden Rebel typeKeys (A-11). */
function expectNoSecrets(raw: string, view?: MockPlayerView) {
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

  afterEach(async () => {
    await stopApp(app, db);
  });

  describe('new sessions (engine-independent)', () => {
    beforeEach(async () => {
      db = createTestDb();
      app = await startApp(db.url);
    });

    it('TC-API-11 (creation): an Empire player does not get the stored rebel base in the POST / GET response', async () => {
      const created = await api(app).post('/api/sessions').send({ gameId: R, setup: EMPIRE_AI });
      expect(created.status).toBe(201);
      const sessionId: string = created.body.sessionId;
      // The secret really is stored server-side (both engines keep `rebelBase.systemId` in the state).
      const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
      const base = (JSON.parse(row.state) as { rebelBase: { systemId: string } }).rebelBase
        .systemId;
      expect(typeof base).toBe('string');

      const got = await api(app).get(`/api/sessions/${sessionId}`);
      for (const [raw, view] of [
        [created.text, created.body.view],
        [got.text, SessionResponseSchema.parse(got.body).view],
      ] as const) {
        expect(PlayerViewPlayerSchema.parse(view).rebelBase.systemId).toBeNull();
        expect(raw).not.toContain('"state"');
        expect(raw).not.toContain(`"rebelBase":{"systemId":"${base}"`);
      }
    });
  });

  /** SWR-005 W6a (Q-1): mock-v1 projections are checked on the seeded SWR-004 rows; core-v1 — W6b (TC-H-*). */
  describe('seeded mock-v1 rows', () => {
    beforeEach(async () => {
      db = await createSeededDb();
      app = await startApp(db.url);
    });

    it('TC-API-11: empire never sees the rebel base or hidden typeKeys in any response', async () => {
      const row = SEEDED.empireAi;
      const sessionId = row.id;

      // The secret really is stored server-side.
      const stored = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
      expect(JSON.parse(stored.state).rebelBase).toEqual({
        systemId: REBEL_BASE_SYSTEM,
        revealed: false,
      });
      expect(stored.state).toContain(HIDDEN_REBEL.typeKey);

      const got = await api(app).get(`/api/sessions/${sessionId}`);
      expectNoSecrets(got.text, playerView(SessionResponseSchema.parse(got.body).view));

      const m = movableIn(row, 'empire');
      const moved = await postCommand(
        app,
        sessionId,
        moveEnv('empire', row.version, [m.pieceId], m.from, m.adjacent),
      );
      expect(moved.status).toBe(200);
      expectNoSecrets(moved.text, playerView(moved.body.view));

      const advanced = await postCommand(app, sessionId, advanceEnv('empire', row.version + 1));
      expect(advanced.status).toBe(200);
      expectNoSecrets(advanced.text, playerView(advanced.body.view));

      // TC-SES-13: session summaries (`details`) carry nothing hidden, with and without the gameId filter.
      for (const url of ['/api/sessions', `/api/sessions?gameId=${R}`]) {
        const list = await api(app).get(url);
        expect(list.status).toBe(200);
        expect(ListSessionsResponseSchema.parse(list.body)).toHaveLength(3);
        expectNoSecrets(list.text);
        expect(list.text).not.toContain('rebelBase');
        expect(list.text).not.toContain(REBEL_BASE_SYSTEM);
        expect(list.text).not.toContain('"state"');
      }
    });

    it('TC-API-12: a rebellion player sees the real base system', async () => {
      const res = await api(app).get(`/api/sessions/${SEEDED.rebelsAi.id}`);
      expect(res.status).toBe(200);
      const view = playerView(res.body.view);
      expect(view.viewer).toBe('rebels');
      expect(view.rebelBase.systemId).toBe(REBEL_BASE_SYSTEM);
      expect(view.pieces.find((p) => p.id === HIDDEN_REBEL.id)?.typeKey).toBe(HIDDEN_REBEL.typeKey);
    });

    it('TC-API-13: hidden rebel piece — id/systemId visible, typeKey "unknown" for empire', async () => {
      const row = SEEDED.empireAi;
      const res = await api(app).get(`/api/sessions/${row.id}`);
      const view = playerView(res.body.view);
      const piece = view.pieces.find((p) => p.id === HIDDEN_REBEL.id);
      expect(piece).toMatchObject({
        id: HIDDEN_REBEL.id,
        systemId: seededPieces(row).find((p) => p.id === HIDDEN_REBEL.id)?.systemId,
        owner: 'rebels',
        hidden: true,
        typeKey: UNKNOWN_TYPE_KEY,
      });
      expect(res.text).not.toContain(HIDDEN_REBEL.typeKey);
    });
  });
});
