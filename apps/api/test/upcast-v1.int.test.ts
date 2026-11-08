/**
 * SWR-004 R0 (AC-15, TC-R-03): a DB in the SWR-003 shape with frozen v1 rows (TR-4a) is read through the
 * API with v2 faction ids (lazy upcast, Q-16); the next command persists the snapshot as v2.
 * SWR-004: the platform migration (status / idempotency columns) is deployed first, as `db:prepare` does.
 */
import { PrismaClient } from '@prisma/client';
import { ListSessionsResponseSchema, SessionResponseSchema } from '@bga/platform';
import {
  GameStateSchema,
  PlayerViewPlayerSchema,
  RebellionSessionDetailsSchema,
} from '@bga/game-rebellion/schema';
import { upcastState } from '@bga/game-rebellion/server';
import { afterEach, describe, expect, it } from 'vitest';
import { R, advanceEnv, postCommand } from './support/fixtures';
import { legacyFactionValues } from './support/legacy-faction';
import { prisma, v1Sessions } from './support/pre-migration-db';
import { createSwr003Db, type Swr003Db } from './support/swr003-db';
import { api, startApp, stopApp } from './support/test-app';

describe('SWR-003 DB with v1 data → API (lazy upcast v1 → v2)', { timeout: 60_000 }, () => {
  let db: Swr003Db | undefined;

  afterEach(() => {
    db?.remove();
    db = undefined;
  });

  it('the fixture really is v1 (legacy faction in setup, state and event actors)', async () => {
    db = await createSwr003Db({ rows: 3 });
    expect(db.sessions.some((s) => legacyFactionValues(JSON.parse(s.setup)).length > 0)).toBe(true);
    expect(db.sessions.some((s) => legacyFactionValues(JSON.parse(s.state)).length > 0)).toBe(true);
    expect(db.events.some((e) => legacyFactionValues(e.actor).length > 0)).toBe(true);
    expect(db.sessions.every((s) => !('schemaVersion' in JSON.parse(s.state)))).toBe(true);
  });

  it('GET list / GET :id: v2 factions everywhere, views equal the upcast state; rows untouched by reads', async () => {
    db = await createSwr003Db({ rows: 3 });
    prisma(db.url, ['migrate', 'deploy']);
    const app = await startApp(db.url);
    try {
      const list = await api(app).get(`/api/sessions?gameId=${R}`);
      expect(list.status).toBe(200);
      const summaries = ListSessionsResponseSchema.parse(list.body);
      expect(summaries.map((s) => s.sessionId).sort()).toEqual(db.sessions.map((s) => s.id).sort());
      expect(legacyFactionValues(list.body)).toEqual([]);
      for (const s of summaries) RebellionSessionDetailsSchema.parse(s.details);

      const fixtures = v1Sessions();
      for (const row of db.sessions) {
        const res = await api(app).get(`/api/sessions/${row.id}`);
        expect(res.status).toBe(200);
        expect(legacyFactionValues(res.body)).toEqual([]);
        const body = SessionResponseSchema.parse(res.body);
        expect(body.status).toBe('prototype');
        const view = PlayerViewPlayerSchema.parse(body.view);
        const v2 = upcastState(JSON.parse(row.state));
        expect(view.viewer).toBe(v2.settings.playerFaction);
        expect(view.settings).toEqual(v2.settings);
        expect(body.settings).toEqual(v2.settings);
        expect(view.version).toBe(row.version);
        const fixture = fixtures.find((f) => f.id === row.id)!;
        expect(view.viewer).toBe(
          fixture.state.setup.humanFaction === 'empire' ? 'empire' : 'rebels',
        );
      }
      const client = new PrismaClient({ datasourceUrl: db.url });
      try {
        const rows = await client.session.findMany({ orderBy: { id: 'asc' } });
        expect(rows.map((r) => r.state)).toEqual(
          [...db.sessions].sort((a, b) => a.id.localeCompare(b.id)).map((s) => s.state),
        );
      } finally {
        await client.$disconnect();
      }
    } finally {
      await stopApp(app);
    }
  });

  it('a command on a v1 row → 200; the snapshot is written as v2; old mirror rows keep their actor (Q-16)', async () => {
    db = await createSwr003Db({ rows: 3 });
    const played = db.sessions.find((s) => s.version > 1)!;
    const actor = upcastState(JSON.parse(played.state)).settings.playerFaction;
    expect(actor).toBe('rebels');
    prisma(db.url, ['migrate', 'deploy']);
    const app = await startApp(db.url);
    try {
      const res = await postCommand(app, played.id, advanceEnv(actor, played.version));
      expect(res.status).toBe(200);
      expect(legacyFactionValues(res.body)).toEqual([]);
      expect(res.body.view.version).toBe(played.version + 1);
      expect(res.body.events.map((e: { actor: string }) => e.actor)).toEqual(['rebels']);

      const client = new PrismaClient({ datasourceUrl: db.url });
      try {
        const row = await client.session.findUniqueOrThrow({ where: { id: played.id } });
        const state = GameStateSchema.parse(JSON.parse(row.state));
        expect(state.schemaVersion).toBe(2);
        expect(legacyFactionValues(state)).toEqual([]);
        expect(row.version).toBe(played.version + 1);
        const events = await client.sessionEvent.findMany({
          where: { sessionId: played.id },
          orderBy: { seq: 'asc' },
        });
        expect(events.map((e) => e.seq)).toEqual(
          Array.from({ length: played.version + 1 }, (_, i) => i + 1),
        );
        expect(events.at(-1)?.actor).toBe('rebels');
        // Lazy upcast: older mirror rows are not rewritten in the DB.
        const before = db.events.filter((e) => e.gameId === played.id);
        expect(events.slice(0, -1).map((e) => e.actor)).toEqual(before.map((e) => e.actor));
      } finally {
        await client.$disconnect();
      }

      const again = await api(app).get(`/api/sessions/${played.id}`);
      expect(again.body.view).toEqual(res.body.view);
    } finally {
      await stopApp(app);
    }
  });
});
