/**
 * OpenAI transport (SWR-005B, plan-backend §4; AC-03, AC-05, AC-06). Responses API with a strict JSON schema whose
 * `enum` is the list of legal action ids. The provider only extracts `{ selectedActionId, reason }`; acceptance
 * (membership, reason normalisation) is `validateDecision`, run by the service for every provider.
 *
 * Per role: model from config, `reasoning.effort`, `max_output_tokens` (model-roles.ts). Always `store: false`; no
 * temperature / top_p / tools / metadata / user / previous_response_id. Retries are ours (retry.ts), the SDK has
 * `maxRetries: 0`. Usage, duration and the cost estimate are summed over all attempts and carried by both the
 * result and the failure. Cost is estimated by the CONFIGURED model id, not by the snapshot in the response.
 */
import {
  addUsage,
  emptyUsage,
  type AIDecisionContext,
  type AIDecisionResult,
  type AIProvider,
  type AiRuntime,
  type AIUsage,
} from '../ai.types';
import { AiFailure } from '../ai.errors';
import { emitAiLog, formatAiAttemptLine, formatAiSummaryLine } from '../ai-log';
import { buildDecisionTextFormat, DecisionOutputSchema } from '../decision-schema';
import { requestParamsForRole } from '../model-roles';
import { microUsdToUsd } from '@bga/platform';
import { estimateCostMicroUsd, perAttemptReserveMicroUsd, PRICING_VERSION } from '../pricing';
import { buildPrompt, upperBoundInputTokens } from '../prompt';
import { clampMaxRetries, runWithRetries, willRetry } from '../retry';
import type { EnabledOpenAIConfig, OpenAIClient } from './openai-client';
import { classifySdkError, isNotFound } from './openai-errors';

/** Response fields the provider reads (structural, so the SDK type stays an implementation detail). */
interface ResponseLike {
  id?: string;
  model?: string;
  status?: string;
  output?: ReadonlyArray<{
    type?: string;
    content?: ReadonlyArray<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
    total_tokens?: number;
  } | null;
}

export interface OpenAIProviderDeps {
  openai: EnabledOpenAIConfig;
  /** Lazily created client (openai-client.ts). */
  client: () => OpenAIClient;
  runtime: AiRuntime;
  /** Called on a 404 from `responses.create` (invalidates the availability cache). */
  onModelNotFound?: (model: string) => void;
}

/**
 * Failures of a paid call that may still be billed by OpenAI (AM-BE-8 + review F-2): client-side timeouts (incl. 408 /
 * abort) and connection errors (`network`), because the request may already have reached the API.
 */
export function mayHaveBeenBilled(f: AiFailure): boolean {
  return f.code === 'AI_TIMEOUT' || (f.code === 'AI_PROVIDER_ERROR' && f.reason === 'network');
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** `null` when the response has no usage block. */
export function usageFromResponse(response: ResponseLike): AIUsage | null {
  const u = response.usage;
  if (!u || typeof u !== 'object') return null;
  const reasoning = u.output_tokens_details?.reasoning_tokens;
  const input = count(u.input_tokens);
  const output = count(u.output_tokens);
  return {
    inputTokens: input,
    cachedInputTokens: Math.min(count(u.input_tokens_details?.cached_tokens), input),
    outputTokens: output,
    reasoningTokens: typeof reasoning === 'number' ? count(reasoning) : null,
    totalTokens: typeof u.total_tokens === 'number' ? count(u.total_tokens) : input + output,
  };
}

/** Extracts the decision object, or throws an invalid-decision / provider failure (reason only, no text). */
export function extractDecision(response: ResponseLike): {
  selectedActionId: string;
  reason: string;
} {
  if (response.status === 'incomplete') throw AiFailure.invalidDecision('incomplete');
  if (response.status === 'failed' || response.status === 'cancelled') {
    throw AiFailure.providerError('upstream');
  }
  const message = response.output?.find((item) => item?.type === 'message');
  const content = message?.content ?? [];
  if (content.some((c) => c?.type === 'refusal')) throw AiFailure.invalidDecision('refusal');
  const text = content.find((c) => c?.type === 'output_text')?.text;
  if (typeof text !== 'string') throw AiFailure.invalidDecision('malformed');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw AiFailure.invalidDecision('malformed');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw AiFailure.invalidDecision('malformed');
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.selectedActionId !== 'string' || typeof p.reason !== 'string') {
    throw AiFailure.invalidDecision('malformed');
  }
  const shaped = DecisionOutputSchema.safeParse(parsed);
  if (!shaped.success) throw AiFailure.invalidDecision('schema');
  return shaped.data;
}

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const;

  constructor(private readonly deps: OpenAIProviderDeps) {}

  async makeDecision(ctx: AIDecisionContext): Promise<AIDecisionResult> {
    const { openai, runtime } = this.deps;
    const model = ctx.role === 'strategy' ? openai.strategyModel : openai.tacticalModel;
    const params = requestParamsForRole(ctx.role, model);
    const ids = ctx.availableActions.map((a) => a.id);
    const prompt = buildPrompt(ctx);
    const perAttempt = perAttemptReserveMicroUsd(
      model,
      upperBoundInputTokens(prompt, ids),
      params.maxOutputTokens,
    );
    // No price → the cost cannot be bounded: refuse before any paid call.
    if (perAttempt === null) throw AiFailure.pricingUnknown(ctx.role, model);

    const maxRetries = clampMaxRetries(openai.maxRetries);
    const maxAttempts = maxRetries + 1;
    const client = this.deps.client();
    let usage = emptyUsage();
    let costMicroUsd = 0;
    let durationMs = 0;
    let lastModel = model;

    const body = {
      model,
      instructions: prompt.instructions,
      input: prompt.input,
      text: { format: buildDecisionTextFormat(ids) },
      reasoning: { effort: params.effort },
      max_output_tokens: params.maxOutputTokens,
      store: false,
    };

    const logAttempt = (
      attempt: number,
      started: number,
      result: 'ok' | 'retry' | 'fail',
      extra: {
        code?: string;
        httpStatus?: number;
        sdkError?: string;
        requestId?: string;
        usage?: AIUsage;
        cost?: number;
      },
    ) =>
      emitAiLog(
        runtime.logSink,
        formatAiAttemptLine({
          provider: 'openai',
          model,
          role: ctx.role,
          attempt,
          maxAttempts,
          result,
          code: extra.code,
          httpStatus: extra.httpStatus,
          sdkError: extra.sdkError,
          durationMs: runtime.monotonicNow() - started,
          usage: extra.usage,
          costMicroUsd: extra.cost,
          budgetKey: ctx.budgetKey,
          requestId: extra.requestId,
        }),
      );

    const attemptFn = async (attempt: number) => {
      const started = runtime.monotonicNow();
      let response: ResponseLike;
      try {
        response = (await client.responses.create(body, {
          timeout: openai.timeoutMs,
          maxRetries: 0,
        })) as unknown as ResponseLike;
      } catch (err) {
        durationMs += Math.max(0, Math.round(runtime.monotonicNow() - started));
        let f = classifySdkError(err, { nowMs: Date.now(), role: ctx.role, model });
        // AM-BE-8 (+ review F-2): a client-side timeout or a connection error may happen after the request reached
        // OpenAI (e.g. the connection drops while the response is in flight) and may still be billed. We cannot tell
        // "sent" from "not sent" reliably (pre-send failures such as DNS / ECONNREFUSED are not distinguished on
        // purpose), so both count the worst case of one attempt — the reservation already covers it.
        const attemptCost = mayHaveBeenBilled(f) ? perAttempt : 0;
        costMicroUsd += attemptCost;
        if (isNotFound(err)) this.deps.onModelNotFound?.(model);
        f = f.with({ attempts: attempt });
        logAttempt(attempt, started, willRetry(f, attempt, maxRetries) ? 'retry' : 'fail', {
          code: f.code,
          httpStatus: f.httpStatus,
          sdkError: f.sdkErrorName,
          requestId: f.requestId,
          cost: attemptCost,
        });
        throw f;
      }
      durationMs += Math.max(0, Math.round(runtime.monotonicNow() - started));
      if (typeof response.model === 'string' && response.model.length > 0)
        lastModel = response.model;
      const attemptUsage = usageFromResponse(response);
      // No usage block → tokens 0 but the cost is the worst case of one attempt (conservative).
      const attemptCost = attemptUsage
        ? (estimateCostMicroUsd(model, attemptUsage) ?? perAttempt)
        : perAttempt;
      usage = addUsage(usage, attemptUsage ?? emptyUsage());
      costMicroUsd += attemptCost;
      try {
        const decision = extractDecision(response);
        logAttempt(attempt, started, 'ok', { usage: attemptUsage ?? undefined, cost: attemptCost });
        return decision;
      } catch (err) {
        const f = (err as AiFailure).with({ attempts: attempt });
        logAttempt(attempt, started, 'fail', {
          code: f.code,
          usage: attemptUsage ?? undefined,
          cost: attemptCost,
        });
        throw f;
      }
    };

    try {
      const { value, attempts } = await runWithRetries(attemptFn, {
        maxRetries,
        sleep: runtime.sleep,
        random: runtime.random,
      });
      this.logSummary(ctx, model, attempts, 'ok', undefined, durationMs, usage, costMicroUsd);
      return {
        selectedActionId: value.selectedActionId,
        reason: value.reason,
        provider: 'openai',
        model: lastModel,
        durationMs,
        attempts,
        usage,
        estimatedCostMicroUsd: costMicroUsd,
        estimatedCostUsd: microUsdToUsd(costMicroUsd),
        pricingVersion: PRICING_VERSION,
      };
    } catch (err) {
      const f = (err instanceof AiFailure ? err : classifySdkError(err)).with({
        usage,
        costMicroUsd,
        durationMs,
        role: ctx.role,
        model,
      });
      this.logSummary(ctx, model, f.attempts, 'fail', f.code, durationMs, usage, costMicroUsd);
      throw f;
    }
  }

  private logSummary(
    ctx: AIDecisionContext,
    model: string,
    attempts: number,
    result: 'ok' | 'fail',
    code: string | undefined,
    durationMs: number,
    usage: AIUsage,
    costMicroUsd: number,
  ): void {
    emitAiLog(
      this.deps.runtime.logSink,
      formatAiSummaryLine({
        provider: 'openai',
        model,
        role: ctx.role,
        attempts,
        result,
        code,
        durationMs,
        usage,
        costMicroUsd,
        budgetKey: ctx.budgetKey,
      }),
    );
  }
}
