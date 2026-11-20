/**
 * In-process mutex per key (SWR-006 plan-backend §6.2): a promise chain per key, the tail is dropped when the last
 * holder leaves. A second caller waits for the first one to finish and then runs its own critical section — it
 * never joins or repeats the first one's work. Between processes the optimistic version guard protects the data.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    try {
      await previous;
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Number of keys with a holder or waiters (tests: the map is cleaned up). */
  get size(): number {
    return this.tails.size;
  }
}
