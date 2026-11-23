/** SWR-010 FIX-QA1 (D-1): zone-aware usage of a card (the probe's role depends on the zone it lies in). */
import { describe, expect, it } from 'vitest';
import { cardDefinition } from './catalog';
import { usageForZone } from './cardUsage';

const REFRESH = 'cards.usage.probe-refresh-draw';
const LOCATION = 'cards.usage.probe-base-location';

function probe() {
  const def = cardDefinition('probe-yavin');
  if (!def) throw new Error('probe-yavin is not in the catalog');
  return def;
}

describe('usageForZone', () => {
  it('a probe in the Empire hand: refresh-draw first', () => {
    expect(usageForZone(probe(), 'hand')).toEqual({
      current: REFRESH,
      ordered: [REFRESH, LOCATION],
    });
  });

  it.each(['special', 'revealed'] as const)(
    'a probe in the %s zone (Location): base-location first',
    (kind) => {
      expect(usageForZone(probe(), kind)).toEqual({
        current: LOCATION,
        ordered: [LOCATION, REFRESH],
      });
    },
  );

  it.each(['deck', 'removed', undefined] as const)(
    'a probe in %s: no current role, catalog order',
    (kind) => {
      expect(usageForZone(probe(), kind)).toEqual({ current: null, ordered: [REFRESH, LOCATION] });
    },
  );

  it('a card type without zone roles keeps its first usage as the current one', () => {
    expect(usageForZone({ typeId: 'other', usageKeys: ['a', 'b'] }, 'hand')).toEqual({
      current: 'a',
      ordered: ['a', 'b'],
    });
    expect(usageForZone({ typeId: 'other', usageKeys: [] }, 'hand')).toEqual({
      current: null,
      ordered: [],
    });
  });

  it('a preferred key missing from the catalog entry is not invented', () => {
    expect(usageForZone({ typeId: 'probe', usageKeys: [REFRESH] }, 'special')).toEqual({
      current: null,
      ordered: [REFRESH],
    });
  });
});
