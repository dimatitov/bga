// SWR-007 AC-05: creates a dev-DB fixture with the CURRENT Prisma client (run before the upgrade).
// HOW TO RUN: ESM resolves `@prisma/client` from the script's own folder, so copy it into apps/api/.tmp/ first:
//   cp <this file> apps/api/.tmp/ && cd apps/api && node .tmp/<file> file:<absolute path of a COPY of the fixture DB>
import { PrismaClient } from '@prisma/client';
const url = process.argv[2];
const prisma = new PrismaClient({ datasourceUrl: url });
const t = new Date('2026-11-01T12:34:56.789Z');
await prisma.session.create({ data: { id: 'fixture-s1', gameId: 'rebellion', setup: '{"a":1}', state: '{"round":1}', version: 3, createdAt: t, status: 'active', idempotencyKey: 'k-1', idempotencyHash: 'h-1',
  events: { create: [{ seq: 1, type: 'SessionCreated', actor: 'system', payload: '{}', createdAt: t }, { seq: 2, type: 'Pass', actor: 'empire', payload: '{"x":2}' }] } } });
await prisma.aiUsage.create({ data: { id: 'fixture-u1', budgetKey: 'dev-diagnostics', provider: 'mock', model: 'mock-deterministic-v1', role: 'tactical', status: 'ok', attempts: 1, inputTokens: 235, outputTokens: 38, reasoningTokens: null, estimatedCostMicroUsd: 43, pricingVersion: 'openai-2026-11-08', durationMs: 4177, createdAt: t } });
const s = await prisma.session.findUnique({ where: { id: 'fixture-s1' }, include: { events: { orderBy: { seq: 'asc' } } } });
console.log(JSON.stringify(s));
await prisma.$disconnect();
