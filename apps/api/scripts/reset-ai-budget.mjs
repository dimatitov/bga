// Resets an AI budget (SWR-005B, Q-BE-1): deletes all AiUsage rows of ONE budget key in ONE SQLite database.
// The budget otherwise accumulates forever; there is deliberately no HTTP reset endpoint (R-7).
//
// Usage (from apps/api):
//   node scripts/reset-ai-budget.mjs --database-url file:./dev.db --key dev-diagnostics --yes
//   DATABASE_URL=file:./dev.db node scripts/reset-ai-budget.mjs --key dev-diagnostics --yes
//
// - `--yes` is mandatory: without it nothing is opened or deleted (exit 2).
// - `--database-url` wins over the DATABASE_URL environment variable. This script never reads apps/api/.env itself, but
//   importing `@prisma/client` makes Prisma load apps/api/.env into process.env; the URL resolved here is passed to
//   PrismaClient explicitly (`datasourceUrl`), so a DATABASE_URL from .env never wins, and nothing prints the env.
// - Only `file:` URLs; a relative path is resolved against apps/api/prisma (as Prisma does for schema.prisma).
// - The deleted rows are the usage history of that key (no other table is touched). Back up the DB first if needed.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRISMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma');

const USAGE =
  'Usage: node scripts/reset-ai-budget.mjs --key <budgetKey> [--database-url file:<path>] --yes';

/**
 * Pure argument guard. Returns `{ ok: true, key, databaseUrl, file }` or `{ ok: false, error }`.
 * @param {string[]} argv arguments after the script name
 * @param {string | undefined} envDatabaseUrl value of DATABASE_URL
 */
export function parseResetArgs(argv, envDatabaseUrl) {
  let key;
  let databaseUrl;
  let yes = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s) : [arg];
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (name === '--yes') yes = true;
    else if (name === '--key') key = value();
    else if (name === '--database-url') databaseUrl = value();
    else return { ok: false, error: `Unknown argument: ${name}` };
  }
  if (!yes) return { ok: false, error: 'Refusing to delete without --yes.' };
  if (typeof key !== 'string' || key.trim() === '')
    return { ok: false, error: 'Missing --key <budgetKey>.' };
  const url = (databaseUrl ?? envDatabaseUrl ?? '').trim();
  if (url === '') return { ok: false, error: 'Missing --database-url (or DATABASE_URL).' };
  if (!url.startsWith('file:'))
    return { ok: false, error: 'Only file: (SQLite) URLs are supported.' };
  const rawPath = url.slice('file:'.length).split('?')[0];
  if (rawPath === '') return { ok: false, error: 'Empty SQLite path.' };
  const file = isAbsolute(rawPath) ? rawPath : join(PRISMA_DIR, rawPath);
  return { ok: true, key, databaseUrl: `file:${file}`, file };
}

async function main() {
  const args = parseResetArgs(process.argv.slice(2), process.env.DATABASE_URL);
  if (!args.ok) {
    console.error(`[reset-ai-budget] ${args.error}\n${USAGE}`);
    process.exit(2);
  }
  if (!existsSync(args.file)) {
    console.error(`[reset-ai-budget] Database file not found: ${args.file}`);
    process.exit(2);
  }
  // DATABASE_URL was resolved above, before this import (Prisma loads apps/api/.env here); it is passed explicitly.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: args.databaseUrl });
  try {
    const before = await prisma.aiUsage.aggregate({
      where: { budgetKey: args.key },
      _sum: { estimatedCostMicroUsd: true },
    });
    const { count } = await prisma.aiUsage.deleteMany({ where: { budgetKey: args.key } });
    const spent = before._sum.estimatedCostMicroUsd ?? 0;
    console.log(
      `[reset-ai-budget] key=${args.key} db=${args.file}: deleted ${count} row(s), ` +
        `freed ${spent} micro-USD ($${(spent / 1_000_000).toFixed(6)}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(
      `[reset-ai-budget] Failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
