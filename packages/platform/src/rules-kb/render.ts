import {
  KbCoverageStatusSchema,
  KbDecisionSchema,
  KbDiscrepancyKindSchema,
  KbEntryKindSchema,
  KbSeveritySchema,
  type KbCategory,
  type KbDiscrepancyRef,
  type KbEntry,
  type KnowledgeBase,
} from './schema';
import { compareStrings, formatCitation, oneLine } from './text';

/** Optional title override and a markdown preamble placed under the title (C-4 Q-BE-3). */
export interface KbRenderOptions {
  title?: string;
  preamble?: string;
}

function header(kb: KnowledgeBase, defaultTitle: string, options: KbRenderOptions): string[] {
  const lines = [
    `<!-- Generated from packages/games/${kb.manifest.gameId}/knowledge — do not edit; UPDATE_KB_DOCS=1 -->`,
    '',
    `# ${oneLine(options.title ?? defaultTitle)}`,
    '',
  ];
  const preamble = options.preamble?.trim();
  if (preamble) lines.push(...preamble.split(/\r?\n/).map((l) => l.trimEnd()), '');
  return lines;
}

/** Joins lines into a document ending with exactly one `\n`, without runs of blank lines. */
function finish(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

/** Text safe for a markdown table cell. */
function cell(text: string): string {
  return oneLine(text).replace(/\|/g, '\\|');
}

function code(text: string): string {
  return `\`${text.replace(/`/g, "'")}\``;
}

function table(head: string[], rows: string[][]): string[] {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
}

function citations(entry: KbEntry): string {
  return [...new Set(entry.sources.map(formatCitation))].join('; ');
}

function countBy<T extends string>(values: readonly T[], order: readonly T[]): string[][] {
  const rows = order.map((key) => [key, String(values.filter((v) => v === key).length)]);
  rows.push(['**total**', String(values.length)]);
  return rows;
}

const byId = <T extends { id: string }>(a: T, b: T) => compareStrings(a.id, b.id);

/** Rules index: sources, counts by kind and all entries grouped by the category tree. */
export function renderRulesIndex(kb: KnowledgeBase, options: KbRenderOptions = {}): string {
  const { manifest } = kb;
  const lines = header(kb, `${manifest.title} — rules index`, options);

  lines.push('## Sources', '');
  lines.push(
    ...table(
      ['Tag', 'Title', 'Kind', 'Version', 'Date', 'Pages', 'Excluded pages', 'Status'],
      manifest.sources.map((s) => [
        code(s.id),
        `[${cell(s.title)}](${s.url})`,
        s.kind,
        cell(s.version),
        cell(s.date),
        String(s.pages),
        (s.excludedPages ?? []).join(', '),
        s.status,
      ]),
    ),
    '',
  );

  lines.push('## Entries by kind', '');
  lines.push(
    ...table(
      ['Kind', 'Entries'],
      countBy(
        kb.entries.map((e) => e.kind),
        KbEntryKindSchema.options,
      ),
    ),
    '',
  );

  const known = new Set(manifest.categories.map((c) => c.id));
  const children = new Map<string, KbCategory[]>();
  const roots: KbCategory[] = [];
  for (const c of manifest.categories) {
    if (c.parent !== undefined && known.has(c.parent) && c.parent !== c.id) {
      const list = children.get(c.parent) ?? [];
      list.push(c);
      children.set(c.parent, list);
    } else {
      roots.push(c);
    }
  }
  const entriesOf = (categoryId: string) =>
    kb.entries.filter((e) => e.category === categoryId).sort(byId);
  const entryLine = (e: KbEntry) => {
    const cites = citations(e);
    const flags = [e.kind, e.status === 'needs-review' ? '**needs-review**' : e.status];
    return `- ${code(e.id)} ${oneLine(e.title)} — ${flags.join(', ')}${cites ? ` (${cites})` : ''}`;
  };

  const visited = new Set<string>();
  const renderCategory = (c: KbCategory, depth: number) => {
    if (visited.has(c.id)) return;
    visited.add(c.id);
    lines.push(`${'#'.repeat(Math.min(2 + depth, 6))} ${oneLine(c.title)} (${code(c.id)})`, '');
    const own = entriesOf(c.id);
    if (own.length > 0) lines.push(...own.map(entryLine), '');
    for (const child of children.get(c.id) ?? []) renderCategory(child, depth + 1);
  };
  for (const root of roots) renderCategory(root, 0);
  // Categories caught in a parent cycle are not reachable from a root: render them flat.
  for (const c of manifest.categories) renderCategory(c, 0);

  const orphans = kb.entries.filter((e) => !known.has(e.category)).sort(byId);
  if (orphans.length > 0) lines.push('## Uncategorized', '', ...orphans.map(entryLine), '');

  return finish(lines);
}

/** Coverage matrix of the engine: summary by status and one row per covered rule. */
export function renderCoverageMatrix(kb: KnowledgeBase, options: KbRenderOptions = {}): string {
  const { coverage } = kb;
  const engine = coverage ? ` (${coverage.engine})` : '';
  const lines = header(kb, `${kb.manifest.title} — coverage matrix${engine}`, options);
  if (!coverage) {
    lines.push('_No coverage data._');
    return finish(lines);
  }
  const titles = new Map(kb.entries.map((e) => [e.id, e.title]));

  lines.push('## Summary', '');
  lines.push(
    ...table(
      ['Status', 'Rules'],
      countBy(
        coverage.items.map((i) => i.status),
        KbCoverageStatusSchema.options,
      ),
    ),
    '',
  );

  lines.push('## Rules', '');
  const items = [...coverage.items].sort((a, b) => compareStrings(a.ruleId, b.ruleId));
  lines.push(
    ...table(
      ['Rule', 'Status', 'Implementation', 'Tests', 'Discrepancies', 'Note'],
      items.map((item) => {
        const title = titles.get(item.ruleId);
        return [
          `${code(item.ruleId)}${title ? `<br>${cell(title)}` : ''}`,
          item.status,
          (item.implementation ?? []).map((i) => `${code(i.path)} ${code(i.symbol)}`).join('<br>'),
          (item.tests ?? []).map((t) => `${code(t.path)} › ${cell(t.name)}`).join('<br>'),
          (item.discrepancyIds ?? []).join(', '),
          cell(item.note ?? ''),
        ];
      }),
    ),
    '',
  );
  return finish(lines);
}

function refLabel(ref: KbDiscrepancyRef): string {
  return typeof ref === 'string' ? code(ref) : formatCitation(ref);
}

/** Discrepancies between the engine and the official rules: summaries and one card per item. */
export function renderDiscrepancies(kb: KnowledgeBase, options: KbRenderOptions = {}): string {
  const lines = header(kb, `${kb.manifest.title} — discrepancies`, options);
  const list = [...kb.discrepancies].sort(byId);
  if (list.length === 0) {
    lines.push('_No discrepancies._');
    return finish(lines);
  }

  lines.push('## Summary', '');
  lines.push(
    '### By kind',
    '',
    ...table(
      ['Kind', 'Count'],
      countBy(
        list.map((d) => d.kind),
        KbDiscrepancyKindSchema.options,
      ),
    ),
    '',
    '### By severity',
    '',
    ...table(
      ['Severity', 'Count'],
      countBy(
        list.map((d) => d.severity),
        KbSeveritySchema.options,
      ),
    ),
    '',
    '### By decision',
    '',
    ...table(
      ['Decision', 'Count'],
      countBy(
        list.map((d) => d.decision),
        KbDecisionSchema.options,
      ),
    ),
    '',
  );

  lines.push('## Items', '');
  for (const d of list) {
    lines.push(`### ${d.id} — ${oneLine(d.title)}`, '');
    lines.push(
      `- **Kind:** ${d.kind}`,
      `- **Severity:** ${d.severity}`,
      `- **Decision:** ${d.decision}`,
      `- **Rules:** ${d.ruleIds.map(code).join(', ')}`,
      `- **Engine behaviour:** ${oneLine(d.engineBehaviour)}`,
      `- **Official behaviour:** ${oneLine(d.officialBehaviour)}`,
      `- **Follow-up:** ${oneLine(d.followUp)}`,
    );
    if (d.refs?.length) lines.push(`- **Refs:** ${d.refs.map(refLabel).join(', ')}`);
    lines.push('');
  }
  return finish(lines);
}
