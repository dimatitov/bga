import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionDescription } from '@/games/registry';
import { makeFakeGameEntry, makeSessionSummary } from '../test/fakeGame';
import { useSessionLine } from './useSessionLine';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const summary = makeSessionSummary({
  status: 'prototype',
  updatedAt: '2026-11-08T11:55:00.000Z',
  details: { side: 'north' },
});

function lineOf(describeSession?: (s: typeof summary) => SessionDescription) {
  const entry = makeFakeGameEntry(describeSession ? { describeSession } : {});
  const { result } = renderHook(() => useSessionLine(entry, { now: () => NOW }));
  return result.current(summary);
}

describe('useSessionLine (SWR-004 AM-FE-9, plan-frontend §3)', () => {
  it('parts → parts + joined description; time, iso, absolute date and status for the row', () => {
    const line = lineOf(() => [
      { key: 'side', text: 'north' },
      { key: 'round', text: 'R3' },
    ]);
    expect(line.parts).toEqual([
      { key: 'side', text: 'north' },
      { key: 'round', text: 'R3' },
    ]);
    expect(line.description).toBe('north · R3');
    expect(line.time).toMatch(/5 мин/);
    expect(line.iso).toBe('2026-11-08T11:55:00.000Z');
    expect(line.absolute).toMatch(/2026/);
    expect(line.status).toBe('prototype');
    expect(line.text).toBe(`north · R3 · ${line.time}`);
  });

  it('string → description, no parts', () => {
    const line = lineOf(() => 'north side');
    expect(line.parts).toEqual([]);
    expect(line.description).toBe('north side');
  });

  it('invalid parts are dropped (bad key / empty text / not an object)', () => {
    const line = lineOf(
      () =>
        [
          { key: 'Bad Key', text: 'x' },
          { key: 'ok', text: '' },
          'nope',
          { key: 'side', text: 'north' },
        ] as unknown as SessionDescription,
    );
    expect(line.parts).toEqual([{ key: 'side', text: 'north' }]);
  });

  it('no describeSession / [] / throwing → generic text', () => {
    for (const fn of [
      undefined,
      () => [],
      () => {
        throw new Error('boom');
      },
    ]) {
      const line = lineOf(fn);
      expect(line.parts).toEqual([]);
      expect(line.description).toBe('');
      expect(line.text).toBe(`Партия · обновлена ${line.time}`);
    }
  });
});
