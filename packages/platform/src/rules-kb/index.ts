// Public entry of the rules-kb subpath: game-agnostic rules knowledge base (SWR-005C C-1..C-4). Only zod, pure.
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
export { buildRulesContext, type RulesContext, type RulesContextOptions } from './context';
export {
  renderCoverageMatrix,
  renderDiscrepancies,
  renderRulesIndex,
  type KbRenderOptions,
} from './render';
