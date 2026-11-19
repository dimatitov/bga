import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

/**
 * SWR-007 (Prisma 7): the client talks to SQLite through the better-sqlite3 driver adapter.
 * `timestampFormat: 'unixepoch-ms'` keeps the on-disk DateTime format of Prisma ≤ 6 (INTEGER milliseconds);
 * the adapter default (ISO-8601 text) would make rows written before the upgrade unreadable as dates and mix formats.
 */
export function createSqliteAdapter(databaseUrl: string): PrismaBetterSqlite3 {
  return new PrismaBetterSqlite3({ url: databaseUrl }, { timestampFormat: 'unixepoch-ms' });
}
