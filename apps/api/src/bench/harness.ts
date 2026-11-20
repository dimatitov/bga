/**
 * SWR-008 W8 (plan-backend §8.2, AC-14, AC-15): the benchmark harness. Game-agnostic: a scenario is a stored state of
 * the game named by the file; its decision point is rebuilt exactly like the server does (`module.parseState` →
 * `automation.pendingActor` (must equal the scenario's side) → `automation.decisionPoint` →
 * `AutomationDecisionPointSchema.parse`).
 *
 * Variants (the same pipeline as the in-game commander, so the measured tokens / cost are what the game sends):
 * - `bot` — the point's `fallbackCandidateId`, no call;
 * - `openai-no-rules` / `openai-rules` — `buildCommanderContext` (C-10) with rules off / on, then
 *   `AiDecisionService.decide(ctx, requested)` (pricing → availability → budget reservation → provider → validation →
 *   one `AiUsage` row). An answer outside the candidates or any failure → the bot's pick with the commander's fallback
 *   code; a prompt above the size limit → `AI_PROMPT_TOO_LARGE` without a call.
 *
 * Hard cost limit (real runs): the caller's `AiDecisionService` reserves the worst case of every call against its own
 * in-memory budget (`budgetKey = bench-<runId>`, limit = `--max-usd`). The first `AI_BUDGET_EXCEEDED` stops every
 * further model call (`stopped: 'cost-cap'`); refused / skipped steps are not recorded as decisions.
 *
 * Order: repeat → scenario → variant (variants of one scenario run next to each other, so a capped run stays
 * balanced). Nothing here reads the environment, the network or the database by itself.
 */
import {
  AutomationDecisionPointSchema,
  type AutomationDecisionPoint,
  type RulesContextProvider,
  type ServerGameModule,
} from '@bga/platform';
import type { AiDecisionService, RequestedProvider } from '../ai/ai-decision.service';
import { AiFailure } from '../ai/ai.errors';
import type { AIDecisionContext, AIModelRole } from '../ai/ai.types';
import { summarizeCostByRules } from '../ai/cost-by-rules';
import { ROLE_DEFAULTS } from '../ai/model-roles';
import { worstCaseReserveMicroUsd } from '../ai/pricing';
import type { PromptFit } from '../ai/prompt-fit';
import { rulesTokensEstimate } from '../ai/prompt';
import { clampMaxRetries } from '../ai/retry';
import {
  buildCommanderContext,
  type CommanderRulesConfig,
} from '../sessions/automation/commander-context';
import { fallbackCodeOf } from '../sessions/automation/openai-commander.strategy';
import type { InMemoryAiUsageStore } from './in-memory-usage';
import {
  PASS_CANDIDATE_TYPE,
  RUBRIC_SCORES,
  classifyCandidate,
  compareAll,
  computeVariantMetrics,
} from './metrics';
import {
  BenchScenarioFileSchema,
  type BenchDecision,
  type BenchReport,
  type BenchScenario,
  type BenchScenarioFile,
  type BenchVariant,
  type BenchVariantMetrics,
} from './types';

export const MAX_BENCH_REPEATS = 10;

/** A scenario that does not fit the game module (wrong game, unparsable state, other pending actor, bad point). */
export class BenchScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BenchScenarioError';
  }
}

/** Validates a parsed scenario file (`BenchScenarioFileSchema`); throws `BenchScenarioError` with the issue paths. */
export function parseScenarioFile(raw: unknown): BenchScenarioFile {
  const parsed = BenchScenarioFileSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => i.path.join('.') || 'file').join(', ');
    throw new BenchScenarioError(`invalid scenario file (${where})`);
  }
  return parsed.data;
}

export interface PreparedScenario {
  scenario: BenchScenario;
  point: AutomationDecisionPoint;
}

/**
 * Whether a scenario file belongs to a game: its `gameId` is the game's registry id, or the game id of the game's
 * rules knowledge (the `<gameId>@` prefix of the provider's `rulesVersion`) — a game may name its benchmark data after
 * its rules knowledge.
 */
export function fileMatchesGame(
  file: Pick<BenchScenarioFile, 'gameId'>,
  module: ServerGameModule,
  rules: RulesContextProvider | null,
): boolean {
  return (
    file.gameId === module.definition.id ||
    (rules !== null && rules.rulesVersion.startsWith(`${file.gameId}@`))
  );
}

/** Decision point of every scenario, rebuilt like the server builds it. */
export function prepareScenarios(
  file: BenchScenarioFile,
  module: ServerGameModule,
  rules: RulesContextProvider | null = null,
): PreparedScenario[] {
  if (!fileMatchesGame(file, module, rules)) {
    throw new BenchScenarioError(
      `scenario file of game ${file.gameId} given to the module of ${module.definition.id}`,
    );
  }
  const automation = module.automation;
  if (!automation) throw new BenchScenarioError(`game ${file.gameId} has no automation`);
  return file.scenarios.map((scenario) => {
    let state: unknown;
    try {
      state = module.parseState(scenario.state, {
        sessionId: scenario.sessionId,
        version: scenario.version,
      });
    } catch {
      throw new BenchScenarioError(`${scenario.id}: the stored state does not parse`);
    }
    const actor = automation.pendingActor(state);
    if (actor !== scenario.side) {
      throw new BenchScenarioError(`${scenario.id}: the pending actor is not the scenario's side`);
    }
    const point = AutomationDecisionPointSchema.safeParse(automation.decisionPoint(state));
    if (!point.success) throw new BenchScenarioError(`${scenario.id}: invalid decision point`);
    return { scenario, point: point.data };
  });
}

/** The commander context of a variant (rules on only for `openai-rules`). */
function contextOf(
  point: AutomationDecisionPoint,
  variant: Exclude<BenchVariant, 'bot'>,
  o: {
    budgetKey: string;
    modelRole: AIModelRole;
    rules: RulesContextProvider | null;
    rulesConfig: CommanderRulesConfig;
    onSelectionError?: (errorName: string) => void;
  },
): PromptFit {
  return buildCommanderContext(point, {
    budgetKey: o.budgetKey,
    modelRole: o.modelRole,
    rules: o.rules,
    config: { ...o.rulesConfig, enabled: variant === 'openai-rules' },
    onSelectionError: o.onSelectionError,
  });
}

function checkRunShape(variants: readonly BenchVariant[], repeats: number): void {
  if (variants.length === 0 || new Set(variants).size !== variants.length) {
    throw new RangeError('variants must be a non-empty list without duplicates');
  }
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_BENCH_REPEATS) {
    throw new RangeError(`repeats must be an integer 1..${MAX_BENCH_REPEATS}`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Plan (dry run): what would be called, and the worst-case cost — no provider, no network.
// ---------------------------------------------------------------------------------------------------------

export interface BenchPlanOptions {
  file: BenchScenarioFile;
  module: ServerGameModule;
  rules: RulesContextProvider | null;
  variants: readonly BenchVariant[];
  repeats: number;
  modelRole: AIModelRole;
  rulesConfig: CommanderRulesConfig;
}

export interface BenchPlannedCall {
  scenarioId: string;
  variant: Exclude<BenchVariant, 'bot'>;
  /** Upper bound of the prompt's input tokens (the reservation basis); `null` = too large, no call. */
  upperBoundTokens: number | null;
}

export interface BenchPlan {
  scenarios: number;
  variants: BenchVariant[];
  repeats: number;
  /** scenarios × variants × repeats. */
  decisions: number;
  /** Model calls of ONE repeat (one per scenario × model variant whose prompt fits). */
  calls: BenchPlannedCall[];
  /** Model calls of the whole run. */
  modelCalls: number;
  rulesVersion: string | null;
}

export function planBenchmark(opts: BenchPlanOptions): BenchPlan {
  checkRunShape(opts.variants, opts.repeats);
  const prepared = prepareScenarios(opts.file, opts.module, opts.rules);
  const calls: BenchPlannedCall[] = [];
  for (const { scenario, point } of prepared) {
    for (const variant of opts.variants) {
      if (variant === 'bot' || point.candidates.length < 2) continue;
      const fit = contextOf(point, variant, { ...opts, budgetKey: 'bench-plan' });
      calls.push({
        scenarioId: scenario.id,
        variant,
        upperBoundTokens: fit.ok ? fit.upperBoundTokens : null,
      });
    }
  }
  const perRepeat = calls.filter((c) => c.upperBoundTokens !== null).length;
  return {
    scenarios: prepared.length,
    variants: [...opts.variants],
    repeats: opts.repeats,
    decisions: prepared.length * opts.variants.length * opts.repeats,
    calls,
    modelCalls: perRepeat * opts.repeats,
    rulesVersion: opts.rules?.rulesVersion ?? null,
  };
}

/**
 * Σ of the budget reservations of every planned call (the exact worst case `AiDecisionService` reserves: prompt upper
 * bound + the role's full output limit, × (retries + 1)) — an upper bound of what the run can spend before the cap.
 * `null` when the model has no price.
 */
export function worstCaseCostMicroUsd(
  plan: BenchPlan,
  model: string,
  modelRole: AIModelRole,
  maxRetries: number,
): number | null {
  let sum = 0;
  for (const call of plan.calls) {
    if (call.upperBoundTokens === null) continue;
    const reserve = worstCaseReserveMicroUsd(
      model,
      call.upperBoundTokens,
      ROLE_DEFAULTS[modelRole].maxOutputTokens,
      clampMaxRetries(maxRetries),
    );
    if (reserve === null) return null;
    sum += reserve;
  }
  return sum * plan.repeats;
}

// ---------------------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------------------

export interface BenchRunOptions {
  file: BenchScenarioFile;
  module: ServerGameModule;
  /** Rules provider of the file's game (`null`: the game has no rules; `openai-rules` then sends none). */
  rules: RulesContextProvider | null;
  variants: readonly BenchVariant[];
  repeats: number;
  /** Mock: `AiDecisionService` over `MockAIProvider`; real: over `OpenAIProvider` with the run's own budget. */
  decisions: Pick<AiDecisionService, 'decide'>;
  /** The accounting store the decision service writes to (tokens / cost of each call, `spentMicroUsd`). */
  usage: InMemoryAiUsageStore;
  requested: RequestedProvider;
  /** `bench-<runId>`: never a session id; never written to the report. */
  budgetKey: string;
  modelRole: AIModelRole;
  /** `maxChars` / `maxPromptTokens` of the commander; `enabled` is set per variant. */
  rulesConfig: CommanderRulesConfig;
  /** `--max-usd` of a real run (report only; the limit itself lives in the decision service's budget). */
  maxUsd: number | null;
  monotonicNow: () => number;
  now: () => string;
  /** One line per step / event (no secrets, no prompts, no session ids). */
  onProgress?: (line: string) => void;
}

interface StepResult {
  candidateId: string;
  source: 'bot' | 'model';
  fallbackCode: string | null;
  ctx: AIDecisionContext | null;
  /** Index range of the accounting rows of the step. */
  rowsFrom: number;
  rowsTo: number;
  /** The hard cost limit refused the call. */
  capped: boolean;
  model: string | null;
}

export async function runBenchmark(opts: BenchRunOptions): Promise<BenchReport> {
  checkRunShape(opts.variants, opts.repeats);
  const prepared = prepareScenarios(opts.file, opts.module, opts.rules);
  const progress = opts.onProgress ?? (() => undefined);
  const decisions: BenchDecision[] = [];
  let stopped: BenchReport['stopped'] = null;
  let model: string | null = null;
  const total = prepared.length * opts.variants.length * opts.repeats;
  let index = 0;

  const step = async (
    point: AutomationDecisionPoint,
    variant: BenchVariant,
  ): Promise<StepResult> => {
    const rowsFrom = opts.usage.size;
    const bot = (
      fallbackCode: string | null,
      ctx: AIDecisionContext | null = null,
    ): StepResult => ({
      candidateId: point.fallbackCandidateId,
      source: 'bot',
      fallbackCode,
      ctx,
      rowsFrom,
      rowsTo: opts.usage.size,
      capped: false,
      model: null,
    });
    if (variant === 'bot' || point.candidates.length < 2) return bot(null);
    const fit = contextOf(point, variant, {
      ...opts,
      onSelectionError: (name) => progress(`bench rules-selection-error ${name}`),
    });
    if (!fit.ok) return bot('AI_PROMPT_TOO_LARGE');
    try {
      const out = await opts.decisions.decide(fit.ctx, opts.requested);
      const id = out.decision.selectedActionId;
      if (!point.candidates.some((c) => c.id === id)) return bot('AI_INVALID_DECISION', fit.ctx);
      return {
        candidateId: id,
        source: 'model',
        fallbackCode: null,
        ctx: fit.ctx,
        rowsFrom,
        rowsTo: opts.usage.size,
        capped: false,
        model: out.decision.model,
      };
    } catch (error) {
      const code = error instanceof AiFailure ? fallbackCodeOf(error) : 'AI_PROVIDER_ERROR';
      return { ...bot(code, fit.ctx), capped: code === 'AI_BUDGET_EXCEEDED' };
    }
  };

  for (let repeat = 1; repeat <= opts.repeats; repeat += 1) {
    for (const { scenario, point } of prepared) {
      for (const variant of opts.variants) {
        index += 1;
        if (variant !== 'bot' && stopped !== null) continue;
        const started = opts.monotonicNow();
        const result = await step(point, variant);
        const durationMs = Math.max(0, Math.round(opts.monotonicNow() - started));
        if (result.capped) {
          stopped = 'cost-cap';
          progress(`bench cost-cap reached at step ${index}/${total}: no further model calls`);
          continue;
        }
        model ??= result.model;
        const candidate = point.candidates.find((c) => c.id === result.candidateId);
        if (!candidate) throw new Error('the chosen candidate is not in the point'); // unreachable
        const rubricClass = classifyCandidate(scenario.rubric, candidate);
        const pass = candidate.type === PASS_CANDIDATE_TYPE;
        let inputTokens = 0;
        let cachedInputTokens = 0;
        let outputTokens = 0;
        let costMicroUsd = 0;
        for (let i = result.rowsFrom; i < result.rowsTo; i += 1) {
          const row = opts.usage.at(i);
          if (!row) continue;
          inputTokens += row.inputTokens;
          cachedInputTokens += row.cachedInputTokens;
          outputTokens += row.outputTokens;
          costMicroUsd += row.estimatedCostMicroUsd;
        }
        const sent = result.ctx?.rulesAccounting;
        const decision: BenchDecision = {
          scenarioId: scenario.id,
          variant,
          repeat,
          candidateId: candidate.id,
          candidateType: candidate.type,
          source: result.source,
          fallbackCode: result.fallbackCode,
          valid: result.fallbackCode === null,
          rubricClass,
          rubricScore: RUBRIC_SCORES[rubricClass],
          expectedHit: rubricClass === 'expected',
          pass,
          unjustifiedPass: pass && scenario.rubric.passUnjustified,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          costMicroUsd,
          durationMs,
          rules: {
            count: sent?.ruleIds.length ?? 0,
            chars: sent?.chars ?? 0,
            tokensEstimate: rulesTokensEstimate(sent?.chars ?? 0),
            dropped: sent?.dropped ?? false,
          },
        };
        decisions.push(decision);
        progress(
          `bench ${index}/${total} ${scenario.id} ${variant} r${repeat}: ${candidate.type} ` +
            `${rubricClass}${decision.fallbackCode === null ? '' : ` fallback=${decision.fallbackCode}`}`,
        );
      }
    }
  }

  const metrics: Partial<Record<BenchVariant, BenchVariantMetrics>> = {};
  for (const variant of opts.variants) {
    metrics[variant] = computeVariantMetrics(decisions.filter((d) => d.variant === variant));
  }
  const comparisons =
    opts.variants.includes('openai-rules') && opts.variants.includes('openai-no-rules')
      ? compareAll(
          decisions.filter((d) => d.variant === 'openai-rules'),
          decisions.filter((d) => d.variant === 'openai-no-rules'),
        )
      : [];
  const rows = opts.usage.rows();
  let spentMicroUsd = 0;
  for (const row of rows) spentMicroUsd += row.estimatedCostMicroUsd;
  // The refused call of the cap leaves a zero `budget_exceeded` row; it is not a decision of the run.
  const usageByRules = summarizeCostByRules(rows.filter((r) => r.status !== 'budget_exceeded'));

  return {
    mode: opts.requested === 'mock' ? 'mock' : 'real',
    generatedAt: opts.now(),
    model,
    modelRole: opts.modelRole,
    rulesVersion: opts.rules?.rulesVersion ?? null,
    repeats: opts.repeats,
    scenarios: prepared.length,
    variants: [...opts.variants],
    decisions,
    metrics,
    comparisons,
    usageByRules,
    stopped,
    spentMicroUsd,
    maxUsd: opts.maxUsd,
  };
}
