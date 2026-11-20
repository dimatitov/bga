/**
 * SWR-005B W5: `AiUsageRepository` on a real SQLite copy of the migrated template (never dev.db).
 * Integer micro-USD (Q-15), rows for every attempt incl. mock (cost 0) and budget refusals (AM-BE-7).
 * SWR-008 W6a (§5; TC-COST-01/02/04): rules columns (defaults = rules off, ids as a JSON array, invariants),
 * `listByBudgetKey`, `ruleIdsOf`; no column can hold prompt / rule text.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createSqliteAdapter } from '../../src/persistence/sqlite-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AiUsageRepository,
  InvalidAiUsageRowError,
  ruleIdsOf,
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
    prisma = new PrismaClient({ adapter: createSqliteAdapter(db.url) });
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

  // ---- SWR-008 W6a ----

  const RULES_ON: Partial<NewAiUsageRow> = {
    rulesEnabled: true,
    rulesVersion: 'fake@1:0123456789ab',
    rulesIds: ['fake:impl.engine-scope', 'fake:turn.pass'],
    rulesChars: 170,
    rulesTruncated: false,
    rulesDropped: false,
    promptTokensUpperBound: 2345,
  };

  it('rules columns default to "rules off" (rows written like SWR-005B/006)', async () => {
    const stored = await repo.insert(usageRow());
    expect(stored).toMatchObject({
      rulesEnabled: false,
      rulesVersion: null,
      rulesCount: 0,
      rulesIds: null,
      rulesChars: 0,
      rulesTokensEstimate: 0,
      rulesTruncated: false,
      rulesDropped: false,
      promptTokensUpperBound: null,
    });
    expect(ruleIdsOf(stored)).toEqual([]);
  });

  it('TC-COST-01: stores version, ids (JSON array), count, chars, token estimate, flags and the prompt bound', async () => {
    const stored = await repo.insert(usageRow(RULES_ON));
    const row = await prisma.aiUsage.findUniqueOrThrow({ where: { id: stored.id } });
    expect(row).toMatchObject({
      rulesEnabled: true,
      rulesVersion: 'fake@1:0123456789ab',
      rulesCount: 2,
      rulesIds: '["fake:impl.engine-scope","fake:turn.pass"]',
      rulesChars: 170,
      rulesTokensEstimate: 43,
      rulesTruncated: false,
      rulesDropped: false,
      promptTokensUpperBound: 2345,
      inputTokens: 1200,
      outputTokens: 80,
      estimatedCostMicroUsd: 142,
      durationMs: 900,
    });
    expect(ruleIdsOf(row)).toEqual(['fake:impl.engine-scope', 'fake:turn.pass']);
  });

  it('TC-COST-02: truncated and dropped rows', async () => {
    const truncated = await repo.insert(usageRow({ ...RULES_ON, rulesTruncated: true }));
    const dropped = await repo.insert(
      usageRow({
        rulesEnabled: true,
        rulesVersion: 'fake@1:0123456789ab',
        rulesDropped: true,
        promptTokensUpperBound: 999,
      }),
    );
    expect(truncated).toMatchObject({ rulesTruncated: true, rulesCount: 2 });
    expect(dropped).toMatchObject({
      rulesEnabled: true,
      rulesDropped: true,
      rulesCount: 0,
      rulesIds: null,
      rulesChars: 0,
      rulesVersion: 'fake@1:0123456789ab',
    });
  });

  it.each<[string, Partial<NewAiUsageRow>]>([
    ['dropped with ids', { ...RULES_ON, rulesDropped: true }],
    ['ids without chars', { ...RULES_ON, rulesChars: 0 }],
    ['chars without ids', { ...RULES_ON, rulesIds: [] }],
    ['duplicate ids', { ...RULES_ON, rulesIds: ['a:b', 'a:b'] }],
    ['65 ids', { ...RULES_ON, rulesIds: Array.from({ length: 65 }, (_, i) => `a:${i}`) }],
    ['id over 128', { ...RULES_ON, rulesIds: ['x'.repeat(129)] }],
    ['ids without version', { ...RULES_ON, rulesVersion: null }],
    ['bad version', { ...RULES_ON, rulesVersion: 'v1' }],
    ['off with ids', { ...RULES_ON, rulesEnabled: false }],
    ['off with version', { rulesVersion: 'fake@1:0123456789ab' }],
    ['off but dropped', { rulesDropped: true }],
    ['wrong token estimate', { ...RULES_ON, rulesTokensEstimate: 1 }],
    ['chars over 12000', { ...RULES_ON, rulesChars: 12_001 }],
    ['count given directly', { rulesCount: 1 } as unknown as Partial<NewAiUsageRow>],
    ['rule text column', { rulesText: '[a:b] text' } as unknown as Partial<NewAiUsageRow>],
  ])('rejects inconsistent rules columns (%s) and writes nothing', async (_name, overrides) => {
    await expect(repo.insert(usageRow(overrides))).rejects.toBeInstanceOf(InvalidAiUsageRowError);
    expect(await prisma.aiUsage.count()).toBe(0);
  });

  it('TC-COST-04: the AiUsage table has no column for prompt / instructions / situation / rule text / reason / key', async () => {
    const columns = await prisma.$queryRawUnsafe<{ name: string; type: string }[]>(
      `PRAGMA table_info('AiUsage')`,
    );
    const names = columns.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'rulesEnabled',
        'rulesVersion',
        'rulesCount',
        'rulesIds',
        'rulesChars',
        'rulesTokensEstimate',
        'rulesTruncated',
        'rulesDropped',
        'promptTokensUpperBound',
      ]),
    );
    for (const name of names) {
      expect(name).not.toMatch(
        /prompt(?!TokensUpperBound)|instruction|situation|text|reason(?!ingTokens)|content|message|apiKey|secret/i,
      );
    }
    // a stored rules row holds ids only: its longest text value is the id list
    await repo.insert(usageRow(RULES_ON));
    const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "AiUsage"`);
    const strings = Object.values(raw[0]!).filter((v): v is string => typeof v === 'string');
    expect(Math.max(...strings.map((v) => v.length))).toBe(
      JSON.stringify(RULES_ON.rulesIds).length,
    );
  });

  it('listByBudgetKey: the LAST n rows of the key in time order; other keys excluded', async () => {
    const at = (min: number) => new Date(Date.UTC(2026, 10, 20, 12, min));
    for (const min of [3, 1, 4, 2, 5]) {
      await repo.insert(usageRow({ createdAt: at(min), durationMs: min }));
    }
    await repo.insert(usageRow({ budgetKey: 'other', createdAt: at(9), durationMs: 9 }));
    expect((await repo.listByBudgetKey('dev-diagnostics', 3)).map((r) => r.durationMs)).toEqual([
      3, 4, 5,
    ]);
    expect((await repo.listByBudgetKey('dev-diagnostics', 50)).map((r) => r.durationMs)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(await repo.listByBudgetKey('never-used', 10)).toEqual([]);
    await expect(repo.listByBudgetKey('dev-diagnostics', 0)).rejects.toBeInstanceOf(RangeError);
    await expect(repo.listByBudgetKey('dev-diagnostics', 1.5)).rejects.toBeInstanceOf(RangeError);
  });

  it('ruleIdsOf tolerates a value that is not a JSON array of strings', () => {
    expect(ruleIdsOf({ rulesIds: null })).toEqual([]);
    expect(ruleIdsOf({ rulesIds: 'not json' })).toEqual([]);
    expect(ruleIdsOf({ rulesIds: '{"a":1}' })).toEqual([]);
    expect(ruleIdsOf({ rulesIds: '[1,2]' })).toEqual([]);
    expect(ruleIdsOf({ rulesIds: '["a:b"]' })).toEqual(['a:b']);
  });
});
