/**
 * SWR-007 (Prisma 7 driver adapter): two clients on one SQLite file in ONE process. better-sqlite3 waits for a lock
 * synchronously, so the waiting client also blocks the transaction holding it; the adapter is configured to give up
 * quickly and the error is recognised as a lost race (`isSqliteBusy` → version conflict in SessionsRepository.commit).
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSqliteAdapter,
  isSqliteBusy,
  SQLITE_BUSY_TIMEOUT_MS,
} from '../src/persistence/sqlite-adapter';
import type { PrismaService } from '../src/persistence/prisma.service';
import { SessionsRepository } from '../src/sessions/sessions.repository';
import { TEMPLATE_DB, TMP_DIR } from './global-setup';

const files: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of files.splice(0))
    for (const s of ['', '-journal']) rmSync(`${f}${s}`, { force: true });
});

describe('createSqliteAdapter — lock contention between two clients', () => {
  it('the second writer fails fast with an error isSqliteBusy recognises; the lock holder commits', async () => {
    const file = join(TMP_DIR, `test-busy-${randomUUID()}.db`);
    copyFileSync(TEMPLATE_DB, file);
    files.push(file);
    const url = `file:${file}`;
    const a = new PrismaClient({ adapter: createSqliteAdapter(url) });
    const b = new PrismaClient({ adapter: createSqliteAdapter(url) });
    try {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => undefined;
      const hasLock = new Promise<void>((resolve) => (locked = resolve));
      const holder = a.$transaction(async (tx) => {
        await tx.aiUsage.deleteMany({ where: { id: 'none' } }); // takes the write lock
        locked();
        await held;
      });
      await hasLock;
      const started = Date.now();
      const loser = await b.aiUsage.deleteMany({ where: { id: 'none' } }).catch((e: unknown) => e);
      const waited = Date.now() - started;
      release();
      await holder;
      expect(isSqliteBusy(loser)).toBe(true);
      expect(waited).toBeLessThan(SQLITE_BUSY_TIMEOUT_MS + 2_000);
    } finally {
      await a.$disconnect();
      await b.$disconnect();
    }
  });

  it('review F-3: SessionsRepository.commit that loses the lock → VERSION_CONFLICT and ONE warn line (class + session id, no data)', async () => {
    const file = join(TMP_DIR, `test-busy-${randomUUID()}.db`);
    copyFileSync(TEMPLATE_DB, file);
    files.push(file);
    const url = `file:${file}`;
    const a = new PrismaClient({ adapter: createSqliteAdapter(url) });
    const b = new PrismaClient({ adapter: createSqliteAdapter(url) });
    const sessionId = randomUUID();
    const now = '2026-01-01T00:00:00.000Z';
    const secretState = JSON.stringify({ id: sessionId, secret: 'STATE-SECRET-F3' });
    try {
      const repoA = new SessionsRepository(a as unknown as PrismaService);
      const repoB = new SessionsRepository(b as unknown as PrismaService);
      expect(
        await repoA.insert({
          id: sessionId,
          gameId: 'fake',
          setup: '{}',
          state: '{}',
          version: 1,
          status: 'active',
          idempotency: null,
          events: [],
          now,
        }),
      ).toEqual({ ok: true });
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => undefined;
      const hasLock = new Promise<void>((resolve) => (locked = resolve));
      const holder = a.$transaction(async (tx) => {
        await tx.aiUsage.deleteMany({ where: { id: 'none' } }); // takes the write lock
        locked();
        await held;
      });
      await hasLock;
      const outcome = await repoB.commit({
        id: sessionId,
        expectedVersion: 1,
        setup: '{}',
        state: secretState,
        version: 2,
        status: 'active',
        events: [{ seq: 1, type: 'SECRET_EVENT', actor: 'p1', at: now, payload: { x: 1 } }],
        now,
      });
      release();
      await holder;

      expect(outcome).toEqual({ ok: false, reason: 'VERSION_CONFLICT' });
      expect(warn).toHaveBeenCalledTimes(1);
      const [line] = warn.mock.calls[0] ?? [];
      expect(typeof line).toBe('string');
      expect(line).toContain(`sessionId=${sessionId}`);
      expect(line).toContain('code=SQLITE_BUSY');
      expect(line).toMatch(/error=\w+/);
      for (const leaked of [
        'STATE-SECRET-F3',
        'SECRET_EVENT',
        file,
        'UPDATE',
        'SELECT',
        'locked',
      ]) {
        expect(line).not.toContain(leaked);
      }
      expect(warn.mock.contexts[0]).toBeInstanceOf(Logger);
      expect((warn.mock.contexts[0] as unknown as { context?: string }).context).toBe(
        'SessionsRepository',
      );
      // Rolled back: the stored row is untouched.
      expect(await repoA.findById(sessionId)).toMatchObject({ version: 1, state: '{}' });
    } finally {
      await a.$disconnect();
      await b.$disconnect();
    }
  });

  it('isSqliteBusy is false for other errors and non-errors', () => {
    expect(isSqliteBusy(new Error('UNIQUE constraint failed'))).toBe(false);
    expect(isSqliteBusy(null)).toBe(false);
    expect(isSqliteBusy('SQLITE_BUSY')).toBe(false);
  });
});
