import { randomUUID } from 'node:crypto';
import {
  AIModelRoleSchema,
  AIProviderIdSchema,
  RULES_CONTEXT_LIMITS,
  RULES_VERSION_PATTERN,
} from '@bga/platform';
import type { AiUsage, PrismaClient } from '@prisma/client';
import { z } from 'zod';

/**
 * `AiUsage` accounting (SWR-005B, plan-backend §5.3/§7, Q-15, AM-BE-7): one row per AI decision request — successful,
 * failed, mock (cost 0) and budget refusals. Money is integer micro-USD only; never stores prompt or response text.
 * Framework-free: `AiModule` (W6) builds it with `PrismaService` (a `PrismaClient`).
 *
 * SWR-008 (AC-12, plan-backend §5): + the rules context of the request — on/off, version, the PUBLIC rule ids (JSON
 * array, AM-BE-2), size (chars + token estimate), truncated / dropped by the prompt limit (QD-9) and the prompt's
 * upper bound of input tokens. All new fields are optional with the "rules off" defaults; never rule text.
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

/** `<gameId>@<formatVersion>:<hash12>`; same bound as the dev diagnostics wire (`rulesVersion` ≤ 96). */
const RULES_VERSION_MAX = 96;

/** `ceil(chars / 4)` — the stored token estimate of a rules block (same as `rulesTokensEstimate` of prompt.ts). */
function tokensEstimateOf(chars: number): number {
  return Math.ceil(chars / 4);
}

interface RulesColumnsInput {
  rulesEnabled: boolean;
  rulesVersion: string | null;
  rulesIds: readonly string[];
  rulesChars: number;
  rulesTokensEstimate?: number | undefined;
  rulesTruncated: boolean;
  rulesDropped: boolean;
}

/** Consistency of the rules columns (plan §5); `null` when consistent. */
function rulesInvariantIssue(row: RulesColumnsInput): string | null {
  const n = row.rulesIds.length;
  if (new Set(row.rulesIds).size !== n) return 'rulesIds must be unique';
  if ((n === 0) !== (row.rulesChars === 0)) return 'rulesChars > 0 exactly when rule ids were sent';
  if (
    row.rulesTokensEstimate !== undefined &&
    row.rulesTokensEstimate !== tokensEstimateOf(row.rulesChars)
  )
    return 'rulesTokensEstimate must be ceil(rulesChars / 4)';
  if (row.rulesDropped && n !== 0) return 'rulesDropped rows send no rules';
  if (!row.rulesEnabled) {
    if (n !== 0 || row.rulesVersion !== null || row.rulesTruncated || row.rulesDropped)
      return 'rules-off rows carry no rules data';
  }
  if (n > 0 && row.rulesVersion === null) return 'rules sent without a rulesVersion';
  return null;
}

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
    // SWR-008 (§5): rules context of the request; defaults = rules off.
    rulesEnabled: z.boolean().default(false),
    rulesVersion: z
      .string()
      .regex(RULES_VERSION_PATTERN)
      .max(RULES_VERSION_MAX)
      .nullable()
      .default(null),
    /** Public rule ids sent, in prompt order (stored as a JSON array; `[]` → NULL). */
    rulesIds: z
      .array(z.string().min(1).max(RULES_CONTEXT_LIMITS.ruleIdMax))
      .max(RULES_CONTEXT_LIMITS.maxRuleIds)
      .readonly()
      .default([]),
    rulesChars: count.max(RULES_CONTEXT_LIMITS.maxCharsMax).default(0),
    /** Omitted → `ceil(rulesChars / 4)`; given → must equal it. */
    rulesTokensEstimate: count.optional(),
    rulesTruncated: z.boolean().default(false),
    rulesDropped: z.boolean().default(false),
    promptTokensUpperBound: count.nullable().default(null),
  })
  .superRefine((row, ctx) => {
    const rulesIssue = rulesInvariantIssue(row);
    if (rulesIssue !== null) ctx.addIssue({ code: 'custom', message: rulesIssue });
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

/**
 * The rule ids of a stored row (`rulesIds` JSON array; NULL → `[]`). A value that is not a JSON array of strings
 * (never written by `insert`) → `[]`.
 */
export function ruleIdsOf(record: Pick<AiUsageRecord, 'rulesIds'>): string[] {
  if (record.rulesIds === null) return [];
  try {
    const parsed: unknown = JSON.parse(record.rulesIds);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed : [];
  } catch {
    return [];
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
    const { id, createdAt, rulesIds, rulesTokensEstimate, ...data } = parsed.data;
    return this.prisma.aiUsage.create({
      data: {
        ...data,
        rulesCount: rulesIds.length,
        rulesIds: rulesIds.length === 0 ? null : JSON.stringify(rulesIds),
        rulesTokensEstimate: rulesTokensEstimate ?? tokensEstimateOf(data.rulesChars),
        id: id ?? randomUUID(),
        ...(createdAt ? { createdAt } : {}),
      },
    });
  }

  /**
   * The LAST `limit` rows of the key, returned in time order (createdAt ascending; ties by id). SWR-008 C-9: the dev
   * diagnostics read (W7). `limit` is a positive integer.
   */
  async listByBudgetKey(budgetKey: string, limit: number): Promise<AiUsageRecord[]> {
    if (!Number.isInteger(limit) || limit < 1)
      throw new RangeError('limit must be a positive integer');
    const rows = await this.prisma.aiUsage.findMany({
      where: { budgetKey },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.reverse();
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
