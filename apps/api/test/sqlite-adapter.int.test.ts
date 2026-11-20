/**
 * SWR-007 (Prisma 7 driver adapter): two clients on one SQLite file in ONE process. better-sqlite3 waits for a lock
 * synchronously, so the waiting client also blocks the transaction holding it; the adapter is configured to give up
 * quickly and the error is recognised as a lost race (`isSqliteBusy` → version conflict in SessionsRepository.commit).
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSqliteAdapter,
  isSqliteBusy,
  SQLITE_BUSY_TIMEOUT_MS,
} from '../src/persistence/sqlite-adapter';
import { TEMPLATE_DB, TMP_DIR } from './global-setup';

const files: string[] = [];
afterEach(() => {
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

  it('isSqliteBusy is false for other errors and non-errors', () => {
    expect(isSqliteBusy(new Error('UNIQUE constraint failed'))).toBe(false);
    expect(isSqliteBusy(null)).toBe(false);
    expect(isSqliteBusy('SQLITE_BUSY')).toBe(false);
  });
});
