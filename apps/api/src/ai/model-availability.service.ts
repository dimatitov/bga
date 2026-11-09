/**
 * Model availability via `GET /v1/models/{id}` (SWR-005B, plan-backend §5.5; AC-02; Clarification Q-26).
 * Free (not budgeted). Results: 200 → available (cached 10 min); 404 → not_found (cached 60 s); 401/403 →
 * key_rejected (cached 60 s); network / 5xx / timeout / anything else → unknown (not cached). Concurrent checks of
 * one model share one promise. A 404 from `responses.create` invalidates the cache entry.
 */
import type { AIModelRole } from './ai.types';
import { AiFailure } from './ai.errors';
import { classifySdkError } from './providers/openai-errors';
import type { OpenAIClient } from './providers/openai-client';

export type ModelAvailability = 'available' | 'not_found' | 'key_rejected' | 'unknown';

export const AVAILABLE_TTL_MS = 10 * 60_000;
export const UNAVAILABLE_TTL_MS = 60_000;
export const MODELS_CHECK_TIMEOUT_MS = 5_000;

export interface ModelAvailabilityOptions {
  /** Lazily created OpenAI client. */
  client: () => OpenAIClient;
  monotonicNow?: () => number;
}

interface CacheEntry {
  value: ModelAvailability;
  expiresAt: number;
}

/** `available` of the status endpoint: true / false / null (unknown, not checked). */
export function availabilityFlag(value: ModelAvailability | undefined): boolean | null {
  if (value === 'available') return true;
  if (value === 'not_found' || value === 'key_rejected') return false;
  return null;
}

export class ModelAvailabilityService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<ModelAvailability>>();
  private readonly now: () => number;

  constructor(private readonly options: ModelAvailabilityOptions) {
    this.now = options.monotonicNow ?? (() => performance.now());
  }

  /** Cached value without a network call (`undefined` when not cached or expired). */
  peek(model: string): ModelAvailability | undefined {
    const entry = this.cache.get(model);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(model);
      return undefined;
    }
    return entry.value;
  }

  invalidate(model: string): void {
    this.cache.delete(model);
  }

  check(model: string): Promise<ModelAvailability> {
    const cached = this.peek(model);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inFlight.get(model);
    if (pending) return pending;
    const run = this.fetchAvailability(model).finally(() => this.inFlight.delete(model));
    this.inFlight.set(model, run);
    return run;
  }

  /**
   * For the decision path: resolves when available, otherwise rejects BEFORE any paid call with
   * 503 `errors.aiModelUnavailable` / `errors.aiKeyRejected`, or 502 `AI_PROVIDER_ERROR` (`network`) when unknown.
   */
  async requireAvailable(model: string, role: AIModelRole): Promise<void> {
    const value = await this.check(model);
    if (value === 'available') return;
    if (value === 'not_found') throw AiFailure.modelUnavailable(role, model).with({ attempts: 0 });
    if (value === 'key_rejected') throw AiFailure.keyRejected(role, model).with({ attempts: 0 });
    throw AiFailure.providerError('network', { attempts: 0 });
  }

  private async fetchAvailability(model: string): Promise<ModelAvailability> {
    let value: ModelAvailability;
    const client = this.options.client(); // configuration errors propagate (never cached as "unknown")
    try {
      await client.models.retrieve(model, { timeout: MODELS_CHECK_TIMEOUT_MS, maxRetries: 0 });
      value = 'available';
    } catch (err) {
      const f = classifySdkError(err);
      if (f.code === 'AI_NOT_CONFIGURED' && f.httpStatus === 404) value = 'not_found';
      else if (f.code === 'AI_NOT_CONFIGURED' && (f.httpStatus === 401 || f.httpStatus === 403)) {
        value = 'key_rejected';
      } else value = 'unknown';
    }
    if (value !== 'unknown') {
      this.cache.set(model, {
        value,
        expiresAt: this.now() + (value === 'available' ? AVAILABLE_TTL_MS : UNAVAILABLE_TTL_MS),
      });
    }
    return value;
  }
}
