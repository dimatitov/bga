/**
 * SWR-005 plan-backend §6.3 (TC-M-10; SWR-004 §1.6) — OPT-IN check of the real dev DB, on a COPY only:
 *   SWR005_DEV_DB=prisma/dev.db pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts
 * (`SWR004_DEV_DB` is still accepted as an alias.) The original file is only read (sha256 + copyFileSync);
 * its sha256 must be unchanged at the end. Skipped unless one of the variables is set (never part of `pnpm verify`).
 * Steps on the copy: `migrate deploy` (no-op: SWR-005 has no migration) → every row GET 200 on the mock rules
 * (`rulesEngine: 'mock-v1'`, no legacy faction ids) and listed → one mock command per row → 200, the row now
 * stores state v3 `mock-v1`, status stays `prototype` (TC-M-14) → after an app restart every GET is identical.
 */
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ListSessionsResponseSchema } from '@bga/platform';
import { PlayerViewSchema, type CommandEnvelope } from '@bga/game-rebellion/schema';
import { afterAll, describe, expect, it } from 'vitest';
import { API_ROOT, TMP_DIR } from './global-setup';
import { postCommand } from './support/fixtures';
import { legacyFactionValues } from './support/legacy-faction';
import { prisma } from './support/pre-migration-db';
import { api, startApp, stopApp } from './support/test-app';

const SOURCE = process.env.SWR005_DEV_DB ?? process.env.SWR004_DEV_DB;
const VARIABLE = process.env.SWR005_DEV_DB ? 'SWR005_DEV_DB' : 'SWR004_DEV_DB';

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const log = (line: string) => console.log(`[dev-db-upgrade] ${line}`);

/** One mock-v1 command the active side may send now (handoff → ACCEPT_HANDOFF, else ADVANCE_PHASE / END_TURN). */
function mockCommandFor(view: unknown): CommandEnvelope {
  const parsed = PlayerViewSchema.parse(view);
  if (parsed.kind === 'handoff') {
    return {
      actor: parsed.activeSide,
      expectedVersion: parsed.version,
      command: { type: 'ACCEPT_HANDOFF' },
    };
  }
  if (parsed.rulesEngine !== 'mock-v1') throw new Error('not a mock-v1 board');
  const types = parsed.legalActions.map((a) => a.type);
  const type = types.includes('ADVANCE_PHASE') ? 'ADVANCE_PHASE' : 'END_TURN';
  return { actor: parsed.activeSide, expectedVersion: parsed.version, command: { type } };
}

describe.skipIf(!SOURCE)(
  'SWR-005 dev DB on a copy: old sessions stay on mock-v1 (opt-in, §6.3)',
  () => {
    const original = SOURCE ? (isAbsolute(SOURCE) ? SOURCE : join(API_ROOT, SOURCE)) : '';
    const copy = join(TMP_DIR, `devcopy-${randomUUID()}.db`);
    const url = `file:${copy}`;
    const hashBefore = SOURCE ? sha256(original) : '';

    afterAll(() => {
      for (const suffix of ['', '-journal']) rmSync(`${copy}${suffix}`, { force: true });
      if (SOURCE) {
        const hashAfter = sha256(original);
        log(`${original} sha256 before=${hashBefore} after=${hashAfter}`);
        expect(hashAfter).toBe(hashBefore);
      }
    });

    it('TC-M-10: migrate deploy (no-op), every row on mock-v1, one mock command per row, restart-stable', async () => {
      log(`source (${VARIABLE}) ${original} sha256=${hashBefore}`);
      copyFileSync(original, copy);
      log(`copy ${copy}\n${prisma(url, ['migrate', 'deploy'])}`);

      const client = new PrismaClient({ datasourceUrl: url });
      const rows = await client.session.findMany({ orderBy: { updatedAt: 'desc' } });
      await client.$disconnect();
      log(
        `${rows.length} session row(s); stored schemaVersions: ${[...new Set(rows.map((r) => (JSON.parse(r.state).schemaVersion as number | undefined) ?? 'none (v1)'))].join(',')}; status: ${[...new Set(rows.map((r) => r.status))].join(',')}`,
      );
      expect(rows.length).toBeGreaterThan(0);

      let app = await startApp(url);
      const bodies = new Map<string, unknown>();
      try {
        const views = new Map<string, unknown>();
        for (const row of rows) {
          const res = await api(app).get(`/api/sessions/${row.id}`);
          expect(res.status, row.id).toBe(200);
          expect(legacyFactionValues(res.body), row.id).toEqual([]);
          // Every pre-SWR-005 session is played on the mock rules (board or handoff view).
          expect(res.body.view.rulesEngine, row.id).toBe('mock-v1');
          views.set(row.id, res.body.view);
          log(
            `GET ${row.id} → 200 kind=${res.body.view.kind} rulesEngine=${res.body.view.rulesEngine} v=${res.body.view.version}`,
          );
        }
        const list = await api(app).get('/api/sessions');
        expect(list.status).toBe(200);
        const summaries = ListSessionsResponseSchema.parse(list.body);
        expect(summaries.map((s) => s.sessionId).sort()).toEqual(rows.map((r) => r.id).sort());
        for (const s of summaries) expect(s.details.rulesEngine, s.sessionId).toBe('mock-v1');
        expect(legacyFactionValues(list.body)).toEqual([]);

        for (const row of rows) {
          const env = mockCommandFor(views.get(row.id));
          const res = await postCommand(app, row.id, env);
          expect(res.status, `${row.id}: ${JSON.stringify(res.body)}`).toBe(200);
          expect(legacyFactionValues(res.body)).toEqual([]);
          expect(res.body.view.rulesEngine).toBe('mock-v1');
          log(
            `${env.command.type} ${row.id} actor=${env.actor} v=${env.expectedVersion} → ${res.status}`,
          );
        }

        const after = new PrismaClient({ datasourceUrl: url });
        for (const row of await after.session.findMany()) {
          const state = JSON.parse(row.state) as { schemaVersion: number; rulesEngine: string };
          expect([state.schemaVersion, state.rulesEngine, row.status], row.id).toEqual([
            3,
            'mock-v1',
            'prototype',
          ]);
        }
        await after.$disconnect();
        log(
          'after one command: every row stores schemaVersion 3, rulesEngine mock-v1, status prototype',
        );

        for (const row of rows)
          bodies.set(row.id, (await api(app).get(`/api/sessions/${row.id}`)).body);
      } finally {
        await stopApp(app);
      }

      app = await startApp(url);
      try {
        for (const row of rows) {
          expect((await api(app).get(`/api/sessions/${row.id}`)).body).toEqual(bodies.get(row.id));
        }
        log(`restart: ${rows.length} GET bodies identical`);
      } finally {
        await stopApp(app);
      }
    });
  },
);
