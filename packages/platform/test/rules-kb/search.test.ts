import { describe, expect, it } from 'vitest';
import { createRulesSearch, formatCitation, parseKnowledgeBase } from '../../src/rules-kb';
import { fixtureInput, fixtureKb } from './fixture';

const ids = (hits: { entry: { id: string } }[]) => hits.map((h) => h.entry.id);

describe('createRulesSearch (AC-8, TC-F-02)', () => {
  const search = createRulesSearch(fixtureKb());

  it.each([
    ['Who takes the first turn?', 'star-forge:turn.order'],
    ['Can a forge be built on an asteroid?', 'star-forge:build.place-forge'],
    ['How do I win the game?', 'star-forge:victory.score'],
    ['How is combat resolved with dice?', 'star-forge:combat.resolve'],
    ['Can I pass after I started building?', 'star-forge:turn.pass-timing'],
    ['строительство', 'star-forge:build.place-forge'],
    ['очерёдность', 'star-forge:turn.order'],
  ])('%j → %s first', (query, expected) => {
    expect(ids(search.search(query))[0]).toBe(expected);
  });

  it('returns citations source + page + label in data order (TC-Q-19)', () => {
    const [hit] = search.search('forge errata');
    expect(hit?.entry.id).toBe('star-forge:build.place-forge-errata');
    expect(hit?.citations).toEqual([
      { sourceId: 'SFQ', page: 2, section: 'Errata', label: 'SFQ p.2' },
    ]);
    expect(formatCitation({ sourceId: 'RR', page: 9 })).toBe('RR p.9');
  });

  it('filters by kind, category (with descendants), status and limit (TC-Q-18)', () => {
    expect(ids(search.search('forge', { kinds: ['clarification'] }))).toEqual([
      'star-forge:build.place-forge-errata',
    ]);
    const inTurn = ids(search.search('forge', { categories: ['turn'] }));
    expect(inTurn.sort()).toEqual([
      'star-forge:build.place-forge',
      'star-forge:build.place-forge-errata',
    ]);
    expect(ids(search.search('forge', { categories: ['setup'] }))).toEqual([]);
    expect(ids(search.search('turn', { status: ['needs-review'] }))).toEqual([
      'star-forge:turn.pass-timing',
    ]);
    expect(search.search('forge', { limit: 1 })).toHaveLength(1);
    expect(search.search('forge', { limit: 0 })).toEqual([]);
  });

  it('default limit is 5; scores are positive and sorted', () => {
    const hits = search.search('player ship forge sector turn combat station board');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(5);
    for (let k = 1; k < hits.length; k += 1) {
      expect(hits[k - 1]!.score).toBeGreaterThanOrEqual(hits[k]!.score);
    }
    expect(hits.every((h) => h.score > 0)).toBe(true);
  });

  it.each(['', '   ', 'the of and to', '?!...', 'xyzzy qwerty'])(
    'meaningless query %j → [] (TC-Q-20)',
    (query) => {
      expect(search.search(query)).toEqual([]);
    },
  );

  it('is deterministic; equal scores are ordered by id (TC-Q-17)', () => {
    const query = 'forge sector ships';
    expect(search.search(query)).toEqual(search.search(query));
    expect(createRulesSearch(fixtureKb()).search(query)).toEqual(search.search(query));

    const input = fixtureInput();
    const twin = { ...input.entries[0]!, id: 'star-forge:setup.aaa' };
    input.entries.push(twin);
    const hits = createRulesSearch(parseKnowledgeBase(input)).search('home station corner');
    expect(ids(hits).slice(0, 2)).toEqual(['star-forge:setup.aaa', 'star-forge:setup.board']);
    expect(hits[0]!.score).toBe(hits[1]!.score);
  });
});
