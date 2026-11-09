/**
 * Internal failure of the AI layer (SWR-005B, plan-backend §3, §6) and its mapping to the platform error envelope.
 * `message` is the error code only — never an SDK message, header, prompt or model text. `toApiError` puts only the
 * allow-listed fields of plan §6.2 into `details`.
 */
import { ERROR_MESSAGE_KEYS, microUsdToUsd, type AiErrorCode } from '@bga/platform';
import { ApiError } from '../common/api-error';
import { emptyUsage, type AIModelRole, type AIUsage } from './ai.types';

/** `details.reason` of AI_PROVIDER_ERROR / AI_INVALID_DECISION (plan §6.1). */
export type AiFailureReason =
  | 'network'
  | 'quota'
  | 'upstream'
  | 'bad_request'
  | 'unknown'
  | 'malformed'
  | 'refusal'
  | 'incomplete'
  | 'schema'
  | 'not_in_actions';

export interface AiBudgetDetails {
  budgetKey: string;
  spentMicroUsd: number;
  limitMicroUsd: number;
  remainingMicroUsd: number;
  requiredMicroUsd: number;
}

export interface AiFailureInit {
  code: AiErrorCode;
  messageKey: string;
  retryable?: boolean;
  /** Server-suggested delay (Retry-After), ms. */
  retryAfterMs?: number;
  reason?: AiFailureReason;
  attempts?: number;
  usage?: AIUsage;
  costMicroUsd?: number;
  durationMs?: number;
  sdkErrorName?: string;
  httpStatus?: number;
  requestId?: string;
  role?: AIModelRole;
  model?: string;
  budget?: AiBudgetDetails;
}

export class AiFailure extends Error {
  readonly code: AiErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly reason: AiFailureReason | undefined;
  readonly attempts: number;
  readonly usage: AIUsage;
  readonly costMicroUsd: number;
  readonly durationMs: number;
  readonly sdkErrorName: string | undefined;
  readonly httpStatus: number | undefined;
  readonly requestId: string | undefined;
  readonly role: AIModelRole | undefined;
  readonly model: string | undefined;
  readonly budget: AiBudgetDetails | undefined;

  constructor(init: AiFailureInit) {
    super(init.code);
    this.name = 'AiFailure';
    this.code = init.code;
    this.messageKey = init.messageKey;
    this.retryable = init.retryable ?? false;
    this.retryAfterMs = init.retryAfterMs;
    this.reason = init.reason;
    this.attempts = init.attempts ?? 1;
    this.usage = init.usage ?? emptyUsage();
    this.costMicroUsd = init.costMicroUsd ?? 0;
    this.durationMs = init.durationMs ?? 0;
    this.sdkErrorName = init.sdkErrorName;
    this.httpStatus = init.httpStatus;
    this.requestId = init.requestId;
    this.role = init.role;
    this.model = init.model;
    this.budget = init.budget;
  }

  /** A copy with some fields replaced (failures are immutable). */
  with(patch: Partial<AiFailureInit>): AiFailure {
    return new AiFailure({ ...this.toInit(), ...patch });
  }

  toInit(): AiFailureInit {
    return {
      code: this.code,
      messageKey: this.messageKey,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      reason: this.reason,
      attempts: this.attempts,
      usage: this.usage,
      costMicroUsd: this.costMicroUsd,
      durationMs: this.durationMs,
      sdkErrorName: this.sdkErrorName,
      httpStatus: this.httpStatus,
      requestId: this.requestId,
      role: this.role,
      model: this.model,
      budget: this.budget,
    };
  }

  // ---- factories for outcomes decided by our own code (not by the SDK) ----

  static invalidDecision(reason: AiFailureReason, patch: Partial<AiFailureInit> = {}): AiFailure {
    return new AiFailure({
      code: 'AI_INVALID_DECISION',
      messageKey: ERROR_MESSAGE_KEYS.aiInvalidDecision,
      reason,
      ...patch,
      retryable: false,
    });
  }

  static providerError(
    reason: AiFailureReason,
    patch: Partial<AiFailureInit> = {},
    retryable = false,
  ): AiFailure {
    return new AiFailure({
      code: 'AI_PROVIDER_ERROR',
      messageKey:
        reason === 'quota' ? ERROR_MESSAGE_KEYS.aiQuota : ERROR_MESSAGE_KEYS.aiProviderError,
      reason,
      retryable,
      ...patch,
    });
  }

  static timeout(patch: Partial<AiFailureInit> = {}, retryable = true): AiFailure {
    return new AiFailure({
      code: 'AI_TIMEOUT',
      messageKey: ERROR_MESSAGE_KEYS.aiTimeout,
      retryable,
      ...patch,
    });
  }

  static rateLimited(patch: Partial<AiFailureInit> = {}, retryable = true): AiFailure {
    return new AiFailure({
      code: 'AI_RATE_LIMITED',
      messageKey: ERROR_MESSAGE_KEYS.aiRateLimited,
      retryable,
      ...patch,
    });
  }

  /** 503 before any paid call: no pricing entry for the configured model. */
  static pricingUnknown(role: AIModelRole, model: string): AiFailure {
    return new AiFailure({
      code: 'AI_NOT_CONFIGURED',
      messageKey: ERROR_MESSAGE_KEYS.aiPricingUnknown,
      attempts: 0,
      role,
      model,
    });
  }

  /** 503: OpenAI disabled / models not configured. */
  static notConfigured(role?: AIModelRole, model?: string): AiFailure {
    return new AiFailure({
      code: 'AI_NOT_CONFIGURED',
      messageKey: ERROR_MESSAGE_KEYS.aiNotConfigured,
      attempts: 0,
      role,
      model,
    });
  }

  static modelUnavailable(role: AIModelRole | undefined, model: string | undefined): AiFailure {
    return new AiFailure({
      code: 'AI_NOT_CONFIGURED',
      messageKey: ERROR_MESSAGE_KEYS.aiModelUnavailable,
      role,
      model,
    });
  }

  static keyRejected(role: AIModelRole | undefined, model: string | undefined): AiFailure {
    return new AiFailure({
      code: 'AI_NOT_CONFIGURED',
      messageKey: ERROR_MESSAGE_KEYS.aiKeyRejected,
      role,
      model,
    });
  }

  static budgetExceeded(budget: AiBudgetDetails): AiFailure {
    return new AiFailure({
      code: 'AI_BUDGET_EXCEEDED',
      messageKey: ERROR_MESSAGE_KEYS.aiBudgetExceeded,
      attempts: 0,
      budget,
    });
  }
}

/** Seconds for a `Retry-After` header / `details.retryAfterSeconds` (rounded up, ≥ 1). */
export function retryAfterSeconds(ms: number | undefined): number | undefined {
  return ms === undefined ? undefined : Math.max(1, Math.ceil(ms / 1000));
}

function budgetDetails(b: AiBudgetDetails): Record<string, string | number> {
  return {
    budgetKey: b.budgetKey,
    spentUsd: microUsdToUsd(b.spentMicroUsd),
    spentMicroUsd: b.spentMicroUsd,
    limitUsd: microUsdToUsd(b.limitMicroUsd),
    limitMicroUsd: b.limitMicroUsd,
    remainingUsd: microUsdToUsd(b.remainingMicroUsd),
    remainingMicroUsd: b.remainingMicroUsd,
    requiredUsd: microUsdToUsd(b.requiredMicroUsd),
    requiredMicroUsd: b.requiredMicroUsd,
  };
}

/** Only the safe fields of plan §6.2 — never SDK messages, request ids, headers or model text. */
export function safeDetails(f: AiFailure): Record<string, string | number> | undefined {
  switch (f.code) {
    case 'AI_NOT_CONFIGURED': {
      const d: Record<string, string> = {};
      if (f.role !== undefined) d.role = f.role;
      if (f.model !== undefined) d.model = f.model;
      return Object.keys(d).length > 0 ? d : undefined;
    }
    case 'AI_BUDGET_EXCEEDED':
      return f.budget ? budgetDetails(f.budget) : undefined;
    case 'AI_RATE_LIMITED': {
      const d: Record<string, number> = {};
      if (f.attempts > 0) d.attempts = f.attempts;
      const s = retryAfterSeconds(f.retryAfterMs);
      if (s !== undefined) d.retryAfterSeconds = s;
      return Object.keys(d).length > 0 ? d : undefined;
    }
    case 'AI_TIMEOUT':
      return { attempts: f.attempts };
    case 'AI_PROVIDER_ERROR':
      return { attempts: f.attempts, reason: f.reason ?? 'unknown' };
    case 'AI_INVALID_DECISION':
      return {
        attempts: f.attempts,
        reason: f.reason ?? 'malformed',
        estimatedCostUsd: microUsdToUsd(f.costMicroUsd),
        estimatedCostMicroUsd: f.costMicroUsd,
      };
    case 'AI_DEV_FORBIDDEN':
      return undefined;
  }
}

/** `AiFailure` → platform `ApiError` (HTTP status from the platform table). */
export function toApiError(f: AiFailure): ApiError {
  return new ApiError(f.code, f.messageKey, safeDetails(f));
}
