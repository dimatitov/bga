import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

/**
 * SWR-007 (Prisma 7): the client talks to SQLite through the better-sqlite3 driver adapter.
 * `timestampFormat: 'unixepoch-ms'` keeps the on-disk DateTime format of Prisma ≤ 6 (INTEGER milliseconds);
 * the adapter default (ISO-8601 text) would make rows written before the upgrade unreadable as dates and mix formats.
 */
export function createSqliteAdapter(databaseUrl: string): PrismaBetterSqlite3 {
  return new PrismaBetterSqlite3(
    { url: databaseUrl, timeout: SQLITE_BUSY_TIMEOUT_MS },
    { timestampFormat: 'unixepoch-ms' },
  );
}

/**
 * better-sqlite3 waits for a locked database SYNCHRONOUSLY (default 5 s), blocking the event loop — so a second client
 * in the same process (two apps on one DB file in tests) would also stall the transaction that holds the lock.
 * A short wait still covers another process committing (e2e seeder, Prisma CLI); a lost race fails fast instead.
 */
export const SQLITE_BUSY_TIMEOUT_MS = 250;

/**
 * The database file was locked by another connection (`SQLITE_BUSY`, Prisma `P1008` with the driver adapter's cause).
 * With Prisma ≤ 6 the engine waited on its own threads and the loser then saw a changed version; callers that commit
 * with optimistic concurrency treat this the same way (version conflict).
 */
export function isSqliteBusy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    .meta;
  const message = (error as { message?: unknown }).message;
  return (
    meta?.driverAdapterError?.cause?.originalCode === 'SQLITE_BUSY' ||
    (typeof message === 'string' && /SQLITE_BUSY|database is locked/.test(message))
  );
}
