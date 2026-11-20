import { z } from 'zod';
import type { KbEntry, KbEntryStatus, KnowledgeBase } from './schema';
import { compareStrings, formatCitation, oneLine } from './text';

// ---- Rules Context contract (SWR-008 C-1) ----
// Defined here (and re-exported by the platform package root) because rules-kb sources may import only zod and their own
// modules; the provider of this folder implements `RulesContextProvider`.

/** Limits of the Rules Context contract (SWR-008 C-1). */
export const RULES_CONTEXT_LIMITS = {
  maxCharsMin: 1000,
  maxCharsMax: 12_000,
  maxCharsDefault: 6000,
  ruleIdMax: 128,
  maxRuleIds: 64,
  commandTypesMax: 16,
  tagsMax: 8,
} as const;

/** Same limits as `AUTOMATION_LIMITS.actorMax / phaseMax / typeMax` (checked by a test). */
const SELECTION_TEXT_LIMITS = { actorMax: 64, phaseMax: 64, typeMax: 64 } as const;

/** Decision tag: lowercase kebab, ≤ 32 chars. */
export const RULES_TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** `<gameId>@<formatVersion>:<first 12 hex of sha256(canonical JSON of the entries)>` (QD-5). */
export const RULES_VERSION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*@\d+:[0-9a-f]{12}$/;

/** True when `text` has no control characters except `\n` (same predicate as the automation contract). */
function hasNoControlCharsExceptNewline(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c < 0x20 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f)) return false;
  }
  return true;
}

const NO_CONTROL = { message: 'control characters are not allowed (except \\n)' };

/** Non-empty text ≤ `max`, no control characters except `\n`. */
const text = (max: number) =>
  z.string().min(1).max(max).refine(hasNoControlCharsExceptNewline, NO_CONTROL);

/** Strictly ascending (therefore unique) in the locale-independent order of `compareStrings`. */
function isSortedUnique(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (compareStrings(values[i - 1]!, values[i]!) >= 0) return false;
  }
  return true;
}

/**
 * Input of a rules selection (R-1, QD-7). Built ONLY by `rulesSelectionInputOf` from a validated decision point:
 * every field is information public to both sides. No state, no candidates, no session ids (type-level guarantee).
 */
export const RulesSelectionInputSchema = z
  .strictObject({
    actor: text(SELECTION_TEXT_LIMITS.actorMax),
    phase: text(SELECTION_TEXT_LIMITS.phaseMax),
    /** Sorted, unique (checked); from `point.rulesQuery.commandTypes` only. */
    commandTypes: z
      .array(text(SELECTION_TEXT_LIMITS.typeMax))
      .max(RULES_CONTEXT_LIMITS.commandTypesMax),
    /** Sorted, unique (checked); from `point.rulesQuery.tags` only. */
    tags: z.array(z.string().regex(RULES_TAG_PATTERN)).max(RULES_CONTEXT_LIMITS.tagsMax),
    maxChars: z.int().min(1).max(RULES_CONTEXT_LIMITS.maxCharsMax),
  })
  .superRefine((input, ctx) => {
    for (const key of ['commandTypes', 'tags'] as const) {
      if (!isSortedUnique(input[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be sorted ascending and unique`,
        });
      }
    }
  });
export type RulesSelectionInput = z.infer<typeof RulesSelectionInputSchema>;

/** Result of a rules selection: one line per rule, `ruleIds` in line order. */
export const RulesContextResultSchema = z
  .strictObject({
    /** One line per rule: `[<id>] <title>: <text> (RR p.9)`; '' when nothing was selected. No control chars except \n. */
    text: z
      .string()
      .max(RULES_CONTEXT_LIMITS.maxCharsMax)
      .refine(hasNoControlCharsExceptNewline, NO_CONTROL),
    /** Ids in line order, unique, each ≤ ruleIdMax. */
    ruleIds: z
      .array(z.string().min(1).max(RULES_CONTEXT_LIMITS.ruleIdMax))
      .max(RULES_CONTEXT_LIMITS.maxRuleIds),
    truncated: z.boolean(),
    rulesVersion: z.string().regex(RULES_VERSION_PATTERN),
  })
  .superRefine((result, ctx) => {
    if (new Set(result.ruleIds).size !== result.ruleIds.length) {
      ctx.addIssue({ code: 'custom', path: ['ruleIds'], message: 'rule ids must be unique' });
    }
    if ((result.text === '') !== (result.ruleIds.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'text must be empty exactly when ruleIds is empty',
      });
      return;
    }
    if (result.text === '') return;
    const lines = result.text.split('\n');
    if (lines.length !== result.ruleIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'text must have exactly one line per rule id',
      });
      return;
    }
    lines.forEach((line, i) => {
      if (!line.startsWith(`[${result.ruleIds[i]}] `)) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message: `line ${i + 1} must start with "[<ruleIds[${i}]>] "`,
        });
      }
    });
  });
export type RulesContextResult = z.infer<typeof RulesContextResultSchema>;

/** One game's rules selection (built once at server start). Pure and deterministic; never sees a game state. */
export interface RulesContextProvider {
  readonly rulesVersion: string;
  /** Length of the pinned (mandatory) lines joined by '\n' — the smallest usable `maxChars` (QD-3). */
  readonly requiredChars: number;
  /** @throws RangeError when `input.maxChars < requiredChars`; ZodError for an invalid input (program error). */
  selectRules(input: RulesSelectionInput): RulesContextResult;
}

// ---- Low-level builder (SWR-005C C-3; SWR-008 C-5 options) ----

export interface RulesContextOptions {
  phase?: string;
  commandTypes?: string[];
  side?: string;
  /** Entry ids that must come first (in this order), regardless of `appliesTo`/`side`. */
  include?: string[];
  /** Integer > 0; `text.length` never exceeds it. */
  maxChars: number;
  /** SWR-008: entries with these statuses never enter the context, even via `include` (QD-4). Default: []. */
  excludeStatuses?: readonly KbEntryStatus[];
  /** SWR-008: the LAST group (decision tags, R-2 step 5): these ids, `id asc`, same ai/side/status filters. Default: []. */
  tagRuleIds?: readonly string[];
}

export interface RulesContext {
  text: string;
  /** Ids of the entries whose lines made it into `text`, in output order. */
  ruleIds: string[];
  /** `true` when at least one candidate line did not fit. */
  truncated: boolean;
}

/** `[<id>] <title>: <text> (RR p.9; FAQ p.1)` + ` (unverified)` for `needs-review`. */
export function formatContextLine(entry: KbEntry): string {
  const labels = [...new Set(entry.sources.map(formatCitation))];
  const cites = labels.length > 0 ? ` (${labels.join('; ')})` : '';
  const unverified = entry.status === 'needs-review' ? ' (unverified)' : '';
  return `[${entry.id}] ${oneLine(entry.title)}: ${oneLine(entry.text)}${cites}${unverified}`;
}

/**
 * Compact rules text for an AI prompt (C-3, C-4 Q-4). Candidates are entries with `ai !== 'none'` and a status
 * not in `excludeStatuses`: `include` ∪ `ai: 'core'` ∪ entries whose `appliesTo.commands` intersect
 * `commandTypes` ∪ entries whose `appliesTo.phases` contain `phase` ∪ `tagRuleIds`. An entry whose
 * `appliesTo.sides` does not contain `side` is dropped (unless included explicitly). Group order: include
 * (argument order) → core → commands → phase → tags, `id asc` inside a group; an entry appears once (first group).
 * Lines are added until the first one that does not fit; only whole lines are dropped.
 */
export function buildRulesContext(kb: KnowledgeBase, options: RulesContextOptions): RulesContext {
  const { maxChars } = options;
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new RangeError(`maxChars must be an integer > 0, got ${String(maxChars)}`);
  }

  const byId = new Map<string, KbEntry>();
  for (const e of kb.entries) if (!byId.has(e.id)) byId.set(e.id, e);
  const excluded = new Set<KbEntryStatus>(options.excludeStatuses ?? []);
  const eligible = (e: KbEntry) => e.ai !== 'none' && !excluded.has(e.status);
  const sideOk = (e: KbEntry) =>
    options.side === undefined ||
    !e.appliesTo?.sides?.length ||
    e.appliesTo.sides.includes(options.side);

  const ordered: KbEntry[] = [];
  const taken = new Set<string>();
  const take = (e: KbEntry) => {
    if (taken.has(e.id)) return;
    taken.add(e.id);
    ordered.push(e);
  };

  for (const id of options.include ?? []) {
    const e = byId.get(id);
    if (e && eligible(e)) take(e);
  }
  const sorted = [...byId.values()]
    .filter((e) => eligible(e) && sideOk(e))
    .sort((a, b) => compareStrings(a.id, b.id));
  const commands = new Set(options.commandTypes ?? []);
  for (const e of sorted) if (e.ai === 'core') take(e);
  for (const e of sorted) {
    if (e.appliesTo?.commands?.some((c) => commands.has(c))) take(e);
  }
  if (options.phase !== undefined) {
    const phase = options.phase;
    for (const e of sorted) if (e.appliesTo?.phases?.includes(phase)) take(e);
  }
  const tagIds = new Set(options.tagRuleIds ?? []);
  for (const e of sorted) if (tagIds.has(e.id)) take(e);

  let text = '';
  const ruleIds: string[] = [];
  let truncated = false;
  for (const e of ordered) {
    const line = formatContextLine(e);
    const next = text === '' ? line : `${text}\n${line}`;
    if (next.length > maxChars) {
      truncated = true;
      break;
    }
    text = next;
    ruleIds.push(e.id);
  }
  return { text, ruleIds, truncated };
}
