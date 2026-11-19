/**
 * SWR-007 (Prisma 7 driver adapter): a relative SQLite `file:` URL keeps its Prisma ≤ 6 meaning — relative to the
 * folder of schema.prisma — instead of the process working directory.
 */
import { describe, expect, it } from 'vitest';
import { resolveSqliteUrl } from '../src/persistence/sqlite-url';

const SCHEMA_DIR = '/repo/apps/api/prisma';

describe('resolveSqliteUrl', () => {
  it.each([
    ['file:./dev.db', 'file:/repo/apps/api/prisma/dev.db'],
    ['file:dev.db', 'file:/repo/apps/api/prisma/dev.db'],
    ['file:../.tmp/x.db', 'file:/repo/apps/api/.tmp/x.db'],
    ['file:/abs/path with space/e2e.db', 'file:/abs/path with space/e2e.db'],
    ['file:./dev.db?connection_limit=1', 'file:/repo/apps/api/prisma/dev.db'],
    ['file::memory:', 'file::memory:'],
  ])('%s → %s', (input, expected) => {
    expect(resolveSqliteUrl(input, SCHEMA_DIR)).toBe(expected);
  });

  it('a non-file URL is returned unchanged', () => {
    expect(resolveSqliteUrl('postgresql://x/y', SCHEMA_DIR)).toBe('postgresql://x/y');
  });
});
