import { randomUUID } from 'node:crypto';
import { AIModelRoleSchema, AIProviderIdSchema } from '@bga/platform';
import type { AiUsage, PrismaClient } from '@prisma/client';
import { z } from 'zod';

/**
 * `AiUsage` accounting (SWR-005B, plan-backend §5.3/§7, Q-15, AM-BE-7): one row per AI decision request — successful,
 * failed, mock (cost 0) and budget refusals. Money is integer micro-USD only; never stores prompt or response text.
 * Framework-free: `AiModule` (W6) builds it with `PrismaService` (a `PrismaClient`).
 */

/** Row statuses (mirrors the `AiUsage.status` doc comment in schema.prisma). */
export const AI_USAGE_STATUSES = [
  'ok',
  'invalid_decision',
  'timeout',
  'rate_limited',
  'provider_error',
  'not_configured',
  'budget_exceeded',
] as const;
export type AiUsageStatus = (typeof AI_USAGE_STATUSES)[number];

/** Upper bound of one row's cost: Prisma `Int` is 32-bit (≈ $2147 per row — far above any real request). */
export const AI_USAGE_MAX_ROW_COST_MICRO_USD = 2_147_483_647;

const BUDGET_KEY_MAX = 128;

const count = z.number().int().nonnegative().max(2_147_483_647);

/** Shape accepted by `insert` (local row type; W6 reconciles it with `ai.types.ts`). */
const NewAiUsageRowSchema = z
  .strictObject({
    id: z.uuid().optional(),
    budgetKey: z.string().min(1).max(BUDGET_KEY_MAX),
    provider: AIProviderIdSchema,
    model: z.string().min(1).max(200),
    role: AIModelRoleSchema,
    status: z.enum(AI_USAGE_STATUSES),
    attempts: count,
    inputTokens: count,
    cachedInputTokens: count,
    outputTokens: count,
    reasoningTokens: count.nullable(),
    estimatedCostMicroUsd: count.max(AI_USAGE_MAX_ROW_COST_MICRO_USD),
    pricingVersion: z.string().min(1).max(100),
    durationMs: count,
    errorCode: z.string().min(1).max(64).nullable(),
    createdAt: z.date().optional(),
  })
  .superRefine((row, ctx) => {
    if (row.cachedInputTokens > row.inputTokens)
      ctx.addIssue({ code: 'custom', message: 'cachedInputTokens > inputTokens' });
    if (row.provider === 'mock' && row.estimatedCostMicroUsd !== 0)
      ctx.addIssue({ code: 'custom', message: 'mock rows must cost 0' });
    if (
      row.status === 'budget_exceeded' &&
      (row.attempts !== 0 ||
        row.estimatedCostMicroUsd !== 0 ||
        row.inputTokens + row.cachedInputTokens + row.outputTokens !== 0)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'budget_exceeded rows have 0 attempts, 0 tokens and cost 0',
      });
  });

export type NewAiUsageRow = z.input<typeof NewAiUsageRowSchema>;
export type AiUsageRecord = AiUsage;

/** Thrown by `insert` on a row that breaks the accounting invariants (a programming error, never user input). */
export class InvalidAiUsageRowError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid AiUsage row: ${issues.join('; ')}`);
    this.name = 'InvalidAiUsageRowError';
  }
}

export class AiUsageRepository {
  constructor(private readonly prisma: Pick<PrismaClient, 'aiUsage'>) {}

  /** Inserts one accounting row (validated); returns the stored record. */
  async insert(row: NewAiUsageRow): Promise<AiUsageRecord> {
    const parsed = NewAiUsageRowSchema.safeParse(row);
    if (!parsed.success)
      throw new InvalidAiUsageRowError(
        parsed.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`),
      );
    const { id, createdAt, ...data } = parsed.data;
    return this.prisma.aiUsage.create({
      data: { ...data, id: id ?? randomUUID(), ...(createdAt ? { createdAt } : {}) },
    });
  }

  /** Σ `estimatedCostMicroUsd` of all rows of the key (budget accumulates forever; Q-BE-1). */
  async sumCostMicroUsd(budgetKey: string): Promise<number> {
    const result = await this.prisma.aiUsage.aggregate({
      where: { budgetKey },
      _sum: { estimatedCostMicroUsd: true },
    });
    return result._sum.estimatedCostMicroUsd ?? 0;
  }
}
