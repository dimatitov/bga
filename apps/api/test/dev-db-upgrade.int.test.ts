/**
 * SWR-004 plan-backend §1.6 — OPT-IN check of the real dev DB, on a COPY only:
 *   SWR004_DEV_DB=prisma/dev.db pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts
 * The original file is only read (copyFileSync); its sha256 must be unchanged at the end.
 * Skipped unless `SWR004_DEV_DB` is set (never part of `pnpm verify`).
 */
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ListSessionsResponseSchema } from '@bga/platform';
import { upcastState } from '@bga/game-rebellion/server';
import { afterAll, describe, expect, it } from 'vitest';
import { API_ROOT, TMP_DIR } from './global-setup';
import { advanceEnv, postCommand } from './support/fixtures';
import { legacyFactionValues } from './support/legacy-faction';
import { prisma } from './support/pre-migration-db';
import { api, startApp, stopApp } from './support/test-app';

const SOURCE = process.env.SWR004_DEV_DB;

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe.skipIf(!SOURCE)('SWR-004 dev DB upgrade on a copy (opt-in, §1.6)', () => {
  const original = SOURCE ? (isAbsolute(SOURCE) ? SOURCE : join(API_ROOT, SOURCE)) : '';
  const copy = join(TMP_DIR, `devcopy-${randomUUID()}.db`);
  const url = `file:${copy}`;
  const hashBefore = SOURCE ? sha256(original) : '';

  afterAll(() => {
    for (const suffix of ['', '-journal']) rmSync(`${copy}${suffix}`, { force: true });
    if (SOURCE) {
      const hashAfter = sha256(original);
      console.log(`[dev-db-upgrade] ${original} sha256 before=${hashBefore} after=${hashAfter}`);
      expect(hashAfter).toBe(hashBefore);
    }
  });

  it('migrate deploy on the copy, every row readable with v2 factions, one command, restart-stable', async () => {
    copyFileSync(original, copy);
    console.log(`[dev-db-upgrade] copy ${copy}\n${prisma(url, ['migrate', 'deploy'])}`);

    const client = new PrismaClient({ datasourceUrl: url });
    const rows = await client.session.findMany({ orderBy: { updatedAt: 'desc' } });
    // SWR-004 platform columns: every pre-existing row is 'prototype' and has no idempotency key.
    const columns = await client.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info('Session')`,
    );
    await client.$disconnect();
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['status', 'idempotencyKey', 'idempotencyHash']),
    );
    expect(rows.every((r) => r.status === 'prototype' && r.idempotencyKey === null)).toBe(true);
    console.log(`[dev-db-upgrade] status=${[...new Set(rows.map((r) => r.status))].join(',')}`);
    console.log(`[dev-db-upgrade] ${rows.length} session row(s)`);
    expect(rows.length).toBeGreaterThan(0);

    let app = await startApp(url);
    const bodies = new Map<string, unknown>();
    try {
      for (const row of rows) {
        const res = await api(app).get(`/api/sessions/${row.id}`);
        expect(res.status, row.id).toBe(200);
        expect(legacyFactionValues(res.body), row.id).toEqual([]);
      }
      const list = await api(app).get('/api/sessions');
      expect(list.status).toBe(200);
      expect(
        ListSessionsResponseSchema.parse(list.body)
          .map((s) => s.sessionId)
          .sort(),
      ).toEqual(rows.map((r) => r.id).sort());
      expect(legacyFactionValues(list.body)).toEqual([]);

      // Prefer a row whose player was stored with the legacy rebel faction id (the interesting case).
      const target =
        rows.find((r) => upcastState(JSON.parse(r.state)).settings.playerFaction === 'rebels') ??
        rows[0]!;
      const actor = upcastState(JSON.parse(target.state)).settings.playerFaction;
      const res = await postCommand(app, target.id, advanceEnv(actor, target.version));
      expect(res.status).toBe(200);
      expect(legacyFactionValues(res.body)).toEqual([]);
      console.log(`[dev-db-upgrade] ADVANCE_PHASE ${target.id} actor=${actor} → ${res.status}`);

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
    } finally {
      await stopApp(app);
    }
  });
});
