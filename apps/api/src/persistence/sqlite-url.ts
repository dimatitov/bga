import { isAbsolute, resolve } from 'node:path';

/**
 * Prisma ≤ 6 resolved a relative `file:` URL against the folder of `schema.prisma`; the driver adapter resolves it
 * against `process.cwd()`. This keeps the documented meaning (`.env.example`: `file:./dev.db` = `prisma/dev.db`).
 * Non-`file:` and absolute URLs are returned unchanged; a `?query` part is dropped (SQLite file URLs only).
 */
export function resolveSqliteUrl(databaseUrl: string, schemaDir: string): string {
  if (!databaseUrl.startsWith('file:')) return databaseUrl;
  const path = databaseUrl.slice('file:'.length).split('?')[0] ?? '';
  if (path === '' || path === ':memory:' || isAbsolute(path)) return `file:${path}`;
  return `file:${resolve(schemaDir, path)}`;
}
