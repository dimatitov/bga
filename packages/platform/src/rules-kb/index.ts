// Public entry of the rules-kb subpath: game-agnostic rules knowledge base (SWR-005C C-1..C-4, SWR-008 C-5).
// Only zod, pure.
export * from './schema';
export { KB_ISSUE_CODES, type KbIssue, type KbIssueCode } from './issues';
export { KnowledgeBaseParseError, parseKnowledgeBase } from './parse';
export { validateKnowledgeBase, type KbValidationResult } from './validate';
export { type KnowledgeBaseIo } from './validate-io';
export { formatCitation } from './text';
export {
  createRulesSearch,
  type RulesCitation,
  type RulesSearch,
  type RulesSearchHit,
  type RulesSearchOptions,
} from './search';
export {
  RULES_CONTEXT_LIMITS,
  RULES_TAG_PATTERN,
  RULES_VERSION_PATTERN,
  RulesContextResultSchema,
  RulesSelectionInputSchema,
  buildRulesContext,
  formatContextLine,
  type RulesContext,
  type RulesContextOptions,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
} from './context';
// SWR-008 C-5: the knowledge-base implementation of `RulesContextProvider` (pure TS: sha256, canonical JSON).
export {
  KnowledgeBaseConfigError,
  KnowledgeBaseValidationError,
  createKnowledgeBaseRulesProvider,
  knowledgeBaseRulesVersion,
  type KnowledgeBaseRulesOptions,
} from './provider';
export { canonicalJson, sha256Hex } from './canonical-json';
export {
  renderCoverageMatrix,
  renderDiscrepancies,
  renderRulesIndex,
  type KbRenderOptions,
} from './render';
