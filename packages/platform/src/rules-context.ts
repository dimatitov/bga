/**
 * Game-agnostic Rules Context contract (SWR-008 C-1): how the AI layer gets a compact, deterministic block of
 * public game rules for one decision. A game opts in through `ServerGameModule.rules`; a game without it gets no
 * rules block. The selection never sees a game state: its input is built only from the public fields of a
 * validated decision point (R-1, QD-7). Pure: no I/O, no network, no model calls.
 *
 * The schemas and the provider interface are defined next to their implementation in `./rules-kb/context`
 * (rules-kb sources may import only zod and their own modules) and re-exported here unchanged.
 */
import type { AutomationDecisionPoint } from './automation';
import {
  RulesSelectionInputSchema,
  type RulesContextProvider,
  type RulesSelectionInput,
} from './rules-kb/context';

export {
  RULES_CONTEXT_LIMITS,
  RULES_TAG_PATTERN,
  RULES_VERSION_PATTERN,
  RulesContextResultSchema,
  RulesSelectionInputSchema,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
} from './rules-kb/context';

/** Raw knowledge base files as read from disk (already JSON.parse'd). Same shape as `KnowledgeBaseInput` of rules-kb. */
export interface KnowledgeBaseSource {
  manifest: unknown;
  /** All `entries/*.json` arrays concatenated in sorted file-name order. */
  entries: unknown;
  coverage?: unknown;
  discrepancies?: unknown;
}

/** Optional rules support of a game (`ServerGameModule.rules`). A game without it gets no rules block. */
export interface GameRulesSupport {
  /** Directory with manifest.json + entries/*.json: repository-relative POSIX path or absolute (tests). */
  readonly knowledgeBaseDir: string;
  /** Parses + validates (fail fast: throws) and returns the provider. Called once per server start. */
  createRulesContextProvider(source: KnowledgeBaseSource): RulesContextProvider;
}

/** Locale-independent ascending order without duplicates. */
function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The ONLY way to build a selection input (R-1, QD-7): reads `actor`, `phase` and `rulesQuery` of the point;
 * candidates, situation, objective and the fallback are never read. An absent `rulesQuery` gives
 * `commandTypes: []`, `tags: []` (safe default: phase + side only). Lists are sorted and de-duplicated, so the
 * order of the query does not matter. Throws a ZodError for an invalid result (e.g. `maxChars` out of range).
 */
export function rulesSelectionInputOf(
  point: AutomationDecisionPoint,
  maxChars: number,
): RulesSelectionInput {
  const query = point.rulesQuery;
  return RulesSelectionInputSchema.parse({
    actor: point.actor,
    phase: point.phase,
    commandTypes: sortedUnique(query?.commandTypes ?? []),
    tags: sortedUnique(query?.tags ?? []),
    maxChars,
  });
}
