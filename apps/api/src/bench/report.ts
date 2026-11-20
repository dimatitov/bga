/**
 * SWR-008 W8 (plan-backend §8.2): rendering of a `BenchReport`. Pure and deterministic (same report → same bytes);
 * `null` metrics are written as `n/a`. Nothing secret is in a report: no key, no budget key, no session ids, no prompt
 * or model text — only scenario ids, candidate types / ids, metrics and accounting sums.
 */
import { microUsdToUsd } from '@bga/platform';
import {
  BENCH_VARIANTS,
  type BenchDecision,
  type BenchReport,
  type BenchVariant,
  type BenchVariantMetrics,
} from './types';

const NA = 'n/a';

function pct(value: number | null): string {
  return value === null ? NA : `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null, digits = 3): string {
  return value === null ? NA : value.toFixed(digits);
}

function int(value: number | null): string {
  return value === null ? NA : String(Math.round(value));
}

function usd(microUsd: number | null): string {
  return microUsd === null ? NA : `$${microUsdToUsd(Math.round(microUsd)).toFixed(6)}`;
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)];
}

/** `<mode>-<YYYYMMDD-HHmmss>` (UTC) — the file name of a report without extension. */
export function reportFileStem(mode: BenchReport['mode'], at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}`;
  const time = `${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}`;
  return `${mode}-${date}-${time}`;
}

/** Stable JSON of a report (2-space indent, trailing newline). */
export function renderBenchReportJson(report: BenchReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function variantsOf(report: BenchReport): BenchVariant[] {
  return BENCH_VARIANTS.filter((v) => report.variants.includes(v));
}

function scenarioCell(decisions: readonly BenchDecision[]): string {
  if (decisions.length === 0) return NA;
  let score = 0;
  let hits = 0;
  for (const d of decisions) {
    score += d.rubricScore;
    if (d.expectedHit) hits += 1;
  }
  const picks = new Map<string, number>();
  for (const d of decisions) {
    const key = `${d.candidateType}:${d.rubricClass}`;
    picks.set(key, (picks.get(key) ?? 0) + 1);
  }
  const pickText = [...picks.entries()].map(([k, n]) => `${k}×${n}`).join(', ');
  return `${(score / decisions.length).toFixed(2)} (${hits}/${decisions.length}; ${pickText})`;
}

const METRIC_ROWS: readonly (readonly [string, (m: BenchVariantMetrics) => string])[] = [
  ['Decisions', (m) => String(m.decisions)],
  ['Valid decisions', (m) => pct(m.validRate)],
  ['Unjustified PASS', (m) => pct(m.unjustifiedPassRate)],
  ['Goal score (0..1)', (m) => num(m.goalScore)],
  ['Expected action hit', (m) => pct(m.expectedHitRate)],
  [
    'Fallbacks',
    (m) => `${m.fallbacks}${m.fallbackCodes.length ? ` (${m.fallbackCodes.join(', ')})` : ''}`,
  ],
  ['Input tokens (Σ)', (m) => String(m.inputTokens)],
  ['Cached input tokens (Σ)', (m) => String(m.cachedInputTokens)],
  ['Output tokens (Σ)', (m) => String(m.outputTokens)],
  ['Mean rules chars', (m) => num(m.meanRulesChars, 1)],
  ['Cost (Σ)', (m) => usd(m.costMicroUsd)],
  ['Cost per decision', (m) => usd(m.costPerDecisionMicroUsd)],
  ['Latency p50, ms', (m) => int(m.latencyP50Ms)],
  ['Latency p95, ms', (m) => int(m.latencyP95Ms)],
];

export function renderBenchReportMarkdown(report: BenchReport): string {
  const variants = variantsOf(report);
  const lines: string[] = [];
  lines.push(`# AI benchmark report (${report.mode})`, '');
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Model: ${report.model ?? NA} (role \`${report.modelRole}\`)`);
  lines.push(`- Rules version: ${report.rulesVersion ?? NA}`);
  lines.push(
    `- Scenarios: ${report.scenarios}; variants: ${variants.join(', ')}; repeats: ${report.repeats}; decisions: ${report.decisions.length}`,
  );
  lines.push(
    `- Spent: ${usd(report.spentMicroUsd)}; cost cap: ${report.maxUsd === null ? NA : `$${report.maxUsd.toFixed(2)}`}`,
  );
  lines.push(
    `- Stopped: ${report.stopped === null ? 'no (complete run)' : `${report.stopped} (the cost limit refused a call; later model calls were not made)`}`,
  );
  if (report.mode === 'mock') {
    lines.push(
      '- Note: mock mode uses the deterministic mock provider (first candidate, 0 tokens, $0). It checks the harness, it is NOT a measurement of a model.',
    );
  }
  lines.push('');

  lines.push('## Metrics by variant', '');
  lines.push(
    ...table(
      ['Metric', ...variants.map((v) => `\`${v}\``)],
      METRIC_ROWS.map(([label, cell]) => [
        label,
        ...variants.map((v) => {
          const m = report.metrics[v];
          return m === undefined ? NA : cell(m);
        }),
      ]),
    ),
  );
  lines.push('');

  lines.push('## Rules on vs rules off (`openai-rules` − `openai-no-rules`)', '');
  if (report.comparisons.length === 0) {
    lines.push('Not compared: both model variants are needed.');
  } else {
    lines.push(
      'Paired by scenario (per-scenario means), mean Δ with a 95% confidence interval (normal approximation, n = scenarios).',
      'An effect is stated only when the interval excludes 0; otherwise: no measurable effect.',
      '',
    );
    lines.push(
      ...table(
        ['Metric', 'Scenarios', 'Δ', '95% CI', 'Verdict'],
        report.comparisons.map((c) => [
          c.metric,
          String(c.scenarios),
          num(c.delta, 4),
          c.ciLow === null || c.ciHigh === null ? NA : `[${num(c.ciLow, 4)}, ${num(c.ciHigh, 4)}]`,
          c.verdict,
        ]),
      ),
    );
  }
  lines.push('');

  lines.push('## Accounting by rules (`summarizeCostByRules` over the run rows)', '');
  const u = report.usageByRules;
  lines.push(
    ...table(
      [
        'Group',
        'Rows',
        'Cost',
        'Input tokens',
        'Cached',
        'Output tokens',
        'Mean cost',
        'Mean input tokens',
      ],
      (
        [
          ['with rules', u.withRules],
          ['without rules', u.withoutRules],
          ['total', u.total],
        ] as const
      ).map(([label, g]) => [
        label,
        String(g.decisions),
        usd(g.costMicroUsd),
        String(g.inputTokens),
        String(g.cachedInputTokens),
        String(g.outputTokens),
        usd(g.meanCostMicroUsd),
        num(g.meanInputTokens, 1),
      ]),
    ),
  );
  lines.push('');

  lines.push('## By scenario', '');
  lines.push('Cell: mean score (expected hits / decisions; chosen `type:class` × count).', '');
  const scenarioIds = [...new Set(report.decisions.map((d) => d.scenarioId))];
  lines.push(
    ...table(
      ['Scenario', ...variants.map((v) => `\`${v}\``)],
      scenarioIds.map((id) => [
        `\`${id}\``,
        ...variants.map((v) =>
          scenarioCell(report.decisions.filter((d) => d.scenarioId === id && d.variant === v)),
        ),
      ]),
    ),
  );
  lines.push('');
  return `${lines.join('\n')}`;
}
