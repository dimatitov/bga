import { type KbIssue, type KbIssueCode } from './issues';
import { RULES_KB_LIMITS, type KbSource, type KnowledgeBase } from './schema';
import { countChars, countWords } from './text';
import { type KnowledgeBaseIo, validateCoverageIo } from './validate-io';

export interface KbValidationResult {
  /** `true` exactly when `issues` is empty. */
  ok: boolean;
  issues: KbIssue[];
}

const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:\.[a-z0-9-]+)+$/;
const DISCREPANCY_ID = /^DISC-\d{3}$/;

const isBlank = (text: string | undefined): boolean => text === undefined || text.trim() === '';

/**
 * Semantic checks of a parsed knowledge base (C-3): ids, references, sources/pages, limits, kind rules,
 * completeness of source sections, coverage and discrepancies; with `io` also files, symbols and tests.
 * Never stops at the first problem; the order of issues is deterministic (data order, check order).
 */
export function validateKnowledgeBase(kb: KnowledgeBase, io?: KnowledgeBaseIo): KbValidationResult {
  const issues: KbIssue[] = [];
  const add = (code: KbIssueCode, path: string, message: string) =>
    issues.push({ code, path, message });
  const { manifest, entries, coverage, discrepancies } = kb;

  // ---- Manifest ----
  const categoryIds = new Set<string>();
  manifest.categories.forEach((c, i) => {
    if (categoryIds.has(c.id)) {
      add('CATEGORY_DUPLICATE', `manifest.categories.${i}.id`, `duplicate category "${c.id}"`);
    }
    categoryIds.add(c.id);
  });
  manifest.categories.forEach((c, i) => {
    if (c.parent !== undefined && (!categoryIds.has(c.parent) || c.parent === c.id)) {
      add(
        'CATEGORY_PARENT_UNKNOWN',
        `manifest.categories.${i}.parent`,
        `category "${c.id}": parent "${c.parent}" is not another known category`,
      );
    }
  });

  const sources = new Map<string, KbSource>();
  manifest.sources.forEach((s, i) => {
    if (sources.has(s.id)) {
      add('SOURCE_DUPLICATE', `manifest.sources.${i}.id`, `duplicate source "${s.id}"`);
      return;
    }
    sources.set(s.id, s);
    s.excludedPages?.forEach((page, j) => {
      if (page < 1 || page > s.pages) {
        add(
          'SOURCE_PAGE_OUT_OF_RANGE',
          `manifest.sources.${i}.excludedPages.${j}`,
          `source "${s.id}": excluded page ${page} is outside 1..${s.pages}`,
        );
      }
    });
  });

  const products = new Set(manifest.products);
  manifest.excludedProducts.forEach((p, i) => {
    if (products.has(p)) {
      add(
        'PRODUCT_CONFLICT',
        `manifest.excludedProducts.${i}`,
        `product "${p}" is both included and excluded`,
      );
    }
  });

  /** Checks one reference to a source page (entries, exceptions, sections, discrepancy refs). */
  const checkSourceRef = (
    ref: { sourceId: string; page: number },
    path: string,
    owner: string,
  ): void => {
    const source = sources.get(ref.sourceId);
    if (!source) {
      add('SOURCE_UNKNOWN', `${path}.sourceId`, `${owner}: unknown source "${ref.sourceId}"`);
      return;
    }
    if (ref.page < 1 || ref.page > source.pages) {
      add(
        'SOURCE_PAGE_OUT_OF_RANGE',
        `${path}.page`,
        `${owner}: page ${ref.page} of "${source.id}" is outside 1..${source.pages}`,
      );
    } else if (source.excludedPages?.includes(ref.page)) {
      add(
        'SOURCE_PAGE_EXCLUDED',
        `${path}.page`,
        `${owner}: page ${ref.page} of "${source.id}" is excluded`,
      );
    }
  };

  /** Running quote word count per source (quote budget, C-4 Q-2). */
  const quoteWords = new Map<string, number>();
  const overBudget = new Set<string>();
  const checkQuote = (
    ref: { sourceId: string; quote?: string | undefined },
    path: string,
    owner: string,
  ): void => {
    if (ref.quote === undefined) return;
    const words = countWords(ref.quote);
    if (words > RULES_KB_LIMITS.quoteMaxWords) {
      add(
        'QUOTE_TOO_LONG',
        `${path}.quote`,
        `${owner}: quote has ${words} words (max ${RULES_KB_LIMITS.quoteMaxWords})`,
      );
    }
    const total = (quoteWords.get(ref.sourceId) ?? 0) + words;
    quoteWords.set(ref.sourceId, total);
    if (total > RULES_KB_LIMITS.quoteWordsPerSourceMax && !overBudget.has(ref.sourceId)) {
      overBudget.add(ref.sourceId);
      add(
        'QUOTE_BUDGET_EXCEEDED',
        `${path}.quote`,
        `${owner}: quotes of source "${ref.sourceId}" exceed ${RULES_KB_LIMITS.quoteWordsPerSourceMax} words in total`,
      );
    }
  };

  const discrepancyIds = new Set(discrepancies.map((d) => d.id));

  // ---- Entries ----
  const entryIds = new Set(entries.map((e) => e.id));
  const seenEntryIds = new Set<string>();
  const prefix = `${manifest.gameId}:`;
  entries.forEach((e, i) => {
    const at = `entries.${i}`;
    const owner = `entry "${e.id}"`;

    if (!ID_SHAPE.test(e.id)) {
      add(
        'ENTRY_ID_FORMAT',
        `${at}.id`,
        `${owner}: id must look like "${prefix}<segment>.<segment>" (lower-case, dot-separated)`,
      );
    } else if (!e.id.startsWith(prefix)) {
      add('ENTRY_ID_PREFIX', `${at}.id`, `${owner}: id must start with "${prefix}"`);
    }
    if (seenEntryIds.has(e.id)) add('ENTRY_ID_DUPLICATE', `${at}.id`, `${owner}: duplicate id`);
    seenEntryIds.add(e.id);

    const checkRefs = (ids: readonly string[] | undefined, path: string, field: string) =>
      ids?.forEach((id, k) => {
        if (!entryIds.has(id)) {
          add(
            'ENTRY_REF_UNKNOWN',
            `${path}.${k}`,
            `${owner}: ${field} "${id}" is not a known entry id`,
          );
        }
      });
    checkRefs(e.related, `${at}.related`, 'related');
    checkRefs(e.amends, `${at}.amends`, 'amends');

    if (!products.has(e.product)) {
      add(
        'ENTRY_PRODUCT_UNKNOWN',
        `${at}.product`,
        `${owner}: product "${e.product}" is not included`,
      );
    }
    if (!categoryIds.has(e.category)) {
      add('ENTRY_CATEGORY_UNKNOWN', `${at}.category`, `${owner}: unknown category "${e.category}"`);
    }
    const chars = countChars(e.text);
    if (chars > RULES_KB_LIMITS.entryTextMaxChars) {
      add(
        'ENTRY_TEXT_TOO_LONG',
        `${at}.text`,
        `${owner}: text has ${chars} characters (max ${RULES_KB_LIMITS.entryTextMaxChars})`,
      );
    }

    if (e.sources.length === 0) {
      add(
        'ENTRY_SOURCE_MISSING',
        `${at}.sources`,
        `${owner}: at least one source page is required`,
      );
    }
    e.sources.forEach((ref, j) => {
      checkSourceRef(ref, `${at}.sources.${j}`, owner);
      checkQuote(ref, `${at}.sources.${j}`, owner);
    });
    e.exceptions?.forEach((ex, j) => {
      checkRefs(ex.ruleIds, `${at}.exceptions.${j}.ruleIds`, 'exception ruleId');
      ex.sources?.forEach((ref, k) => {
        checkSourceRef(ref, `${at}.exceptions.${j}.sources.${k}`, owner);
        checkQuote(ref, `${at}.exceptions.${j}.sources.${k}`, owner);
      });
    });

    if (e.kind === 'interpretation' && isBlank(e.rationale)) {
      add(
        'ENTRY_RATIONALE_MISSING',
        `${at}.rationale`,
        `${owner}: an interpretation needs a rationale`,
      );
    }
    if (
      e.kind === 'clarification' &&
      e.sources.length > 0 &&
      !e.sources.some((ref) => sources.get(ref.sourceId)?.kind === 'faq')
    ) {
      add(
        'ENTRY_CLARIFICATION_NOT_FAQ',
        `${at}.sources`,
        `${owner}: a clarification needs at least one source of kind "faq"`,
      );
    }
    if (e.kind === 'implementation-note' && (e.discrepancyIds ?? []).length === 0) {
      add(
        'ENTRY_DISCREPANCY_MISSING',
        `${at}.discrepancyIds`,
        `${owner}: an implementation-note must reference a discrepancy`,
      );
    }
    e.discrepancyIds?.forEach((id, k) => {
      if (!discrepancyIds.has(id)) {
        add(
          'ENTRY_DISCREPANCY_UNKNOWN',
          `${at}.discrepancyIds.${k}`,
          `${owner}: unknown discrepancy "${id}"`,
        );
      }
    });
  });

  // ---- Completeness of source sections ----
  const coveredPages = new Set<string>();
  const pageKey = (sourceId: string, page: number) => `${sourceId}\u0000${page}`;
  for (const e of entries) {
    for (const ref of e.sources) coveredPages.add(pageKey(ref.sourceId, ref.page));
    for (const ex of e.exceptions ?? []) {
      for (const ref of ex.sources ?? []) coveredPages.add(pageKey(ref.sourceId, ref.page));
    }
  }
  manifest.sourceSections.forEach((section, i) => {
    const at = `manifest.sourceSections.${i}`;
    const owner = `section "${section.title}" (${section.sourceId} p.${section.page})`;
    checkSourceRef(section, at, owner);
    if (section.coveredBy === 'skip') {
      if (isBlank(section.reason)) {
        add(
          'SECTION_SKIP_REASON_MISSING',
          `${at}.reason`,
          `${owner}: a skipped section needs a reason`,
        );
      }
    } else if (!coveredPages.has(pageKey(section.sourceId, section.page))) {
      add(
        'SECTION_NOT_COVERED',
        at,
        `${owner}: no entry cites this page and the section is not skipped`,
      );
    }
  });

  // ---- Coverage ----
  if (coverage) {
    const covered = new Set<string>();
    coverage.items.forEach((item, i) => {
      const at = `coverage.items.${i}`;
      const owner = `coverage "${item.ruleId}"`;
      if (!entryIds.has(item.ruleId)) {
        add('COVERAGE_RULE_UNKNOWN', `${at}.ruleId`, `${owner}: not a known entry id`);
      }
      if (covered.has(item.ruleId)) {
        add('COVERAGE_RULE_DUPLICATE', `${at}.ruleId`, `${owner}: covered more than once`);
      }
      covered.add(item.ruleId);

      const needsEvidence =
        item.status === 'implemented' || item.status === 'partial' || item.status === 'deviation';
      if (needsEvidence && (item.implementation ?? []).length === 0) {
        add(
          'COVERAGE_EVIDENCE_MISSING',
          `${at}.implementation`,
          `${owner}: status "${item.status}" needs at least one implementation file/symbol`,
        );
      }
      if (needsEvidence && (item.tests ?? []).length === 0) {
        add(
          'COVERAGE_EVIDENCE_MISSING',
          `${at}.tests`,
          `${owner}: status "${item.status}" needs at least one test file/name`,
        );
      }
      const needsDiscrepancy =
        item.status === 'partial' ||
        item.status === 'deviation' ||
        item.status === 'not-implemented';
      if (needsDiscrepancy && (item.discrepancyIds ?? []).length === 0) {
        add(
          'COVERAGE_DISCREPANCY_MISSING',
          `${at}.discrepancyIds`,
          `${owner}: status "${item.status}" needs at least one discrepancy`,
        );
      }
      item.discrepancyIds?.forEach((id, k) => {
        if (!discrepancyIds.has(id)) {
          add(
            'COVERAGE_DISCREPANCY_UNKNOWN',
            `${at}.discrepancyIds.${k}`,
            `${owner}: unknown discrepancy "${id}"`,
          );
        }
      });
      if (item.status === 'not-applicable' && isBlank(item.note)) {
        add('COVERAGE_NOTE_MISSING', `${at}.note`, `${owner}: "not-applicable" needs a note`);
      }
    });
    entries.forEach((e, i) => {
      if (e.kind === 'rule' && !covered.has(e.id)) {
        add(
          'COVERAGE_RULE_MISSING',
          `entries.${i}.id`,
          `entry "${e.id}": rule has no coverage item`,
        );
      }
    });
  }

  // ---- Discrepancies ----
  const seenDiscrepancyIds = new Set<string>();
  discrepancies.forEach((d, i) => {
    const at = `discrepancies.${i}`;
    const owner = `discrepancy "${d.id}"`;
    if (!DISCREPANCY_ID.test(d.id)) {
      add('DISCREPANCY_ID_FORMAT', `${at}.id`, `${owner}: id must look like "DISC-NNN"`);
    }
    if (seenDiscrepancyIds.has(d.id)) {
      add('DISCREPANCY_ID_DUPLICATE', `${at}.id`, `${owner}: duplicate id`);
    }
    seenDiscrepancyIds.add(d.id);
    d.ruleIds.forEach((id, k) => {
      if (!entryIds.has(id)) {
        add('DISCREPANCY_RULE_UNKNOWN', `${at}.ruleIds.${k}`, `${owner}: unknown entry "${id}"`);
      }
    });
    d.refs?.forEach((ref, k) => {
      if (typeof ref === 'string') {
        if (!entryIds.has(ref)) {
          add(
            'DISCREPANCY_REF_UNKNOWN',
            `${at}.refs.${k}`,
            `${owner}: ref "${ref}" is not a known entry id`,
          );
        }
      } else {
        checkSourceRef(ref, `${at}.refs.${k}`, owner);
      }
    });
  });

  // ---- io ----
  if (io && coverage) issues.push(...validateCoverageIo(coverage, io));

  return { ok: issues.length === 0, issues };
}
