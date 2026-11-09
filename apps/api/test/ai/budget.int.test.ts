/**
 * SWR-005B W5: `BudgetService` over the real `AiUsageRepository` on a SQLite copy of the migrated template
 * (plan-backend §5.2–§5.3, AC-07, Q-15). All money in integer micro-USD.
 */
import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usdToMicroUsd } from '@bga/platform';
import { AiUsageRepository, type NewAiUsageRow } from '../../src/ai/ai-usage.repository';
import { BudgetExceededError, BudgetService } from '../../src/ai/budget.service';
import { createTestDb, removeTestDb, type TestDb } from '../support/test-app';

const KEY = 'dev-diagnostics';

function usageRow(overrides: Partial<NewAiUsageRow> = {}): NewAiUsageRow {
  return {
    budgetKey: KEY,
    provider: 'openai',
    model: 'gpt-6-luna',
    role: 'tactical',
    status: 'ok',
    attempts: 1,
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 100,
    reasoningTokens: null,
    estimatedCostMicroUsd: 0,
    pricingVersion: 'openai-2026-11-08',
    durationMs: 500,
    errorCode: null,
    ...overrides,
  };
}

describe('BudgetService (SWR-005B W5)', () => {
  let db: TestDb;
  let prisma: PrismaClient;
  let repo: AiUsageRepository;
  let budget: BudgetService;

  const spend = (microUsd: number, budgetKey = KEY) =>
    repo.insert(usageRow({ estimatedCostMicroUsd: microUsd, budgetKey }));

  beforeEach(() => {
    db = createTestDb();
    prisma = new PrismaClient({ datasourceUrl: db.url });
    repo = new AiUsageRepository(prisma);
    budget = new BudgetService(repo);
  });

  afterEach(async () => {
    await prisma.$disconnect();
    removeTestDb(db);
  });

  it('reserves while spent + reserve < limit', async () => {
    await spend(50_000);
    const r = await budget.reserve(KEY, 49_999, 100_000);
    expect(r).toMatchObject({ budgetKey: KEY, amountMicroUsd: 49_999 });
    expect(budget.heldMicroUsd(KEY)).toBe(49_999);
  });

  it('refuses at exact equality spent + reserve = limit and above it', async () => {
    await spend(60_000);
    const err = await budget.reserve(KEY, 40_000, 100_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect(err).toMatchObject({
      budgetKey: KEY,
      spentMicroUsd: 60_000,
      heldMicroUsd: 0,
      reserveMicroUsd: 40_000,
      limitMicroUsd: 100_000,
    });
    await expect(budget.reserve(KEY, 40_001, 100_000)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(budget.heldMicroUsd(KEY)).toBe(0);
  });

  it('counts active holds: spent + held + reserve ≥ limit → refuse', async () => {
    await spend(10_000);
    await budget.reserve(KEY, 50_000, 100_000);
    await expect(budget.reserve(KEY, 40_000, 100_000)).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(budget.reserve(KEY, 39_999, 100_000)).resolves.toBeDefined();
  });

  it('release after the AiUsage insert: the actual cost replaces the hold (no undercount meanwhile)', async () => {
    const r = await budget.reserve(KEY, 40_000, 100_000);
    await spend(30_000); // insert first …
    // … while still held: 30k spent + 40k held + 60k ≥ 100k → refused (conservative double count).
    await expect(budget.reserve(KEY, 60_000, 100_000)).rejects.toBeInstanceOf(BudgetExceededError);
    r.release(); // … then release.
    expect(budget.heldMicroUsd(KEY)).toBe(0);
    await expect(budget.reserve(KEY, 60_000, 100_000)).resolves.toBeDefined();
  });

  it('release is idempotent and releases only its own hold', async () => {
    const a = await budget.reserve(KEY, 10_000, 100_000);
    const b = await budget.reserve(KEY, 20_000, 100_000);
    a.release();
    a.release();
    a.release();
    expect(budget.heldMicroUsd(KEY)).toBe(20_000);
    b.release();
    b.release();
    expect(budget.heldMicroUsd(KEY)).toBe(0);
  });

  it('5 parallel reserves of $0.04 at limit $0.10 → exactly 2 succeed', async () => {
    const amount = usdToMicroUsd(0.04);
    const limit = usdToMicroUsd(0.1);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => budget.reserve(KEY, amount, limit)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(3);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(BudgetExceededError);
    expect(budget.heldMicroUsd(KEY)).toBe(80_000);
  });

  it('serializes check-and-reserve per key even when the SUM query is slow', async () => {
    const slow = new BudgetService({
      sumCostMicroUsd: async (key) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return repo.sumCostMicroUsd(key);
      },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => slow.reserve(KEY, 40_000, 100_000)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('a failing SUM does not deadlock the key', async () => {
    let fail = true;
    const flaky = new BudgetService({
      sumCostMicroUsd: async (key) => {
        if (fail) {
          fail = false;
          throw new Error('db down');
        }
        return repo.sumCostMicroUsd(key);
      },
    });
    await expect(flaky.reserve(KEY, 1, 100)).rejects.toThrow('db down');
    await expect(flaky.reserve(KEY, 1, 100)).resolves.toBeDefined();
  });

  it('keys are isolated (spent and holds)', async () => {
    await spend(90_000, 'key-a');
    await budget.reserve('key-b', 50_000, 100_000);
    await expect(budget.reserve('key-a', 10_000, 100_000)).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    await expect(budget.reserve('key-c', 99_999, 100_000)).resolves.toBeDefined();
    await expect(budget.reserve('key-b', 49_999, 100_000)).resolves.toBeDefined();
    expect(budget.heldMicroUsd('key-a')).toBe(0);
  });

  it('snapshot: remaining = max(0, limit − spent); holds are not subtracted; null limit → null remaining', async () => {
    await spend(30_000);
    await budget.reserve(KEY, 20_000, 100_000);
    expect(await budget.snapshot(KEY, 100_000)).toEqual({
      budgetKey: KEY,
      spentMicroUsd: 30_000,
      limitMicroUsd: 100_000,
      remainingMicroUsd: 70_000,
    });
    await spend(90_000);
    expect(await budget.snapshot(KEY, 100_000)).toMatchObject({
      spentMicroUsd: 120_000,
      remainingMicroUsd: 0,
    });
    expect(await budget.snapshot(KEY, null)).toEqual({
      budgetKey: KEY,
      spentMicroUsd: 120_000,
      limitMicroUsd: null,
      remainingMicroUsd: null,
    });
    expect(await budget.snapshot('unused', 5)).toMatchObject({
      spentMicroUsd: 0,
      remainingMicroUsd: 5,
    });
  });

  it('mock rows (cost 0) and budget refusal rows never reduce the remaining budget', async () => {
    await spend(10_000);
    await repo.insert(
      usageRow({ provider: 'mock', model: 'mock-deterministic-v1', estimatedCostMicroUsd: 0 }),
    );
    await repo.insert(
      usageRow({
        status: 'budget_exceeded',
        attempts: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostMicroUsd: 0,
        errorCode: 'AI_BUDGET_EXCEEDED',
      }),
    );
    expect(await budget.snapshot(KEY, 100_000)).toMatchObject({
      spentMicroUsd: 10_000,
      remainingMicroUsd: 90_000,
    });
    await expect(budget.reserve(KEY, 89_999, 100_000)).resolves.toBeDefined();
  });

  it('the budget accumulates across service instances (persisted, not in memory)', async () => {
    await spend(70_000);
    const fresh = new BudgetService(new AiUsageRepository(prisma));
    await expect(fresh.reserve(KEY, 30_000, 100_000)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it.each([
    ['fractional amount', 1.5, 100],
    ['negative amount', -1, 100],
    ['fractional limit', 1, 100.5],
    ['NaN limit', 1, Number.NaN],
  ])('rejects non-integer micro-USD input (%s)', async (_name, amount, limit) => {
    await expect(budget.reserve(KEY, amount, limit)).rejects.toBeInstanceOf(RangeError);
    expect(budget.heldMicroUsd(KEY)).toBe(0);
  });
});
