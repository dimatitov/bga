/**
 * SWR-008 W8 (plan-backend §8.2): `AiUsage` accounting of a benchmark run, kept in memory. The rows go through the
 * production `AiUsageRepository` (the same validation, rules columns, `rulesCount`, token estimate) over an in-memory
 * table instead of the database, so a benchmark never touches the sessions' accounting or their budgets, and its
 * rows are exactly what the server would have stored for the same requests (TC-MEAS-04).
 *
 * Also the `BudgetUsageSource` of the run's own `BudgetService` (the hard cost limit of a real run).
 */
import type { PrismaClient } from '@prisma/client';
import {
  AiUsageRepository,
  type AiUsageRecord,
  type NewAiUsageRow,
} from '../ai/ai-usage.repository';
import type { BudgetUsageSource } from '../ai/budget.service';

type StoredData = Omit<AiUsageRecord, 'createdAt'> & { createdAt?: Date };

export class InMemoryAiUsageStore implements BudgetUsageSource {
  readonly #rows: AiUsageRecord[] = [];
  readonly #repository: AiUsageRepository;

  /** `now`: creation time of a row (fixed in tests → deterministic rows). */
  constructor(now: () => Date = () => new Date()) {
    const rows = this.#rows;
    const table = {
      create: ({ data }: { data: StoredData }): Promise<AiUsageRecord> => {
        const record: AiUsageRecord = { ...data, createdAt: data.createdAt ?? now() };
        rows.push(record);
        return Promise.resolve(record);
      },
    };
    // Only `create` is used by `insert`; reads are answered by this class from the same rows.
    this.#repository = new AiUsageRepository({
      aiUsage: table as unknown as PrismaClient['aiUsage'],
    });
  }

  /** Validated insert (throws `InvalidAiUsageRowError` like the database repository). */
  insert(row: NewAiUsageRow): Promise<AiUsageRecord> {
    return this.#repository.insert(row);
  }

  /** Σ `estimatedCostMicroUsd` of the key (the budget's spent amount). */
  sumCostMicroUsd(budgetKey: string): Promise<number> {
    let sum = 0;
    for (const row of this.#rows) if (row.budgetKey === budgetKey) sum += row.estimatedCostMicroUsd;
    return Promise.resolve(sum);
  }

  /** Rows in insertion order (a copy). */
  rows(): AiUsageRecord[] {
    return [...this.#rows];
  }

  get size(): number {
    return this.#rows.length;
  }

  /** The row at `index` (insertion order), or `undefined`. */
  at(index: number): AiUsageRecord | undefined {
    return this.#rows[index];
  }
}
