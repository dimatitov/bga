/**
 * Deterministic, free provider (SWR-005B, plan-backend §5.8; AC-03). Picks the FIRST available action; cost 0; zero
 * usage. Test-only `script` (set only from test code via `createApp({ ai: { mockScript } })`) makes each attempt
 * behave like one step — transport failures go through the same retry loop as OpenAI, so attempt counters are
 * testable without any network.
 */
import { microUsdToUsd } from '@bga/platform';
import {
  emptyUsage,
  type AIDecisionContext,
  type AIDecisionResult,
  type AIProvider,
  type AiRuntime,
  type MockStep,
} from '../ai.types';
import { AiFailure } from '../ai.errors';
import { emitAiLog, formatAiAttemptLine, formatAiSummaryLine } from '../ai-log';
import { PRICING_VERSION } from '../pricing';
import { clampMaxRetries, runWithRetries, willRetry } from '../retry';

export const MOCK_MODEL_ID = 'mock-deterministic-v1';
export const MOCK_REASON = 'Mock provider: deterministic choice of the first available action.';
/** Id returned by the `invalid-action` step; never a legal id (the service rejects it). */
export const MOCK_INVALID_ACTION_ID = '__not_in_list__';

export interface MockProviderDeps {
  runtime: AiRuntime;
  /** Retries for scripted transport failures (config `OPENAI_MAX_RETRIES`, clamped 0..5). */
  maxRetries: number;
  script?: readonly MockStep[];
}

function stepFailure(step: MockStep): AiFailure | null {
  switch (step) {
    case 'malformed':
      return AiFailure.invalidDecision('malformed');
    case 'timeout':
      return AiFailure.timeout();
    case 'rate-limit':
      return AiFailure.rateLimited();
    case 'network':
      return AiFailure.providerError('network', {}, true);
    case 'server-error':
      return AiFailure.providerError('upstream', {}, true);
    case 'ok':
    case 'invalid-action':
      return null;
  }
}

export class MockAIProvider implements AIProvider {
  readonly id = 'mock' as const;
  private readonly script: readonly MockStep[];

  constructor(private readonly deps: MockProviderDeps) {
    this.script = deps.script && deps.script.length > 0 ? [...deps.script] : ['ok'];
  }

  /** Step of a 1-based attempt; the last step repeats. */
  stepFor(attempt: number): MockStep {
    return this.script[Math.min(attempt, this.script.length) - 1] ?? 'ok';
  }

  async makeDecision(ctx: AIDecisionContext): Promise<AIDecisionResult> {
    const { runtime } = this.deps;
    const maxRetries = clampMaxRetries(this.deps.maxRetries);
    let durationMs = 0;

    const attemptFn = async (attempt: number) => {
      const started = runtime.monotonicNow();
      const step = this.stepFor(attempt);
      const failure = stepFailure(step);
      durationMs += Math.max(0, Math.round(runtime.monotonicNow() - started));
      const log = (result: 'ok' | 'retry' | 'fail', code?: string) =>
        emitAiLog(
          runtime.logSink,
          formatAiAttemptLine({
            provider: 'mock',
            model: MOCK_MODEL_ID,
            role: ctx.role,
            attempt,
            maxAttempts: maxRetries + 1,
            result,
            code,
            durationMs: runtime.monotonicNow() - started,
            usage: emptyUsage(),
            costMicroUsd: 0,
            budgetKey: ctx.budgetKey,
          }),
        );
      if (failure) {
        const f = failure.with({ attempts: attempt });
        log(willRetry(f, attempt, maxRetries) ? 'retry' : 'fail', f.code);
        throw f;
      }
      log('ok');
      const first = ctx.availableActions[0];
      if (step === 'invalid-action' || !first) {
        return { selectedActionId: MOCK_INVALID_ACTION_ID, reason: MOCK_REASON };
      }
      return { selectedActionId: first.id, reason: MOCK_REASON };
    };

    try {
      const { value, attempts } = await runWithRetries(attemptFn, {
        maxRetries,
        sleep: runtime.sleep,
        random: runtime.random,
      });
      this.summary(ctx, attempts, 'ok', undefined, durationMs);
      return {
        ...value,
        provider: 'mock',
        model: MOCK_MODEL_ID,
        durationMs,
        attempts,
        usage: emptyUsage(),
        estimatedCostMicroUsd: 0,
        estimatedCostUsd: microUsdToUsd(0),
        pricingVersion: PRICING_VERSION,
      };
    } catch (err) {
      const f = (err as AiFailure).with({ durationMs, usage: emptyUsage(), costMicroUsd: 0 });
      this.summary(ctx, f.attempts, 'fail', f.code, durationMs);
      throw f;
    }
  }

  private summary(
    ctx: AIDecisionContext,
    attempts: number,
    result: 'ok' | 'fail',
    code: string | undefined,
    durationMs: number,
  ): void {
    emitAiLog(
      this.deps.runtime.logSink,
      formatAiSummaryLine({
        provider: 'mock',
        model: MOCK_MODEL_ID,
        role: ctx.role,
        attempts,
        result,
        code,
        durationMs,
        usage: emptyUsage(),
        costMicroUsd: 0,
        budgetKey: ctx.budgetKey,
      }),
    );
  }
}
