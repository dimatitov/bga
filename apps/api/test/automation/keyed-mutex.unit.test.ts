/** SWR-006 W7 — `KeyedMutex` (plan-backend §6.2): one holder per key, FIFO, other keys independent, map cleaned up. */
import { describe, expect, it } from 'vitest';
import { KeyedMutex } from '../../src/sessions/automation/keyed-mutex';
import { deferred } from '../support/fake-automation';

describe('KeyedMutex (SWR-006 W7)', () => {
  it('serialises callers of one key in arrival order; other keys run in parallel', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const gate = deferred();
    const a = mutex.runExclusive('s1', async () => {
      order.push('a:start');
      await gate.promise;
      order.push('a:end');
      return 'a';
    });
    const b = mutex.runExclusive('s1', () => {
      order.push('b');
      return Promise.resolve('b');
    });
    const c = mutex.runExclusive('s2', () => {
      order.push('c');
      return Promise.resolve('c');
    });
    expect(await c).toBe('c');
    expect(order).toEqual(['a:start', 'c']);
    expect(mutex.size).toBe(1);
    gate.resolve();
    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
    expect(order).toEqual(['a:start', 'c', 'a:end', 'b']);
    expect(mutex.size).toBe(0);
  });

  it('a failing holder releases the key; its error reaches only its caller', async () => {
    const mutex = new KeyedMutex();
    const failed = mutex.runExclusive('s1', () => Promise.reject(new Error('boom')));
    const next = mutex.runExclusive('s1', () => Promise.resolve(42));
    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe(42);
    expect(mutex.size).toBe(0);
  });
});
