/**
 * SWR-005 (plan-backend §6.3, AC-11, TC-M-08 / TC-M-09 / TC-M-14): a DB in the SWR-004 shape with the frozen v2
 * rows (`createSwr004Db`) is read through the API on the mock-v1 rules (lazy upcast v2 → v3, Q-30). Reads never
 * write; the first command persists the snapshot as `schemaVersion: 3`, `rulesEngine: 'mock-v1'`, setup v2 kept.
 */
import { PrismaClient } from '@prisma/client';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import {
  GameStateSchema,
  HandoffViewSchema,
  RebellionSessionDetailsSchema,
  StoredRebellionSetupSchema,
} from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  R,
  SEEDED,
  acceptHandoffEnv,
  advanceEnv,
  movableIn,
  moveEnv,
  playerView,
  postCommand,
  seededSettings,
} from './support/fixtures';
import { createSwr004Db, type Swr004Db, type V2SessionFixture } from './support/swr004-db';
import { api, startApp, stopApp } from './support/test-app';

/** Public settings of a stored v2 setup (= the setup without `schemaVersion`). */
function settingsOf(row: V2SessionFixture): Record<string, unknown> {
  const { schemaVersion: _v, ...settings } = row.setup as Record<string, unknown>;
  return settings;
}

/** One mock-v1 command per seeded row (move / ADVANCE_PHASE / ACCEPT_HANDOFF). */
function mockCommandFor(row: V2SessionFixture) {
  if (row.id === SEEDED.hotseat.id) return acceptHandoffEnv('empire', row.version);
  if (row.id === SEEDED.empireAi.id) return advanceEnv('empire', row.version);
  const m = movableIn(row, 'rebels');
  return moveEnv('rebels', row.version, [m.pieceId], m.from, m.adjacent);
}

async function storedRows(url: string) {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    return {
      sessions: await client.session.findMany({ orderBy: { id: 'asc' } }),
      events: await client.sessionEvent.findMany({
        orderBy: [{ sessionId: 'asc' }, { seq: 'asc' }],
      }),
    };
  } finally {
    await client.$disconnect();
  }
}

describe(
  'SWR-004 DB with v2 data → API (mock-v1, lazy upcast v2 → v3)',
  { timeout: 60_000 },
  () => {
    let db: Swr004Db | undefined;

    afterEach(() => {
      db?.remove();
      db = undefined;
    });

    it('the fixture really is v2 (no rulesEngine; AI-rebels, AI-empire, hot-seat in a handoff)', async () => {
      db = await createSwr004Db();
      expect(db.sessions).toHaveLength(3);
      for (const s of db.sessions) {
        expect(s.state.schemaVersion).toBe(2);
        expect('rulesEngine' in s.state).toBe(false);
        expect((s.setup as { schemaVersion: number }).schemaVersion).toBe(2);
      }
      expect(seededSettings(SEEDED.hotseat).opponentType).toBe('human');
      expect(SEEDED.hotseat.state.handoffPending).toBe(true);
    });

    it('TC-M-08: GET list / GET :id → 200 on mock-v1; hot-seat in a handoff stays a handoff; reads write nothing', async () => {
      db = await createSwr004Db();
      const before = await storedRows(db.url);
      const app = await startApp(db.url);
      try {
        const list = await api(app).get(`/api/sessions?gameId=${R}`);
        expect(list.status).toBe(200);
        const summaries = ListSessionsResponseSchema.parse(list.body);
        expect(summaries.map((s) => s.sessionId).sort()).toEqual(
          db.sessions.map((s) => s.id).sort(),
        );
        for (const s of summaries) {
          expect(s.status).toBe('prototype');
          expect(RebellionSessionDetailsSchema.parse(s.details)).toMatchObject({
            rulesEngine: 'mock-v1',
            reputation: null,
            winner: null,
          });
        }

        for (const row of db.sessions) {
          const res = await api(app).get(`/api/sessions/${row.id}`);
          expect(res.status).toBe(200);
          const body = SessionResponseSchema.parse(res.body);
          expect(body).toMatchObject({ sessionId: row.id, gameId: R, status: 'prototype' });
          expect(body.settings).toEqual(settingsOf(row));
          if (row.id === SEEDED.hotseat.id) {
            expect(HandoffViewSchema.parse(body.view)).toMatchObject({
              kind: 'handoff',
              rulesEngine: 'mock-v1',
              activeSide: 'empire',
              version: row.version,
            });
          } else {
            const view = playerView(body.view);
            expect(view).toMatchObject({
              rulesEngine: 'mock-v1',
              viewer: seededSettings(row).playerFaction,
              version: row.version,
              round: row.state.round,
              phase: row.state.phase,
            });
            expect(view.log).toHaveLength(row.events.length);
          }
        }

        // Lazy upcast: reads do not rewrite rows (still v2, no rulesEngine).
        const after = await storedRows(db.url);
        expect(after).toEqual(before);
        for (const s of after.sessions) {
          expect(JSON.parse(s.state)).toMatchObject({ schemaVersion: 2 });
        }
      } finally {
        await stopApp(app);
      }
    });

    it('TC-M-09 / TC-M-14: one mock command per row → 200; row becomes v3 mock-v1, setup v2 unchanged, status prototype; views survive a restart', async () => {
      db = await createSwr004Db();
      const before = await storedRows(db.url);
      const app = await startApp(db.url);
      const views = new Map<string, unknown>();
      try {
        for (const row of db.sessions) {
          const res = await postCommand(app, row.id, mockCommandFor(row));
          expect(res.status).toBe(200);
          const view = playerView(res.body.view);
          expect(view).toMatchObject({ rulesEngine: 'mock-v1', version: row.version + 1 });
          expect(res.body.events).toHaveLength(1);
          const again = await api(app).get(`/api/sessions/${row.id}`);
          expect(again.body.view).toEqual(res.body.view);
          expect(again.body.status).toBe('prototype');
          views.set(row.id, again.body);
        }
      } finally {
        await stopApp(app);
      }

      const after = await storedRows(db.url);
      for (const row of db.sessions) {
        const stored = after.sessions.find((s) => s.id === row.id)!;
        const original = before.sessions.find((s) => s.id === row.id)!;
        const state = GameStateSchema.parse(JSON.parse(stored.state));
        expect([state.schemaVersion, state.rulesEngine]).toEqual([3, 'mock-v1']);
        expect(stored.version).toBe(row.version + 1);
        expect(stored.status).toBe('prototype');
        // setup is not part of the v3 change (stays v2, Q-30).
        expect(stored.setup).toBe(original.setup);
        expect(StoredRebellionSetupSchema.parse(JSON.parse(stored.setup)).schemaVersion).toBe(2);
        const events = after.events.filter((e) => e.sessionId === row.id);
        expect(events.map((e) => e.seq)).toEqual(
          Array.from({ length: row.version + 1 }, (_, i) => i + 1),
        );
        // Older event rows are not rewritten.
        expect(events.slice(0, -1)).toEqual(before.events.filter((e) => e.sessionId === row.id));
      }

      const app2 = await startApp(db.url);
      try {
        for (const row of db.sessions) {
          expect((await api(app2).get(`/api/sessions/${row.id}`)).body).toEqual(views.get(row.id));
        }
      } finally {
        await stopApp(app2);
      }
    });
  },
);
