/**
 * Orchestration of one AI decision (SWR-005B, plan-backend §5.6; AC-02, AC-04, AC-06, AC-07). Framework-free: the
 * Nest module builds it with `useFactory`. Order:
 *   1. provider: `'mock'` requested or OpenAI disabled → mock; otherwise OpenAI;
 *   2. (openai) model by role; no pricing → 503 `errors.aiPricingUnknown` (no network at all);
 *   3. (openai) model availability (free `GET /v1/models/{id}`, cached) → 503 / 502 before any paid call;
 *   4. (openai) budget reservation of the worst case → `BudgetExceededError` → 429 + a `budget_exceeded` row;
 *   5. `provider.makeDecision` (retries inside the provider);
 *   6. `validateDecision` — the single acceptance point for every provider (id ∈ legal list, reason trim/300);
 *   7. one `AiUsage` row for every outcome (insert, one retry on failure), THEN release of the reservation;
 *   8. `{ decision, budget }`.
 * Nothing is executed: the layer never sees or changes game state.
 */
import { ERROR_MESSAGE_KEYS, usdToMicroUsd, type AiErrorCode } from '@bga/platform';
import { ApiError } from '../common/api-error';
import type { OpenAIConfig } from '../config/env';
import { emitAiLog, formatAiSummaryLine } from './ai-log';
import { AiFailure } from './ai.errors';
import type { AiUsageRepository, AiUsageStatus, NewAiUsageRow } from './ai-usage.repository';
import {
  emptyUsage,
  type AIDecisionContext,
  type AIDecisionResult,
  type AIModelRole,
  type AIProvider,
  type AIProviderId,
  type AiRuntime,
  type AIUsage,
} from './ai.types';
import {
  BudgetExceededError,
  type BudgetService,
  type BudgetSnapshot,
  type Reservation,
} from './budget.service';
import { validateDecision } from './decision-validator';
import type { ModelAvailabilityService } from './model-availability.service';
import { modelForRole, ROLE_DEFAULTS } from './model-roles';
import { pricingFor, PRICING_VERSION, worstCaseReserveMicroUsd } from './pricing';
import { buildPrompt, upperBoundInputTokens } from './prompt';
import { MOCK_MODEL_ID } from './providers/mock.provider';
import { clampMaxRetries } from './retry';

export type RequestedProvider = 'auto' | 'mock';

export interface AiDecisionOutcome {
  /** Validated decision (id from the legal list, normalised reason). */
  decision: AIDecisionResult;
  budget: BudgetSnapshot;
}

export interface AiDecisionServiceDeps {
  openai: OpenAIConfig;
  mock: AIProvider;
  /** `null` when OpenAI is disabled. */
  openaiProvider: AIProvider | null;
  /** `null` when OpenAI is disabled. */
  availability: ModelAvailabilityService | null;
  budget: BudgetService;
  usage: Pick<AiUsageRepository, 'insert'>;
  runtime: AiRuntime;
}

const MIN_ACTIONS = 2;
const MAX_ACTIONS = 10;

/** Codes the decision path can produce (`AI_DEV_FORBIDDEN` comes only from the dev guard, before the service). */
type DecisionErrorCode = Exclude<AiErrorCode, 'AI_DEV_FORBIDDEN'>;

const STATUS_BY_CODE: Readonly<Record<DecisionErrorCode, AiUsageStatus>> = {
  AI_INVALID_DECISION: 'invalid_decision',
  AI_TIMEOUT: 'timeout',
  AI_RATE_LIMITED: 'rate_limited',
  AI_PROVIDER_ERROR: 'provider_error',
  AI_NOT_CONFIGURED: 'not_configured',
  AI_BUDGET_EXCEEDED: 'budget_exceeded',
};

/** Usage status of a failure. A code outside the decision path is a programming error, never a silently wrong row. */
export function usageStatusFor(code: AiErrorCode): AiUsageStatus {
  if (code === 'AI_DEV_FORBIDDEN') {
    throw new Error(`AiErrorCode ${code} cannot be produced by the decision path`);
  }
  return STATUS_BY_CODE[code];
}

/** Thrown when the accounting row cannot be stored even after one retry (→ 500, nothing leaks). */
export class AiUsageWriteError extends Error {
  constructor() {
    super('AiUsage row could not be stored');
    this.name = 'AiUsageWriteError';
  }
}

export class AiDecisionService {
  constructor(private readonly deps: AiDecisionServiceDeps) {}

  /** Provider that `requested` resolves to under the current configuration. */
  resolveProvider(requested: RequestedProvider): AIProviderId {
    return requested === 'mock' || !this.deps.openai.enabled || !this.deps.openaiProvider
      ? 'mock'
      : 'openai';
  }

  /** Budget limit in micro-USD, or `null` when OpenAI is disabled (AM-BE-9). */
  limitMicroUsd(): number | null {
    return this.deps.openai.enabled ? usdToMicroUsd(this.deps.openai.maxCostPerSessionUsd) : null;
  }

  snapshot(budgetKey: string): Promise<BudgetSnapshot> {
    return this.deps.budget.snapshot(budgetKey, this.limitMicroUsd());
  }

  /**
   * Runs one decision. Resolves with the validated decision and the budget snapshot, rejects with an `AiFailure`
   * (mapped to the platform envelope by the caller), an `ApiError` (invalid context) or `AiUsageWriteError`.
   */
  async decide(ctx: AIDecisionContext, requested: RequestedProvider): Promise<AiDecisionOutcome> {
    assertContext(ctx);
    const providerId = this.resolveProvider(requested);
    const decision =
      providerId === 'mock' ? await this.decideMock(ctx) : await this.decideOpenAI(ctx);
    return { decision, budget: await this.snapshot(ctx.budgetKey) };
  }

  private async decideMock(ctx: AIDecisionContext): Promise<AIDecisionResult> {
    return this.runProvider(this.deps.mock, ctx, MOCK_MODEL_ID, null);
  }

  private async decideOpenAI(ctx: AIDecisionContext): Promise<AIDecisionResult> {
    const { openai } = this.deps;
    const provider = this.deps.openaiProvider;
    const availability = this.deps.availability;
    const model = modelForRole(ctx.role, openai);
    if (!openai.enabled || !provider || !availability || model === null) {
      throw await this.recordFailure(
        ctx,
        'openai',
        model ?? '-',
        AiFailure.notConfigured(ctx.role),
      );
    }
    // 2. No price → the cost cannot be bounded: refuse before any network call.
    if (pricingFor(model) === null) {
      throw await this.recordFailure(
        ctx,
        'openai',
        model,
        AiFailure.pricingUnknown(ctx.role, model),
      );
    }
    // 3. Availability (free, cached). Unknown → 502 network, no paid call.
    try {
      await availability.requireAvailable(model, ctx.role);
    } catch (err) {
      throw await this.recordFailure(ctx, 'openai', model, toFailure(err).with({ attempts: 0 }));
    }
    // 4. Worst-case reservation (outside any network call; the per-key lock is held for one SUM).
    const reserveMicroUsd = this.reserveFor(ctx, model);
    const limitMicroUsd = usdToMicroUsd(openai.maxCostPerSessionUsd);
    let reservation: Reservation;
    try {
      reservation = await this.deps.budget.reserve(ctx.budgetKey, reserveMicroUsd, limitMicroUsd);
    } catch (err) {
      if (!(err instanceof BudgetExceededError)) throw err;
      const failure = AiFailure.budgetExceeded({
        budgetKey: err.budgetKey,
        spentMicroUsd: err.spentMicroUsd,
        limitMicroUsd: err.limitMicroUsd,
        remainingMicroUsd: Math.max(0, err.limitMicroUsd - err.spentMicroUsd - err.heldMicroUsd),
        requiredMicroUsd: err.reserveMicroUsd,
      });
      throw await this.recordFailure(ctx, 'openai', model, failure);
    }
    return this.runProvider(provider, ctx, model, reservation);
  }

  /** Steps 5–7: call, validate, record, release. */
  private async runProvider(
    provider: AIProvider,
    ctx: AIDecisionContext,
    rowModel: string,
    reservation: Reservation | null,
  ): Promise<AIDecisionResult> {
    let settled: { ok: true; result: AIDecisionResult } | { ok: false; failure: AiFailure };
    try {
      const raw = await provider.makeDecision(ctx);
      const checked = validateDecision(
        { selectedActionId: raw.selectedActionId, reason: raw.reason },
        ctx.availableActions.map((a) => a.id),
      );
      if (checked.ok) {
        settled = { ok: true, result: { ...raw, ...checked.decision } };
      } else {
        const failure = AiFailure.invalidDecision(checked.reason, {
          attempts: raw.attempts,
          usage: raw.usage,
          costMicroUsd: raw.estimatedCostMicroUsd,
          durationMs: raw.durationMs,
          role: ctx.role,
          model: rowModel,
        });
        this.logRejected(provider.id, rowModel, ctx, failure);
        settled = { ok: false, failure };
      }
    } catch (err) {
      settled = { ok: false, failure: toFailure(err) };
    }

    let recorded = false;
    try {
      if (settled.ok) {
        const r = settled.result;
        await this.insertRow(
          rowFor(ctx, provider.id, rowModel, 'ok', {
            attempts: r.attempts,
            usage: r.usage,
            costMicroUsd: provider.id === 'mock' ? 0 : r.estimatedCostMicroUsd,
            durationMs: r.durationMs,
            errorCode: null,
          }),
        );
      } else {
        const f = settled.failure;
        await this.insertRow(
          rowFor(ctx, provider.id, rowModel, usageStatusFor(f.code), {
            attempts: f.attempts,
            usage: f.usage,
            costMicroUsd: provider.id === 'mock' ? 0 : f.costMicroUsd,
            durationMs: f.durationMs,
            errorCode: f.code,
          }),
        );
      }
      recorded = true;
    } finally {
      // After the insert: the short double count is conservative (never an undercount). If the row could not be
      // stored (AiUsageWriteError) the possibly paid call is not in Σ AiUsage, so the worst-case hold is KEPT for the
      // life of the process instead of being released (never an undercount; INTEGRATION seam fix).
      if (recorded) reservation?.release();
    }

    if (!settled.ok) throw settled.failure;
    return settled.result;
  }

  private reserveFor(ctx: AIDecisionContext, model: string): number {
    const ids = ctx.availableActions.map((a) => a.id);
    const reserve = worstCaseReserveMicroUsd(
      model,
      upperBoundInputTokens(buildPrompt(ctx), ids),
      ROLE_DEFAULTS[ctx.role].maxOutputTokens,
      clampMaxRetries(this.deps.openai.maxRetries),
    );
    // pricingFor() was checked before; keep the type honest.
    if (reserve === null) throw AiFailure.pricingUnknown(ctx.role, model);
    return reserve;
  }

  /** Writes the row of a failure that happened before any attempt and returns the failure to throw. */
  private async recordFailure(
    ctx: AIDecisionContext,
    provider: AIProviderId,
    model: string,
    failure: AiFailure,
  ): Promise<AiFailure> {
    await this.insertRow(
      rowFor(ctx, provider, model, usageStatusFor(failure.code), {
        attempts: 0,
        usage: emptyUsage(),
        costMicroUsd: 0,
        durationMs: 0,
        errorCode: failure.code,
      }),
    );
    emitAiLog(
      this.deps.runtime.logSink,
      formatAiSummaryLine({
        provider,
        model,
        role: ctx.role,
        attempts: 0,
        result: 'fail',
        code: failure.code,
        durationMs: 0,
        usage: emptyUsage(),
        costMicroUsd: 0,
        budgetKey: ctx.budgetKey,
      }),
    );
    return failure;
  }

  private logRejected(
    provider: AIProviderId,
    model: string,
    ctx: AIDecisionContext,
    f: AiFailure,
  ): void {
    emitAiLog(
      this.deps.runtime.logSink,
      formatAiSummaryLine({
        provider,
        model,
        role: ctx.role,
        attempts: f.attempts,
        result: 'fail',
        code: f.code,
        durationMs: f.durationMs,
        usage: f.usage,
        costMicroUsd: f.costMicroUsd,
        budgetKey: ctx.budgetKey,
      }),
    );
  }

  /** One retry, then a logged (data-free) error and `AiUsageWriteError`. */
  private async insertRow(row: NewAiUsageRow): Promise<void> {
    try {
      await this.deps.usage.insert(row);
      return;
    } catch {
      // retry once below
    }
    try {
      await this.deps.usage.insert(row);
    } catch (err) {
      const name = err instanceof Error ? err.name : typeof err;
      emitAiLog(this.deps.runtime.logSink, `ai.usage settled=fail error=${safeName(name)}`);
      throw new AiUsageWriteError();
    }
  }
}

function safeName(name: string): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : '?';
}

function toFailure(err: unknown): AiFailure {
  if (err instanceof AiFailure) return err;
  return AiFailure.providerError('unknown', { sdkErrorName: 'UnknownError' });
}

/** The service re-checks what the DTO already guarantees (2..10 actions, unique ids). */
function assertContext(ctx: AIDecisionContext): void {
  const ids = ctx.availableActions.map((a) => a.id);
  const n = ids.length;
  if (n < MIN_ACTIONS || n > MAX_ACTIONS || new Set(ids).size !== n) {
    throw new ApiError('VALIDATION', ERROR_MESSAGE_KEYS.validation, {
      issues: [
        {
          path: ['scenario', 'availableActions'],
          code: 'invalid_actions',
          message: 'availableActions must hold 2..10 actions with unique ids',
        },
      ],
    });
  }
}

function rowFor(
  ctx: AIDecisionContext,
  provider: AIProviderId,
  model: string,
  status: AiUsageStatus,
  v: {
    attempts: number;
    usage: AIUsage;
    costMicroUsd: number;
    durationMs: number;
    errorCode: string | null;
  },
): NewAiUsageRow {
  const budgetExceeded = status === 'budget_exceeded';
  const usage = budgetExceeded ? emptyUsage() : v.usage;
  return {
    budgetKey: ctx.budgetKey,
    provider,
    model,
    role: ctx.role satisfies AIModelRole,
    status,
    attempts: budgetExceeded ? 0 : v.attempts,
    inputTokens: usage.inputTokens,
    cachedInputTokens: Math.min(usage.cachedInputTokens, usage.inputTokens),
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    estimatedCostMicroUsd: budgetExceeded ? 0 : v.costMicroUsd,
    pricingVersion: PRICING_VERSION,
    durationMs: Math.max(0, Math.round(v.durationMs)),
    errorCode: v.errorCode,
  };
}
