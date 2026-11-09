import { randomUUID } from 'node:crypto';

/**
 * Budget by key (SWR-005B, plan-backend §5.2–§5.3, AC-07, Q-15): worst-case reservation + short per-key serialization.
 * All money is integer micro-USD. Key-generic: the dev endpoint uses only `dev-diagnostics` (AM-BE-6), the service
 * does not care. Holds live in memory of the single API process (as does SQLite); several processes on one DB do not
 * guarantee the limit.
 *
 * Usage (AiDecisionService, W6): `reserve` → call the model outside the lock → `finally { await repo.insert(row);
 * reservation.release(); }` — the short double count between insert and release is conservative (no undercount).
 * The mock provider never reserves.
 */

/** Read side of the usage store the budget needs (implemented by `AiUsageRepository`). */
export interface BudgetUsageSource {
  sumCostMicroUsd(budgetKey: string): Promise<number>;
}

/** An in-memory hold of a worst-case amount. `release()` is idempotent. */
export interface Reservation {
  readonly id: string;
  readonly budgetKey: string;
  readonly amountMicroUsd: number;
  release(): void;
}

export interface BudgetSnapshot {
  budgetKey: string;
  spentMicroUsd: number;
  /** `null` when there is no limit (OpenAI disabled, AM-BE-9). */
  limitMicroUsd: number | null;
  /** `max(0, limit − spent)`; holds are not subtracted. `null` when `limitMicroUsd` is `null`. */
  remainingMicroUsd: number | null;
}

/** `spent + held + reserve ≥ limit` — the request must be refused before any paid call (429 AI_BUDGET_EXCEEDED). */
export class BudgetExceededError extends Error {
  constructor(
    readonly budgetKey: string,
    readonly spentMicroUsd: number,
    readonly heldMicroUsd: number,
    readonly reserveMicroUsd: number,
    readonly limitMicroUsd: number,
  ) {
    super('AI budget exceeded');
    this.name = 'BudgetExceededError';
  }
}

function assertMicroUsd(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative integer (micro-USD)`);
}

export class BudgetService {
  /** Tail of the per-key lock chain. */
  private readonly locks = new Map<string, Promise<void>>();
  /** Active holds: budgetKey → (reservation id → amount). */
  private readonly holds = new Map<string, Map<string, number>>();

  constructor(private readonly usage: BudgetUsageSource) {}

  /**
   * Checks and reserves under the per-key lock (held only for one `SUM` query).
   * @throws BudgetExceededError when `spent + held + amount ≥ limit` (equality refuses too).
   */
  async reserve(
    budgetKey: string,
    amountMicroUsd: number,
    limitMicroUsd: number,
  ): Promise<Reservation> {
    assertMicroUsd('amountMicroUsd', amountMicroUsd);
    assertMicroUsd('limitMicroUsd', limitMicroUsd);
    return this.withKeyLock(budgetKey, async () => {
      const spent = await this.usage.sumCostMicroUsd(budgetKey);
      const held = this.heldMicroUsd(budgetKey);
      if (spent + held + amountMicroUsd >= limitMicroUsd)
        throw new BudgetExceededError(budgetKey, spent, held, amountMicroUsd, limitMicroUsd);
      return this.hold(budgetKey, amountMicroUsd);
    });
  }

  /** Spent so far (Σ AiUsage) and what remains of the limit. Not serialized: a read-only view. */
  async snapshot(budgetKey: string, limitMicroUsd: number | null): Promise<BudgetSnapshot> {
    if (limitMicroUsd !== null) assertMicroUsd('limitMicroUsd', limitMicroUsd);
    const spentMicroUsd = await this.usage.sumCostMicroUsd(budgetKey);
    return {
      budgetKey,
      spentMicroUsd,
      limitMicroUsd,
      remainingMicroUsd: limitMicroUsd === null ? null : Math.max(0, limitMicroUsd - spentMicroUsd),
    };
  }

  /** Σ of active holds of the key (diagnostics/tests). */
  heldMicroUsd(budgetKey: string): number {
    let sum = 0;
    for (const amount of this.holds.get(budgetKey)?.values() ?? []) sum += amount;
    return sum;
  }

  private hold(budgetKey: string, amountMicroUsd: number): Reservation {
    const id = randomUUID();
    let keyHolds = this.holds.get(budgetKey);
    if (!keyHolds) {
      keyHolds = new Map();
      this.holds.set(budgetKey, keyHolds);
    }
    keyHolds.set(id, amountMicroUsd);
    const holds = this.holds;
    return Object.freeze({
      id,
      budgetKey,
      amountMicroUsd,
      release(): void {
        const current = holds.get(budgetKey);
        if (!current?.delete(id)) return;
        if (current.size === 0) holds.delete(budgetKey);
      },
    });
  }

  /** Promise-chain mutex per key: `fn` runs after every earlier holder of the same key finished (resolved or threw). */
  private async withKeyLock<T>(budgetKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(budgetKey) ?? Promise.resolve();
    let unlock!: () => void;
    const current = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const tail = previous.then(() => current);
    this.locks.set(budgetKey, tail);
    await previous;
    try {
      return await fn();
    } finally {
      unlock();
      if (this.locks.get(budgetKey) === tail) this.locks.delete(budgetKey);
    }
  }
}
