import { describe, expect, it } from 'vitest';
import { makeFakeGameEntry } from '../test/fakeGame';
import { canStartSession, catalogOrder, findGameEntry, gameMetaNs } from './selectors';

describe('registry selectors', () => {
  const soonA = makeFakeGameEntry({ id: 'soon-a', status: 'coming_soon' });
  const okB = makeFakeGameEntry({ id: 'ok-b' });
  const soonC = makeFakeGameEntry({ id: 'soon-c', status: 'coming_soon' });
  const okD = makeFakeGameEntry({ id: 'ok-d' });

  it('catalogOrder: available first, registry order inside groups, input untouched (Q-2)', () => {
    const registry = Object.freeze([soonA, okB, soonC, okD]);
    expect(catalogOrder(registry).map((e) => e.definition.id)).toEqual([
      'ok-b',
      'ok-d',
      'soon-a',
      'soon-c',
    ]);
    expect(registry.map((e) => e.definition.id)).toEqual(['soon-a', 'ok-b', 'soon-c', 'ok-d']);
  });

  it('findGameEntry / gameMetaNs / canStartSession', () => {
    expect(findGameEntry([okB], 'ok-b')).toBe(okB);
    expect(findGameEntry([okB], 'nope')).toBeUndefined();
    expect(findGameEntry([okB], undefined)).toBeUndefined();
    expect(gameMetaNs(okB)).toBe('ok-b.meta');
    expect(canStartSession(okB)).toBe(true);
    expect(canStartSession(soonA)).toBe(false);
    expect(canStartSession(makeFakeGameEntry({ id: 'x', withScreens: false }))).toBe(false);
  });
});
