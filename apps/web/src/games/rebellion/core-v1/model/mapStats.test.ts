import { describe, expect, it } from 'vitest';
import { makeCoreView } from '../../test/coreFixtures';
import { mapStats } from './mapStats';

describe('mapStats (SWR-009 K-5)', () => {
  it('fixture map: 6 systems, 5 undirected routes, 2 regions', () => {
    expect(mapStats(makeCoreView().map)).toEqual({ systems: 6, routes: 5, regions: 2 });
  });

  it('counts each pair once, ignores self-links and unknown ids (one-sided links still count)', () => {
    const map = {
      regions: [{ id: 'r', nameKey: 'regions.r' }],
      systems: [
        {
          id: 'a',
          nameKey: 'a',
          regionId: 'r',
          adjacentSystemIds: ['b', 'a', 'zzz'],
          remote: false,
        },
        { id: 'b', nameKey: 'b', regionId: 'r', adjacentSystemIds: ['a', 'c'], remote: false },
        { id: 'c', nameKey: 'c', regionId: 'r', adjacentSystemIds: [], remote: false },
      ],
    };
    expect(mapStats(map)).toEqual({ systems: 3, routes: 2, regions: 1 });
  });
});
