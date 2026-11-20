/**
 * SWR-005C W2 — search over the Rebellion knowledge base for the future Rules Assistant (AC-8; TC-Q-01..20).
 */
import { describe, expect, it } from 'vitest';
import { createRulesSearch } from '@bga/platform/rules-kb';
import { loadKnowledgeBase } from './load-kb';

const kb = loadKnowledgeBase();
const search = createRulesSearch(kb);

/** [question, acceptable entry ids (any of them in the top 3)]. */
const QUESTIONS: Array<[string, string[]]> = [
  [
    'Can units leave a system that contains my leader?',
    ['rebellion:command.move.own-leader-locks'],
  ],
  [
    'Can I activate a system that already has a leader in it?',
    [
      'rebellion:command.activate.system-with-leader',
      'rebellion:command.activate.own-leader-system',
    ],
  ],
  [
    'Can a leader without tactic values activate a system?',
    ['rebellion:command.activate.tactic-values-required'],
  ],
  ['How many ground units can a transport ship carry?', ['rebellion:command.transport.capacity']],
  [
    'Can I move units into a system that was not activated?',
    ['rebellion:command.move.into-activated-from-adjacent'],
  ],
  ['When can I pass during the Command Phase?', ['rebellion:command.pass']],
  ['Who takes the first turn in the Command Phase?', ['rebellion:command.turn-order']],
  [
    'When is the Rebel base revealed?',
    ['rebellion:base.reveal-condition', 'rebellion:base.reveal-timing'],
  ],
  [
    'Can the Rebel player reveal the base voluntarily?',
    ['rebellion:base.voluntary-reveal-timing', 'rebellion:base.voluntary-reveal'],
  ],
  [
    'Do Star Destroyers or the Death Star reveal the Rebel base?',
    [
      'rebellion:base.ships-do-not-reveal',
      'rebellion:base.death-star-does-not-reveal',
      'rebellion:base.reveal-condition',
    ],
  ],
  ['How does the Empire win the game?', ['rebellion:victory.empire']],
  ['How do the Rebels win?', ['rebellion:victory.rebels']],
  ['What happens during the Refresh Phase?', ['rebellion:refresh.steps']],
  ['Can a subjugated system also be neutral?', ['rebellion:loyalty.neutral-errata']],
  [
    'Where are Rebel starting units placed in standard setup?',
    ['rebellion:setup.rebel-units-errata', 'rebellion:setup.standard-rebel-units'],
  ],
  ['раскрытие базы', ['rebellion:base.reveal-condition', 'rebellion:base.reveal-timing']],
];

describe('rules search (AC-8)', () => {
  it('has at least 12 typical questions', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(12);
  });

  it.each(QUESTIONS)('%s', (question, expected) => {
    const hits = search.search(question, { limit: 3 });
    const top = hits.map((h) => h.entry.id);
    expect(
      top.some((id) => expected.includes(id)),
      `top 3: ${top.join(', ')}`,
    ).toBe(true);
  });

  it('returns citations with source and page (TC-Q-19)', () => {
    const [hit] = search.search('Can units leave a system that contains my leader?');
    expect(hit?.citations.length).toBeGreaterThan(0);
    expect(hit?.citations[0]).toEqual(
      expect.objectContaining({ sourceId: 'RR', page: 9, label: 'RR p.9' }),
    );
  });

  it('is deterministic across calls and instances (TC-Q-17)', () => {
    const query = 'When is the Rebel base revealed?';
    const first = search.search(query).map((h) => [h.entry.id, h.score]);
    expect(search.search(query).map((h) => [h.entry.id, h.score])).toEqual(first);
    expect(
      createRulesSearch(kb)
        .search(query)
        .map((h) => [h.entry.id, h.score]),
    ).toEqual(first);
  });

  it('applies kind, category, status and limit filters (TC-Q-18)', () => {
    const clarifications = search.search('reveal base', { kinds: ['clarification'], limit: 2 });
    expect(clarifications.length).toBeGreaterThan(0);
    expect(clarifications.length).toBeLessThanOrEqual(2);
    expect(clarifications.every((h) => h.entry.kind === 'clarification')).toBe(true);

    const command = search.search('leader', { categories: ['command'] });
    const commandTree = new Set(['command', 'activation', 'movement', 'transport']);
    expect(command.length).toBeGreaterThan(0);
    expect(command.every((h) => commandTree.has(h.entry.category))).toBe(true);

    const verified = search.search('leader', { status: ['verified'] });
    expect(verified.every((h) => h.entry.status === 'verified')).toBe(true);
  });

  it('returns nothing for empty or meaningless queries (TC-Q-20)', () => {
    expect(search.search('')).toEqual([]);
    expect(search.search('the of and')).toEqual([]);
    expect(search.search('xyzzy qwerty')).toEqual([]);
  });
});
