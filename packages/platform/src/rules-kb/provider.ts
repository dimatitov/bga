import { canonicalJson, sha256Hex } from './canonical-json';
import {
  RULES_CONTEXT_LIMITS,
  RULES_TAG_PATTERN,
  RulesContextResultSchema,
  RulesSelectionInputSchema,
  buildRulesContext,
  formatContextLine,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
} from './context';
import type { KbIssue } from './issues';
import { parseKnowledgeBase } from './parse';
import type { KbEntry, KbEntryStatus, KnowledgeBase, KnowledgeBaseInput } from './schema';
import { compareStrings } from './text';
import { validateKnowledgeBase } from './validate';

/** Statuses that never enter an AI rules context, not even as pinned entries (A-1, QD-4). */
const EXCLUDED_STATUSES: readonly KbEntryStatus[] = ['needs-review'];

export interface KnowledgeBaseRulesOptions {
  /** First lines of every context, in this order (engine scope, F-7). Each: exists, status 'verified', ai !== 'none'. */
  pinnedRuleIds: readonly string[];
  /** Tag → entry ids (R-2 step 5). Keys match RULES_TAG_PATTERN; ids must exist. Unknown input tags are ignored. */
  tagRules?: Readonly<Record<string, readonly string[]>>;
}

/** `validateKnowledgeBase(kb)` (without io) reported problems; the provider is not built. */
export class KnowledgeBaseValidationError extends Error {
  readonly issues: readonly KbIssue[];

  constructor(issues: readonly KbIssue[]) {
    const head = issues
      .slice(0, 10)
      .map((i) => `${i.code} ${i.path}: ${i.message}`)
      .join('; ');
    const more = issues.length > 10 ? ` (+${issues.length - 10} more)` : '';
    super(`Rules knowledge base failed validation: ${head}${more}`);
    this.name = 'KnowledgeBaseValidationError';
    this.issues = issues;
  }
}

/** The provider options do not fit the knowledge base (bad pinned / tag ids, unusable entries). */
export class KnowledgeBaseConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid rules context configuration: ${problems.join('; ')}`);
    this.name = 'KnowledgeBaseConfigError';
    this.problems = problems;
  }
}

/**
 * Rules set version (QD-5): `<gameId>@<formatVersion>:<first 12 hex of sha256(canonicalJson(entries by id))>`.
 * Uses the parsed entries (defaults applied), so it depends neither on file nor on entry order, and changes with
 * any field of any entry. Coverage and discrepancies are not part of it (they never reach an AI).
 */
export function knowledgeBaseRulesVersion(kb: KnowledgeBase): string {
  const keyed = kb.entries.map((entry) => ({ id: entry.id, json: canonicalJson(entry) }));
  // id first; the canonical text breaks ties (duplicate ids exist only in invalid data) so order never matters.
  keyed.sort((a, b) => compareStrings(a.id, b.id) || compareStrings(a.json, b.json));
  const hash = sha256Hex(`[${keyed.map((k) => k.json).join(',')}]`);
  return `${kb.manifest.gameId}@${kb.manifest.formatVersion}:${hash.slice(0, 12)}`;
}

function hasControlCharsExceptNewline(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c < 0x20 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/** Checks the options against the knowledge base; returns all problems (empty → usable). */
function configProblems(kb: KnowledgeBase, options: KnowledgeBaseRulesOptions): string[] {
  const problems: string[] = [];
  const byId = new Map<string, KbEntry>();
  for (const e of kb.entries) if (!byId.has(e.id)) byId.set(e.id, e);

  const pinned = options.pinnedRuleIds;
  if (new Set(pinned).size !== pinned.length) problems.push('pinnedRuleIds contain duplicates');
  if (pinned.length > RULES_CONTEXT_LIMITS.maxRuleIds) {
    problems.push(`more than ${RULES_CONTEXT_LIMITS.maxRuleIds} pinned rule ids`);
  }
  for (const id of pinned) {
    const e = byId.get(id);
    if (e === undefined) problems.push(`pinned rule "${id}" does not exist`);
    else if (e.status !== 'verified') problems.push(`pinned rule "${id}" is not verified`);
    else if (e.ai === 'none') problems.push(`pinned rule "${id}" has ai "none"`);
  }

  for (const [tag, ids] of Object.entries(options.tagRules ?? {})) {
    if (!RULES_TAG_PATTERN.test(tag)) problems.push(`tag "${tag}" does not match the tag pattern`);
    for (const id of ids) {
      if (!byId.has(id)) problems.push(`rule "${id}" of tag "${tag}" does not exist`);
    }
  }

  // Every line that can be selected must satisfy the result contract (fail at start, not at a decision).
  for (const e of byId.values()) {
    if (e.ai === 'none' || EXCLUDED_STATUSES.includes(e.status)) continue;
    if (e.id.length > RULES_CONTEXT_LIMITS.ruleIdMax) {
      problems.push(`rule id "${e.id}" is longer than ${RULES_CONTEXT_LIMITS.ruleIdMax}`);
    }
    if (hasControlCharsExceptNewline(formatContextLine(e))) {
      problems.push(`rule "${e.id}" contains control characters`);
    }
  }
  return problems;
}

/**
 * Builds the `RulesContextProvider` of one game from its raw knowledge base (SWR-008 C-5): parse → validate
 * (without io) → check the options → compute `rulesVersion` and `requiredChars`. Fail fast: throws
 * `KnowledgeBaseParseError` | `KnowledgeBaseValidationError` | `KnowledgeBaseConfigError`.
 *
 * `selectRules` (R-2): pinned (option order) → `ai: 'core'` → commands → phase → tags (`id asc` inside a group);
 * `ai: 'none'` and `needs-review` never selected (QD-4), side filter for everything but pinned; whole lines only;
 * at most `RULES_CONTEXT_LIMITS.maxRuleIds` lines. Deterministic: equal input → equal bytes.
 */
export function createKnowledgeBaseRulesProvider(
  source: KnowledgeBaseInput,
  options: KnowledgeBaseRulesOptions,
): RulesContextProvider {
  const kb = parseKnowledgeBase(source);
  const validation = validateKnowledgeBase(kb);
  if (!validation.ok) throw new KnowledgeBaseValidationError(validation.issues);

  const problems = configProblems(kb, options);
  const byId = new Map(kb.entries.map((e) => [e.id, e] as const));
  const pinnedRuleIds = [...options.pinnedRuleIds];
  const requiredChars = pinnedRuleIds
    .map((id) => byId.get(id))
    .filter((e): e is KbEntry => e !== undefined)
    .map(formatContextLine)
    .join('\n').length;
  if (requiredChars > RULES_CONTEXT_LIMITS.maxCharsMax) {
    problems.push(
      `pinned rules need ${requiredChars} characters, more than ${RULES_CONTEXT_LIMITS.maxCharsMax}`,
    );
  }
  if (problems.length > 0) throw new KnowledgeBaseConfigError(problems);

  const tagRules = new Map<string, readonly string[]>(
    Object.entries(options.tagRules ?? {}).map(([tag, ids]) => [tag, [...ids]]),
  );
  const rulesVersion = knowledgeBaseRulesVersion(kb);

  function selectRules(input: RulesSelectionInput): RulesContextResult {
    const parsed = RulesSelectionInputSchema.parse(input);
    if (parsed.maxChars < requiredChars) {
      throw new RangeError(
        `maxChars ${parsed.maxChars} is smaller than the pinned rules (${requiredChars} characters)`,
      );
    }
    const tagRuleIds = parsed.tags.flatMap((tag) => tagRules.get(tag) ?? []);
    const ctx = buildRulesContext(kb, {
      phase: parsed.phase,
      commandTypes: parsed.commandTypes,
      side: parsed.actor,
      include: pinnedRuleIds,
      excludeStatuses: EXCLUDED_STATUSES,
      tagRuleIds,
      maxChars: parsed.maxChars,
    });
    let { text, ruleIds, truncated } = ctx;
    if (ruleIds.length > RULES_CONTEXT_LIMITS.maxRuleIds) {
      ruleIds = ruleIds.slice(0, RULES_CONTEXT_LIMITS.maxRuleIds);
      text = text.split('\n').slice(0, RULES_CONTEXT_LIMITS.maxRuleIds).join('\n');
      truncated = true;
    }
    return RulesContextResultSchema.parse({ text, ruleIds, truncated, rulesVersion });
  }

  return { rulesVersion, requiredChars, selectRules };
}
