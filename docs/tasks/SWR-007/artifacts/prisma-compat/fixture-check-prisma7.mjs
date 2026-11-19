// SWR-007 AC-05: reads and writes a COPY of the Prisma-6 fixture with the upgraded client (Prisma 7 + better-sqlite3 adapter).
// HOW TO RUN: ESM resolves `@prisma/client` from the script's own folder, so copy it into apps/api/.tmp/ first:
//   cp <this file> apps/api/.tmp/ && cd apps/api && node .tmp/<file> file:<absolute path of a COPY of the fixture DB>
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const url = process.argv[2];
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }, { timestampFormat: 'unixepoch-ms' }) });
const s = await prisma.session.findUnique({ where: { id: 'fixture-s1' }, include: { events: { orderBy: { seq: 'asc' } } } });
console.log('READ ' + JSON.stringify(s));
const u = await prisma.aiUsage.findUnique({ where: { id: 'fixture-u1' } });
console.log('READ ' + JSON.stringify(u));
const ok = s.createdAt.toISOString() === '2026-11-01T12:34:56.789Z' && s.events[0].createdAt.toISOString() === '2026-11-01T12:34:56.789Z' && u.createdAt.toISOString() === '2026-11-01T12:34:56.789Z' && s.version === 3 && s.events.length === 2;
console.log('DATES_AND_FIELDS_MATCH ' + ok);
await prisma.session.update({ where: { id: 'fixture-s1' }, data: { version: 4, events: { create: [{ seq: 3, type: 'Pass', actor: 'rebels', payload: '{}', createdAt: new Date('2026-11-19T00:00:00.000Z') }] } } });
await prisma.aiUsage.create({ data: { id: 'fixture-u2', budgetKey: 'dev-diagnostics', provider: 'mock', model: 'mock-deterministic-v1', role: 'strategy', status: 'ok', attempts: 1, pricingVersion: 'openai-2026-11-08', durationMs: 1 } });
const sum = await prisma.aiUsage.aggregate({ where: { budgetKey: 'dev-diagnostics' }, _sum: { estimatedCostMicroUsd: true } });
console.log('WRITE ok; budget sum micro-USD = ' + sum._sum.estimatedCostMicroUsd);
const again = await prisma.session.findUnique({ where: { id: 'fixture-s1' }, include: { events: { orderBy: { seq: 'asc' } } } });
console.log('REREAD version=' + again.version + ' events=' + again.events.map((e) => e.seq + '@' + e.createdAt.toISOString()).join(','));
await prisma.$disconnect();
