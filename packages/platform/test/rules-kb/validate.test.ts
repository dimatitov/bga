import { describe, expect, it } from 'vitest';
import {
  KB_ISSUE_CODES,
  parseKnowledgeBase,
  validateKnowledgeBase,
  type KbIssueCode,
  type KbValidationResult,
} from '../../src/rules-kb';
import { fixtureInput, fixtureKb, type FixtureInput } from './fixture';

type Mutation = (input: FixtureInput) => void;

/** Fresh fixture → one mutation → parse → validate (without io). */
function validateMutated(mutate: Mutation): KbValidationResult {
  const input = fixtureInput();
  mutate(input);
  return validateKnowledgeBase(parseKnowledgeBase(input));
}

const pick = <T>(list: T[], index: number): T => {
  const item = list[index];
  if (item === undefined) throw new Error(`fixture has no item ${index}`);
  return item;
};
const entry = (input: FixtureInput, index: number) => pick(input.entries, index);
const item = (input: FixtureInput, index: number) => pick(input.coverage.items, index);
const disc = (input: FixtureInput, index: number) => pick(input.discrepancies, index);
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

/** Fixture indexes: entries 0 setup.board, 1 turn.order, 2 build.place-forge, 3 combat.resolve,
 *  4 victory.score, 5 build.place-forge-errata (clarification), 6 turn.pass-timing (interpretation),
 *  7 combat.engine-gap (implementation-note); coverage items 0 setup, 1 turn, 2 build, 3 combat, 4 victory. */
const NEGATIVE: Array<[KbIssueCode, string, string, Mutation]> = [
  // Manifest
  [
    'CATEGORY_DUPLICATE',
    'duplicate category id',
    'manifest.categories.5.id',
    (i) => {
      i.manifest.categories.push({ id: 'combat', title: 'Combat again' });
    },
  ],
  [
    'CATEGORY_PARENT_UNKNOWN',
    'unknown parent',
    'manifest.categories.2.parent',
    (i) => {
      pick(i.manifest.categories, 2).parent = 'nope';
    },
  ],
  [
    'CATEGORY_PARENT_UNKNOWN',
    'parent is itself',
    'manifest.categories.2.parent',
    (i) => {
      pick(i.manifest.categories, 2).parent = 'build';
    },
  ],
  [
    'SOURCE_DUPLICATE',
    'duplicate source id',
    'manifest.sources.2.id',
    (i) => {
      i.manifest.sources.push({ ...pick(i.manifest.sources, 0) });
    },
  ],
  [
    'PRODUCT_CONFLICT',
    'product included and excluded',
    'manifest.excludedProducts.1',
    (i) => {
      i.manifest.excludedProducts?.push('core');
    },
  ],
  // Entry ids
  [
    'ENTRY_ID_FORMAT',
    'upper-case segment',
    'entries.6.id',
    (i) => {
      entry(i, 6).id = 'star-forge:Turn.Pass';
    },
  ],
  [
    'ENTRY_ID_FORMAT',
    'single segment',
    'entries.6.id',
    (i) => {
      entry(i, 6).id = 'star-forge:turn';
    },
  ],
  [
    'ENTRY_ID_FORMAT',
    'empty segment',
    'entries.6.id',
    (i) => {
      entry(i, 6).id = 'star-forge:turn..pass';
    },
  ],
  [
    'ENTRY_ID_FORMAT',
    'no game prefix',
    'entries.6.id',
    (i) => {
      entry(i, 6).id = 'turn.pass';
    },
  ],
  [
    'ENTRY_ID_PREFIX',
    'foreign game prefix',
    'entries.6.id',
    (i) => {
      entry(i, 6).id = 'other-game:turn.pass-timing';
    },
  ],
  [
    'ENTRY_ID_DUPLICATE',
    'duplicate id (path → second)',
    'entries.6.id',
    (i) => {
      entry(i, 6).id = 'star-forge:turn.order';
    },
  ],
  // Entry references
  [
    'ENTRY_REF_UNKNOWN',
    'dangling related',
    'entries.2.related.0',
    (i) => {
      entry(i, 2).related = ['star-forge:does.not-exist'];
    },
  ],
  [
    'ENTRY_REF_UNKNOWN',
    'dangling amends',
    'entries.5.amends.0',
    (i) => {
      entry(i, 5).amends = ['star-forge:does.not-exist'];
    },
  ],
  [
    'ENTRY_REF_UNKNOWN',
    'dangling exception ruleId',
    'entries.2.exceptions.0.ruleIds.0',
    (i) => {
      pick(entry(i, 2).exceptions ?? [], 0).ruleIds = ['star-forge:does.not-exist'];
    },
  ],
  [
    'ENTRY_PRODUCT_UNKNOWN',
    'excluded product',
    'entries.0.product',
    (i) => {
      entry(i, 0).product = 'nebula-expansion';
    },
  ],
  [
    'ENTRY_CATEGORY_UNKNOWN',
    'unknown category',
    'entries.0.category',
    (i) => {
      entry(i, 0).category = 'trade';
    },
  ],
  [
    'ENTRY_TEXT_TOO_LONG',
    'text of 601 characters',
    'entries.0.text',
    (i) => {
      entry(i, 0).text = 'x'.repeat(601);
    },
  ],
  // Kind rules
  [
    'ENTRY_SOURCE_MISSING',
    'no sources',
    'entries.6.sources',
    (i) => {
      entry(i, 6).sources = [];
    },
  ],
  [
    'ENTRY_RATIONALE_MISSING',
    'interpretation without rationale',
    'entries.6.rationale',
    (i) => {
      delete entry(i, 6).rationale;
    },
  ],
  [
    'ENTRY_RATIONALE_MISSING',
    'interpretation with blank rationale',
    'entries.6.rationale',
    (i) => {
      entry(i, 6).rationale = '  ';
    },
  ],
  [
    'ENTRY_CLARIFICATION_NOT_FAQ',
    'clarification cites no faq source',
    'entries.5.sources',
    (i) => {
      pick(i.manifest.sources, 1).kind = 'other';
    },
  ],
  [
    'ENTRY_DISCREPANCY_MISSING',
    'implementation-note without discrepancy',
    'entries.7.discrepancyIds',
    (i) => {
      delete entry(i, 7).discrepancyIds;
    },
  ],
  [
    'ENTRY_DISCREPANCY_UNKNOWN',
    'unknown entry discrepancy',
    'entries.7.discrepancyIds.0',
    (i) => {
      entry(i, 7).discrepancyIds = ['DISC-999'];
    },
  ],
  // Source references (entries, exceptions, discrepancy refs, manifest)
  [
    'SOURCE_UNKNOWN',
    'unknown source',
    'entries.6.sources.0.sourceId',
    (i) => {
      pick(entry(i, 6).sources, 0).sourceId = 'XX';
    },
  ],
  [
    'SOURCE_PAGE_OUT_OF_RANGE',
    'page 0',
    'entries.6.sources.0.page',
    (i) => {
      pick(entry(i, 6).sources, 0).page = 0;
    },
  ],
  [
    'SOURCE_PAGE_OUT_OF_RANGE',
    'page = pages + 1',
    'entries.6.sources.0.page',
    (i) => {
      pick(entry(i, 6).sources, 0).page = 13;
    },
  ],
  [
    'SOURCE_PAGE_OUT_OF_RANGE',
    'exception source page',
    'entries.2.exceptions.0.sources.0.page',
    (i) => {
      pick(pick(entry(i, 2).exceptions ?? [], 0).sources ?? [], 0).page = 13;
    },
  ],
  [
    'SOURCE_PAGE_OUT_OF_RANGE',
    'excluded page outside the source',
    'manifest.sources.1.excludedPages.1',
    (i) => {
      pick(i.manifest.sources, 1).excludedPages = [4, 9];
    },
  ],
  [
    'SOURCE_PAGE_EXCLUDED',
    'excluded page',
    'entries.5.sources.1.page',
    (i) => {
      entry(i, 5).sources.push({ sourceId: 'SFQ', page: 4, section: 'Expansion' });
    },
  ],
  [
    'SOURCE_PAGE_EXCLUDED',
    'discrepancy ref to an excluded page',
    'discrepancies.0.refs.1.page',
    (i) => {
      disc(i, 0).refs = ['star-forge:combat.engine-gap', { sourceId: 'SFQ', page: 4 }];
    },
  ],
  [
    'QUOTE_TOO_LONG',
    'quote of 26 words',
    'entries.1.sources.0.quote',
    (i) => {
      pick(entry(i, 1).sources, 0).quote = words(26);
    },
  ],
  [
    'QUOTE_BUDGET_EXCEEDED',
    'quotes of one source > 400 words',
    'entries.2.exceptions.0.sources.16.quote',
    (i) => {
      // turn.order already quotes 10 words of SFR; 16 more quotes of 25 words → 410 at the 16th.
      const sources = pick(entry(i, 2).exceptions ?? [], 0).sources ?? [];
      for (let k = 0; k < 17; k += 1) {
        sources.push({ sourceId: 'SFR', page: 5, section: 'Asteroids', quote: words(25) });
      }
    },
  ],
  // Completeness
  [
    'SECTION_NOT_COVERED',
    'section without entry',
    'manifest.sourceSections.7',
    (i) => {
      i.manifest.sourceSections?.push({ sourceId: 'SFR', page: 8, title: 'Trading' });
    },
  ],
  [
    'SECTION_SKIP_REASON_MISSING',
    'skip without reason',
    'manifest.sourceSections.5.reason',
    (i) => {
      delete pick(i.manifest.sourceSections ?? [], 5).reason;
    },
  ],
  [
    'SECTION_SKIP_REASON_MISSING',
    'skip with blank reason',
    'manifest.sourceSections.5.reason',
    (i) => {
      pick(i.manifest.sourceSections ?? [], 5).reason = '';
    },
  ],
  // Coverage
  [
    'COVERAGE_RULE_UNKNOWN',
    'coverage of an unknown entry',
    'coverage.items.5.ruleId',
    (i) => {
      i.coverage.items.push({
        ruleId: 'star-forge:no.such',
        status: 'not-applicable',
        note: 'n/a',
      });
    },
  ],
  [
    'COVERAGE_RULE_DUPLICATE',
    'rule covered twice',
    'coverage.items.5.ruleId',
    (i) => {
      i.coverage.items.push({ ...item(i, 0) });
    },
  ],
  [
    'COVERAGE_RULE_MISSING',
    'rule without coverage',
    'entries.4.id',
    (i) => {
      i.coverage.items.splice(4, 1);
    },
  ],
  [
    'COVERAGE_EVIDENCE_MISSING',
    'implemented without implementation',
    'coverage.items.1.implementation',
    (i) => {
      delete item(i, 1).implementation;
    },
  ],
  [
    'COVERAGE_EVIDENCE_MISSING',
    'implemented without tests',
    'coverage.items.1.tests',
    (i) => {
      item(i, 1).tests = [];
    },
  ],
  [
    'COVERAGE_EVIDENCE_MISSING',
    'partial without implementation',
    'coverage.items.2.implementation',
    (i) => {
      delete item(i, 2).implementation;
    },
  ],
  [
    'COVERAGE_EVIDENCE_MISSING',
    'deviation without tests',
    'coverage.items.2.tests',
    (i) => {
      item(i, 2).status = 'deviation';
      delete item(i, 2).tests;
    },
  ],
  [
    'COVERAGE_DISCREPANCY_MISSING',
    'not-implemented without discrepancy',
    'coverage.items.3.discrepancyIds',
    (i) => {
      delete item(i, 3).discrepancyIds;
    },
  ],
  [
    'COVERAGE_DISCREPANCY_MISSING',
    'partial without discrepancy',
    'coverage.items.2.discrepancyIds',
    (i) => {
      item(i, 2).discrepancyIds = [];
    },
  ],
  [
    'COVERAGE_DISCREPANCY_MISSING',
    'deviation without discrepancy',
    'coverage.items.1.discrepancyIds',
    (i) => {
      item(i, 1).status = 'deviation';
    },
  ],
  [
    'COVERAGE_DISCREPANCY_UNKNOWN',
    'unknown coverage discrepancy',
    'coverage.items.3.discrepancyIds.0',
    (i) => {
      item(i, 3).discrepancyIds = ['DISC-999'];
    },
  ],
  [
    'COVERAGE_NOTE_MISSING',
    'not-applicable without note',
    'coverage.items.0.note',
    (i) => {
      delete item(i, 0).note;
    },
  ],
  // Discrepancies
  [
    'DISCREPANCY_ID_FORMAT',
    'bad discrepancy id',
    'discrepancies.1.id',
    (i) => {
      disc(i, 1).id = 'DISC-2';
      item(i, 2).discrepancyIds = ['DISC-2'];
    },
  ],
  [
    'DISCREPANCY_ID_DUPLICATE',
    'duplicate discrepancy id',
    'discrepancies.2.id',
    (i) => {
      i.discrepancies.push({ ...disc(i, 1) });
    },
  ],
  [
    'DISCREPANCY_RULE_UNKNOWN',
    'unknown discrepancy ruleId',
    'discrepancies.1.ruleIds.0',
    (i) => {
      disc(i, 1).ruleIds = ['star-forge:no.such'];
    },
  ],
  [
    'DISCREPANCY_REF_UNKNOWN',
    'string ref is not an entry id',
    'discrepancies.0.refs.0',
    (i) => {
      disc(i, 0).refs = ['star-forge:no.such'];
    },
  ],
];

/** Codes checked elsewhere: SCHEMA_INVALID (parse.test.ts), io codes (validate-io.test.ts). */
const CHECKED_ELSEWHERE: KbIssueCode[] = [
  'SCHEMA_INVALID',
  'FILE_MISSING',
  'SYMBOL_NOT_FOUND',
  'TEST_NOT_FOUND',
];

describe('validateKnowledgeBase — fixture of another game (AC-2, TC-F-01, TC-V-01)', () => {
  it('the star-forge fixture is valid', () => {
    expect(validateKnowledgeBase(fixtureKb())).toEqual({ ok: true, issues: [] });
  });

  it('is deterministic and does not mutate the knowledge base', () => {
    const kb = fixtureKb();
    const before = structuredClone(kb);
    expect(validateKnowledgeBase(kb)).toEqual(validateKnowledgeBase(kb));
    expect(kb).toEqual(before);
  });
});

describe('validateKnowledgeBase — one negative test per issue code (AC-10)', () => {
  it.each(NEGATIVE)('%s: %s', (code, _title, path, mutate) => {
    const result = validateMutated(mutate);
    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code: c, path: p }) => ({ code: c, path: p }))).toEqual([
      { code, path },
    ]);
    expect(result.issues[0]?.message).toMatch(/\S/);
  });

  it('every issue code has a negative test (TC-V-30)', () => {
    const tested = new Set<KbIssueCode>([...NEGATIVE.map(([code]) => code), ...CHECKED_ELSEWHERE]);
    expect(KB_ISSUE_CODES.filter((c) => !tested.has(c))).toEqual([]);
  });

  it('messages name the offending entry and value (scenario 4)', () => {
    const { issues } = validateMutated((i) => {
      entry(i, 2).related = ['star-forge:does.not-exist'];
    });
    expect(issues[0]?.message).toContain('star-forge:build.place-forge');
    expect(issues[0]?.message).toContain('star-forge:does.not-exist');
  });
});

describe('validateKnowledgeBase — boundaries', () => {
  it.each<[string, Mutation]>([
    ['text of exactly 600 characters', (i) => void (entry(i, 0).text = 'x'.repeat(600))],
    ['quote of exactly 25 words', (i) => void (pick(entry(i, 1).sources, 0).quote = words(25))],
    ['page 1', (i) => void (pick(entry(i, 6).sources, 0).page = 1)],
    ['page = pages', (i) => void (pick(entry(i, 6).sources, 0).page = 12)],
    [
      'quotes of one source of exactly 400 words',
      (i) => {
        const sources = pick(entry(i, 2).exceptions ?? [], 0).sources ?? [];
        for (let k = 0; k < 15; k += 1) {
          sources.push({ sourceId: 'SFR', page: 5, section: 'Asteroids', quote: words(25) });
        }
        sources.push({ sourceId: 'SFR', page: 5, section: 'Asteroids', quote: words(15) });
      },
    ],
    ['not-applicable with a note and no discrepancy', () => {}],
    ['no coverage at all', (i) => void Object.assign(i, { coverage: undefined })],
    [
      'clarification citing a faq and a rules page',
      (i) => {
        entry(i, 5).sources.push({ sourceId: 'SFR', page: 4, section: 'Building forges' });
      },
    ],
  ])('%s is valid', (_title, mutate) => {
    expect(validateMutated(mutate)).toEqual({ ok: true, issues: [] });
  });

  it('collects every issue in a deterministic order (TC-V-29)', () => {
    const mutate: Mutation = (i) => {
      item(i, 0).note = '';
      entry(i, 2).related = ['star-forge:does.not-exist'];
      disc(i, 1).ruleIds = ['star-forge:no.such'];
    };
    const first = validateMutated(mutate);
    expect(first.issues.map((x) => x.code)).toEqual([
      'ENTRY_REF_UNKNOWN',
      'COVERAGE_NOTE_MISSING',
      'DISCREPANCY_RULE_UNKNOWN',
    ]);
    expect(validateMutated(mutate)).toEqual(first);
  });
});
