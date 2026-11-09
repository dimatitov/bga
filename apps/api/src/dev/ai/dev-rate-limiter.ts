/**
 * Process-wide sliding-window rate limit of the dev AI endpoints (SWR-005B, AM-BE-11, Clarification Q-24):
 * at most `paidPerMinute` paid decisions (provider resolves to OpenAI) and `totalPerMinute` requests of any kind
 * (status, mock and paid decisions) per 60 s. A refused request is not counted. The clock is injectable.
 */
export const DEV_RATE_WINDOW_MS = 60_000;
export const DEFAULT_DEV_RATE_LIMIT = Object.freeze({ paidPerMinute: 10, totalPerMinute: 120 });

export interface DevRateLimit {
  paidPerMinute: number;
  totalPerMinute: number;
}

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

export class DevRateLimiter {
  private readonly total: number[] = [];
  private readonly paid: number[] = [];

  constructor(
    private readonly limit: DevRateLimit = DEFAULT_DEV_RATE_LIMIT,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Checks and, when allowed, records one request. */
  hit(paid: boolean): RateDecision {
    const now = this.now();
    prune(this.total, now);
    prune(this.paid, now);
    const waits: number[] = [];
    if (this.total.length >= this.limit.totalPerMinute) waits.push(waitMs(this.total, now));
    if (paid && this.paid.length >= this.limit.paidPerMinute) waits.push(waitMs(this.paid, now));
    if (waits.length > 0) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
    }
    this.total.push(now);
    if (paid) this.paid.push(now);
    return { ok: true };
  }
}

function prune(stamps: number[], now: number): void {
  while (stamps.length > 0 && (stamps[0] ?? 0) <= now - DEV_RATE_WINDOW_MS) stamps.shift();
}

/** Time until the oldest stamp leaves the window (an empty window with limit 0 waits a full window). */
function waitMs(stamps: number[], now: number): number {
  const oldest = stamps[0];
  return oldest === undefined ? DEV_RATE_WINDOW_MS : oldest + DEV_RATE_WINDOW_MS - now;
}
