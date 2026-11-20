import { type KbEntry, type KnowledgeBase } from './schema';
import { compareStrings, formatCitation, oneLine } from './text';

export interface RulesContextOptions {
  phase?: string;
  commandTypes?: string[];
  side?: string;
  /** Entry ids that must come first (in this order), regardless of `appliesTo`/`side`. */
  include?: string[];
  /** Integer > 0; `text.length` never exceeds it. */
  maxChars: number;
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
 * Compact rules text for an AI prompt (C-3, C-4 Q-4). Candidates are entries with `ai !== 'none'`:
 * `include` ∪ `ai: 'core'` ∪ entries whose `appliesTo.commands` intersect `commandTypes` or whose
 * `appliesTo.phases` contain `phase`. An entry whose `appliesTo.sides` does not contain `side` is dropped
 * (unless included explicitly). Group order: include (argument order) → core → commands → phase, `id asc`
 * inside a group. Lines are added until the first one that does not fit; only whole lines are dropped.
 */
export function buildRulesContext(kb: KnowledgeBase, options: RulesContextOptions): RulesContext {
  const { maxChars } = options;
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new RangeError(`maxChars must be an integer > 0, got ${String(maxChars)}`);
  }

  const byId = new Map<string, KbEntry>();
  for (const e of kb.entries) if (!byId.has(e.id)) byId.set(e.id, e);
  const eligible = (e: KbEntry) => e.ai !== 'none';
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
