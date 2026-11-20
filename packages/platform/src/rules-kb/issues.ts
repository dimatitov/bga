/** Stable issue codes of the knowledge base checks (plan-backend §2.1); used by negative tests. */
export const KB_ISSUE_CODES = [
  // Schema (only in KnowledgeBaseParseError)
  'SCHEMA_INVALID',
  // Manifest
  'CATEGORY_DUPLICATE',
  'CATEGORY_PARENT_UNKNOWN',
  'SOURCE_DUPLICATE',
  'PRODUCT_CONFLICT',
  // Entry
  'ENTRY_ID_FORMAT',
  'ENTRY_ID_PREFIX',
  'ENTRY_ID_DUPLICATE',
  'ENTRY_REF_UNKNOWN',
  'ENTRY_PRODUCT_UNKNOWN',
  'ENTRY_CATEGORY_UNKNOWN',
  'ENTRY_TEXT_TOO_LONG',
  'ENTRY_SOURCE_MISSING',
  'ENTRY_RATIONALE_MISSING',
  'ENTRY_CLARIFICATION_NOT_FAQ',
  'ENTRY_DISCREPANCY_MISSING',
  'ENTRY_DISCREPANCY_UNKNOWN',
  // Source references
  'SOURCE_UNKNOWN',
  'SOURCE_PAGE_OUT_OF_RANGE',
  'SOURCE_PAGE_EXCLUDED',
  'QUOTE_TOO_LONG',
  'QUOTE_BUDGET_EXCEEDED',
  // Completeness
  'SECTION_NOT_COVERED',
  'SECTION_SKIP_REASON_MISSING',
  // Coverage
  'COVERAGE_RULE_UNKNOWN',
  'COVERAGE_RULE_DUPLICATE',
  'COVERAGE_RULE_MISSING',
  'COVERAGE_EVIDENCE_MISSING',
  'COVERAGE_DISCREPANCY_MISSING',
  'COVERAGE_DISCREPANCY_UNKNOWN',
  'COVERAGE_NOTE_MISSING',
  // Discrepancies
  'DISCREPANCY_ID_FORMAT',
  'DISCREPANCY_ID_DUPLICATE',
  'DISCREPANCY_RULE_UNKNOWN',
  'DISCREPANCY_REF_UNKNOWN',
  // io (files / symbols / tests)
  'FILE_MISSING',
  'SYMBOL_NOT_FOUND',
  'TEST_NOT_FOUND',
] as const;

export type KbIssueCode = (typeof KB_ISSUE_CODES)[number];

/** One problem of a knowledge base; `path` is dotted (`entries.12.sources.0.page`). */
export interface KbIssue {
  code: KbIssueCode;
  path: string;
  message: string;
}
