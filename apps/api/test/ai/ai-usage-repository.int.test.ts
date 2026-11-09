/**
 * SWR-005B W5: `AiUsageRepository` on a real SQLite copy of the migrated template (never dev.db).
 * Integer micro-USD (Q-15), rows for every attempt incl. mock (cost 0) and budget refusals (AM-BE-7).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AiUsageRepository,
  InvalidAiUsageRowError,
  type NewAiUsageRow,
} from '../../src/ai/ai-usage.repository';
import { createTestDb, removeTestDb, type TestDb } from '../support/test-app';

function usageRow(overrides: Partial<NewAiUsageRow> = {}): NewAiUsageRow {
  return {
    budgetKey: 'dev-diagnostics',
    provider: 'openai',
    model: 'gpt-6-luna',
    role: 'tactical',
    status: 'ok',
    attempts: 1,
    inputTokens: 1200,
    cachedInputTokens: 200,
    outputTokens: 80,
    reasoningTokens: null,
    estimatedCostMicroUsd: 142,
    pricingVersion: 'openai-2026-11-08',
    durationMs: 900,
    errorCode: null,
    ...overrides,
  };
}

describe('AiUsageRepository (SWR-005B W5)', () => {
  let db: TestDb;
  let prisma: PrismaClient;
  let repo: AiUsageRepository;

  beforeEach(() => {
    db = createTestDb();
    prisma = new PrismaClient({ datasourceUrl: db.url });
    repo = new AiUsageRepository(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
    removeTestDb(db);
  });

  it('insert stores every field (integer micro-USD, pricingVersion) and generates a UUID id', async () => {
    const stored = await repo.insert(usageRow({ reasoningTokens: 30, errorCode: null }));
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = await prisma.aiUsage.findUniqueOrThrow({ where: { id: stored.id } });
    expect(row).toMatchObject({
      budgetKey: 'dev-diagnostics',
      provider: 'openai',
      model: 'gpt-6-luna',
      role: 'tactical',
      status: 'ok',
      attempts: 1,
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 80,
      reasoningTokens: 30,
      estimatedCostMicroUsd: 142,
      pricingVersion: 'openai-2026-11-08',
      durationMs: 900,
      errorCode: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('keeps a given id and createdAt', async () => {
    const id = randomUUID();
    const createdAt = new Date('2026-11-08T10:00:00.000Z');
    await repo.insert(usageRow({ id, createdAt }));
    const row = await prisma.aiUsage.findUniqueOrThrow({ where: { id } });
    expect(row.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('sumCostMicroUsd is an exact integer sum per key; 0 for an unknown key', async () => {
    // 0.1 + 0.2 style amounts: integer micro-USD sum exactly (no float drift).
    await repo.insert(usageRow({ estimatedCostMicroUsd: 100_000 }));
    await repo.insert(usageRow({ estimatedCostMicroUsd: 200_000 }));
    await repo.insert(usageRow({ estimatedCostMicroUsd: 1, budgetKey: 'other-key' }));
    expect(await repo.sumCostMicroUsd('dev-diagnostics')).toBe(300_000);
    expect(await repo.sumCostMicroUsd('other-key')).toBe(1);
    expect(await repo.sumCostMicroUsd('never-used')).toBe(0);
  });

  it('records failed attempts, mock rows (cost 0) and budget refusals; only real cost counts', async () => {
    await repo.insert(usageRow({ estimatedCostMicroUsd: 500 }));
    await repo.insert(
      usageRow({
        status: 'timeout',
        attempts: 3,
        errorCode: 'AI_TIMEOUT',
        estimatedCostMicroUsd: 1050,
      }),
    );
    await repo.insert(
      usageRow({
        provider: 'mock',
        model: 'mock-deterministic-v1',
        estimatedCostMicroUsd: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    );
    await repo.insert(
      usageRow({
        status: 'budget_exceeded',
        attempts: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        estimatedCostMicroUsd: 0,
        durationMs: 0,
        errorCode: 'AI_BUDGET_EXCEEDED',
      }),
    );
    expect(await prisma.aiUsage.count({ where: { budgetKey: 'dev-diagnostics' } })).toBe(4);
    expect(await repo.sumCostMicroUsd('dev-diagnostics')).toBe(1550);
  });

  it.each<[string, Partial<NewAiUsageRow>]>([
    ['fractional micro-USD', { estimatedCostMicroUsd: 1.5 }],
    ['negative cost', { estimatedCostMicroUsd: -1 }],
    ['cost over Int32', { estimatedCostMicroUsd: 2_147_483_648 }],
    ['mock with a cost', { provider: 'mock', estimatedCostMicroUsd: 1 }],
    [
      'budget refusal with attempts',
      { status: 'budget_exceeded', attempts: 1, estimatedCostMicroUsd: 0 },
    ],
    ['budget refusal with a cost', { status: 'budget_exceeded', attempts: 0 }],
    ['cached > input', { inputTokens: 10, cachedInputTokens: 11 }],
    ['unknown status', { status: 'weird' as NewAiUsageRow['status'] }],
    ['unknown provider', { provider: 'other' as NewAiUsageRow['provider'] }],
    ['unknown role', { role: 'boss' as NewAiUsageRow['role'] }],
    ['empty budget key', { budgetKey: '' }],
    ['empty pricingVersion', { pricingVersion: '' }],
    ['negative tokens', { outputTokens: -1 }],
  ])('insert rejects an invalid row (%s) and writes nothing', async (_name, overrides) => {
    await expect(repo.insert(usageRow(overrides))).rejects.toBeInstanceOf(InvalidAiUsageRowError);
    expect(await prisma.aiUsage.count()).toBe(0);
  });

  it('rejects extra fields (no prompt/response text can be stored)', async () => {
    const row = { ...usageRow(), prompt: 'secret objective' } as unknown as NewAiUsageRow;
    await expect(repo.insert(row)).rejects.toBeInstanceOf(InvalidAiUsageRowError);
    expect(await prisma.aiUsage.count()).toBe(0);
  });
});
