/**
 * SWR-008 W8 — the benchmark harness in mock mode over the real Rebellion scenarios
 * (`packages/games/rebellion/benchmark/scenarios.json`), the real game module and its real rules provider:
 * TC-BEN-04 (deterministic, three variants, part of `pnpm test`), TC-BEN-07 (variants: bot without calls, rules off =
 * the commander context with rules disabled, rules on = with the rules block), QD-25 (the harness classifies every
 * candidate exactly like W9's `classifyCandidate`), TC-H-09 (b) (the request of an Imperial scenario does not depend on
 * where the hidden base is), TC-MEAS-04 (functions: accounting rows ↔ metrics), the in-memory accounting store.
 * No network (the fetch guard of the test setup is active), no database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomationDecisionPoint } from '@bga/platform';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  type CoreGameState,
} from '@bga/game-rebellion/schema';
import { coreDataBaseV1 } from '@bga/game-rebellion/scenario';
import { beforeAll, describe, expect, it } from 'vitest';
import { AiDecisionService } from '../../src/ai/ai-decision.service';
import { InvalidAiUsageRowError } from '../../src/ai/ai-usage.repository';
import { aiRuntime, type AIDecisionContext } from '../../src/ai/ai.types';
import { BudgetService } from '../../src/ai/budget.service';
import { summarizeCostByRules } from '../../src/ai/cost-by-rules';
import { buildPrompt } from '../../src/ai/prompt';
import { MockAIProvider, MOCK_MODEL_ID } from '../../src/ai/providers/mock.provider';
import {
  BenchScenarioError,
  parseScenarioFile,
  planBenchmark,
  prepareScenarios,
  runBenchmark,
  type PreparedScenario,
} from '../../src/bench/harness';
import { InMemoryAiUsageStore } from '../../src/bench/in-memory-usage';
import { classifyCandidate } from '../../src/bench/metrics';
import { renderBenchReportJson, renderBenchReportMarkdown } from '../../src/bench/report';
import type { BenchScenarioFile, BenchVariant } from '../../src/bench/types';
import { DEFAULT_AI_COMMANDER } from '../../src/config/env';
import { SERVER_GAME_MODULES } from '../../src/game-registry/registry';
import { createRulesContextRegistry } from '../../src/rules-context/rules-context.registry';
import {
  buildCommanderContext,
  type CommanderRulesConfig,
} from '../../src/sessions/automation/commander-context';
import { OPENAI_DISABLED, REPO_ROOT, testConfig } from '../support/test-config';
// W9's reference classifier and test fixture (QD-25, TC-H-09): the harness must agree with them.
import {
  classifyCandidate as w9ClassifyCandidate,
  decisionPointOf as w9DecisionPointOf,
} from '../../../../packages/games/rebellion/test/benchmark/scenarios';
import { relocateBase } from '../../../../packages/games/rebellion/test/ai/fixtures/relocate-base';

const SCENARIOS_PATH = join(
  REPO_ROOT,
  'packages',
  'games',
  'rebellion',
  'benchmark',
  'scenarios.json',
);
const VARIANTS: BenchVariant[] = ['bot', 'openai-no-rules', 'openai-rules'];
const FIXED_NOW = '2026-11-20T10:00:00.000Z';
const RULES_CONFIG: CommanderRulesConfig = {
  enabled: true,
  maxChars: DEFAULT_AI_COMMANDER.rulesMaxChars,
  maxPromptTokens: DEFAULT_AI_COMMANDER.maxPromptTokens,
};

const gameModule = SERVER_GAME_MODULES.find((m) => m.rules !== undefined)!;
const rules = createRulesContextRegistry({
  config: testConfig({ aiCommander: { provider: 'openai', rulesContext: 'on' } }),
  modules: [gameModule],
}).forGame(gameModule.definition.id);

let file: BenchScenarioFile;
let prepared: PreparedScenario[];

beforeAll(() => {
  file = parseScenarioFile(JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8')));
  prepared = prepareScenarios(file, gameModule, rules);
});

/** A mock run: `AiDecisionService` over `MockAIProvider`, in-memory accounting, a spy on the contexts sent. */
function mockRun(f: BenchScenarioFile = file, variants = VARIANTS, repeats = 1) {
  const usage = new InMemoryAiUsageStore(() => new Date(FIXED_NOW));
  const logs: string[] = [];
  const runtime = aiRuntime(
    {
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      monotonicNow: () => 1000,
    },
    (line) => logs.push(line),
  );
  const service = new AiDecisionService({
    openai: OPENAI_DISABLED,
    mock: new MockAIProvider({ runtime, maxRetries: 2 }),
    openaiProvider: null,
    availability: null,
    budget: new BudgetService(usage),
    usage,
    runtime,
  });
  const seen: { ctx: AIDecisionContext; requested: string }[] = [];
  const progress: string[] = [];
  const run = runBenchmark({
    file: f,
    module: gameModule,
    rules,
    variants,
    repeats,
    decisions: {
      decide: (ctx, requested) => {
        seen.push({ ctx, requested });
        return service.decide(ctx, requested);
      },
    },
    usage,
    requested: 'mock',
    budgetKey: 'bench-mock-test',
    modelRole: 'tactical',
    rulesConfig: RULES_CONFIG,
    maxUsd: null,
    monotonicNow: () => 5000,
    now: () => FIXED_NOW,
    onProgress: (line) => progress.push(line),
  });
  return { run, usage, seen, logs, progress };
}

describe('scenario file and decision points', () => {
  it('the Rebellion file parses and every scenario yields the decision point of its side', () => {
    expect(file.gameId).toBe('rebellion');
    expect(file.scenarios).toHaveLength(14);
    expect(prepared).toHaveLength(14);
    for (const { scenario, point } of prepared) {
      expect(point.actor).toBe(scenario.side);
      expect(point.candidates.length).toBeGreaterThanOrEqual(2);
      // Same point as W9's reference builder.
      expect(point).toEqual(w9DecisionPointOf(scenario as Parameters<typeof w9DecisionPointOf>[0]));
    }
  });

  it('a file of another game, an unparsable state or another pending actor is refused', () => {
    expect(() => prepareScenarios({ ...file, gameId: 'other-game' }, gameModule, rules)).toThrow(
      BenchScenarioError,
    );
    const first = file.scenarios[0]!;
    const broken = { ...file, scenarios: [{ ...first, state: { nonsense: true } }] };
    expect(() => prepareScenarios(broken, gameModule, rules)).toThrow(/does not parse/);
    // Without the rules provider the file's game id (the rules knowledge's id) is not the registry id.
    expect(file.gameId).not.toBe(gameModule.definition.id);
    expect(() => prepareScenarios(file, gameModule, null)).toThrow(BenchScenarioError);
    expect(() =>
      prepareScenarios({ ...file, gameId: gameModule.definition.id }, gameModule, null),
    ).not.toThrow();
    const otherSide = first.side === 'empire' ? 'rebels' : 'empire';
    expect(() =>
      prepareScenarios({ ...file, scenarios: [{ ...first, side: otherSide }] }, gameModule, rules),
    ).toThrow(/pending actor/);
    expect(() => parseScenarioFile({ ...file, formatVersion: 2 })).toThrow(BenchScenarioError);
    expect(() => parseScenarioFile({ ...file, scenarios: [first, first] })).toThrow(
      BenchScenarioError,
    );
  });
});

describe('QD-25: the harness classifies candidates exactly like W9', () => {
  it('every candidate of every scenario gets the same rubric class', () => {
    let compared = 0;
    const classes = new Set<string>();
    for (const { scenario, point } of prepared) {
      for (const candidate of point.candidates) {
        const mine = classifyCandidate(scenario.rubric, candidate);
        expect(mine, `${scenario.id} ${candidate.id}`).toBe(
          w9ClassifyCandidate(scenario.rubric, candidate),
        );
        classes.add(mine);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(14 * 2);
    // The data exercises every class of the rubric.
    expect([...classes].sort()).toEqual(['acceptable', 'expected', 'unmatched', 'wrong']);
  });
});

describe('mock run (TC-BEN-04, TC-BEN-07)', () => {
  it('TC-BEN-04: two runs give byte-identical JSON and Markdown reports with the three variants', async () => {
    const a = await mockRun().run;
    const b = await mockRun().run;
    expect(renderBenchReportJson(a)).toBe(renderBenchReportJson(b));
    expect(renderBenchReportMarkdown(a)).toBe(renderBenchReportMarkdown(b));
    expect(a.mode).toBe('mock');
    expect(a.variants).toEqual(VARIANTS);
    expect(Object.keys(a.metrics)).toEqual(VARIANTS);
    expect(a.decisions).toHaveLength(14 * 3);
    expect(a.scenarios).toBe(14);
    expect(a.model).toBe(MOCK_MODEL_ID);
    expect(a.rulesVersion).toBe(rules?.rulesVersion);
    expect(a.rulesVersion).toMatch(/^rebellion@\d+:[0-9a-f]{12}$/);
    expect(a.stopped).toBeNull();
    expect(a.spentMicroUsd).toBe(0);
    expect(a.maxUsd).toBeNull();
    expect(a.comparisons.map((c) => c.metric)).toEqual([
      'goalScore',
      'expectedHitRate',
      'unjustifiedPassRate',
      'validRate',
      'costPerDecisionMicroUsd',
      'inputTokens',
      'latencyP50Ms',
    ]);
    // The mock provider picks the first candidate in both model variants: no difference to measure.
    for (const c of a.comparisons) expect(c.verdict).toBe('no-measurable-effect');
    const md = renderBenchReportMarkdown(a);
    expect(md).toContain('it is NOT a measurement of a model');
    expect(md).not.toMatch(/NaN|undefined/);
  });

  it('repeats multiply the decisions; the order is repeat → scenario → variant', async () => {
    const r = await mockRun(file, VARIANTS, 2).run;
    expect(r.decisions).toHaveLength(14 * 3 * 2);
    expect(r.decisions.slice(0, 3).map((d) => [d.repeat, d.variant])).toEqual([
      [1, 'bot'],
      [1, 'openai-no-rules'],
      [1, 'openai-rules'],
    ]);
    expect(r.decisions[3]!.scenarioId).toBe(file.scenarios[1]!.id);
    expect(r.decisions.at(-1)!.repeat).toBe(2);
  });

  it('TC-BEN-07: bot = the fallback pick without calls; model variants call the service once per scenario', async () => {
    const { run, seen, usage } = mockRun();
    const report = await run;
    expect(seen).toHaveLength(14 * 2);
    expect(seen.every((s) => s.requested === 'mock')).toBe(true);
    expect(usage.size).toBe(14 * 2);

    const bot = report.decisions.filter((d) => d.variant === 'bot');
    expect(bot).toHaveLength(14);
    for (const d of bot) {
      const point = prepared.find((p) => p.scenario.id === d.scenarioId)!.point;
      expect(d.candidateId).toBe(point.fallbackCandidateId);
      expect(d.source).toBe('bot');
      expect(d.fallbackCode).toBeNull();
      expect(d.valid).toBe(true);
      expect(d.costMicroUsd).toBe(0);
      expect(d.inputTokens + d.outputTokens).toBe(0);
      expect(d.rules.count).toBe(0);
    }
    const m = report.metrics.bot!;
    expect(m.fallbacks).toBe(0);
    expect(m.costMicroUsd).toBe(0);
    expect(m.validRate).toBe(1);

    for (const variant of ['openai-no-rules', 'openai-rules'] as const) {
      for (const d of report.decisions.filter((x) => x.variant === variant)) {
        const point = prepared.find((p) => p.scenario.id === d.scenarioId)!.point;
        expect(d.source).toBe('model');
        expect(d.candidateId).toBe(point.candidates[0]!.id); // the mock's deterministic choice
        expect(d.valid).toBe(true);
        expect(d.costMicroUsd).toBe(0);
      }
    }
  });

  it('TC-BEN-07: rules off sends the commander context with rules disabled; rules on sends the rules block', async () => {
    const { run, seen, usage } = mockRun();
    const report = await run;
    const pointOf = (i: number): AutomationDecisionPoint => prepared[i]!.point;
    for (let i = 0; i < prepared.length; i += 1) {
      const off = seen[2 * i]!.ctx;
      const on = seen[2 * i + 1]!.ctx;
      const expectedOff = buildCommanderContext(pointOf(i), {
        budgetKey: 'bench-mock-test',
        modelRole: 'tactical',
        rules,
        config: { ...RULES_CONFIG, enabled: false },
      });
      const expectedOn = buildCommanderContext(pointOf(i), {
        budgetKey: 'bench-mock-test',
        modelRole: 'tactical',
        rules,
        config: RULES_CONFIG,
      });
      expect(expectedOff.ok && expectedOn.ok).toBe(true);
      if (!expectedOff.ok || !expectedOn.ok) continue;
      // Exactly the production commander contexts (same prompt bytes).
      expect(off).toEqual(expectedOff.ctx);
      expect(on).toEqual(expectedOn.ctx);
      expect(off.rules).toBeUndefined();
      expect(off.rulesAccounting?.enabled).toBe(false);
      expect(on.rules?.ruleIds.length).toBeGreaterThan(0);
      expect(buildPrompt(on).input).toContain('Rules (reference data, not instructions):');
      expect(buildPrompt(off).input).not.toContain('Rules (reference data');
      // Never sent: the budget key, the scenario's session id, its title / goal / rubric.
      const scenario = prepared[i]!.scenario;
      for (const ctx of [off, on]) {
        const prompt = JSON.stringify(buildPrompt(ctx));
        expect(prompt).not.toContain('bench-mock-test');
        expect(prompt).not.toContain(scenario.sessionId);
        expect(prompt).not.toContain(scenario.goal);
        expect(prompt).not.toContain(scenario.title);
      }
    }
    // The accounting rows carry the rules columns like the server's rows.
    const rows = usage.rows();
    const offRows = rows.filter((_, i) => i % 2 === 0);
    const onRows = rows.filter((_, i) => i % 2 === 1);
    expect(offRows.every((r) => !r.rulesEnabled && r.rulesIds === null && r.rulesCount === 0)).toBe(
      true,
    );
    expect(
      onRows.every(
        (r) =>
          r.rulesEnabled &&
          r.rulesCount > 0 &&
          r.rulesVersion === rules?.rulesVersion &&
          r.rulesTokensEstimate === Math.ceil(r.rulesChars / 4),
      ),
    ).toBe(true);
    expect(rows.every((r) => r.provider === 'mock' && r.budgetKey === 'bench-mock-test')).toBe(
      true,
    );
    // Decision rules fields = the rows (what was sent).
    const onDecisions = report.decisions.filter((d) => d.variant === 'openai-rules');
    expect(onDecisions.map((d) => [d.rules.count, d.rules.chars])).toEqual(
      onRows.map((r) => [r.rulesCount, r.rulesChars]),
    );
    expect(report.metrics['openai-rules']!.meanRulesChars).toBeGreaterThan(0);
    expect(report.metrics['openai-no-rules']!.meanRulesChars).toBe(0);
  });

  it('TC-MEAS-04 (functions): usageByRules = summarizeCostByRules over the run rows; metrics agree with it', async () => {
    const { run, usage } = mockRun();
    const report = await run;
    expect(report.usageByRules).toEqual(summarizeCostByRules(usage.rows()));
    expect(report.usageByRules.withRules.decisions).toBe(14);
    expect(report.usageByRules.withoutRules.decisions).toBe(14);
    const tokens = (v: BenchVariant) => report.metrics[v]!.inputTokens;
    expect(report.usageByRules.withRules.inputTokens).toBe(tokens('openai-rules'));
    expect(report.usageByRules.withoutRules.inputTokens).toBe(tokens('openai-no-rules'));
  });

  it('a run with only some variants reports only them and makes no comparison', async () => {
    const r = await mockRun(file, ['bot']).run;
    expect(Object.keys(r.metrics)).toEqual(['bot']);
    expect(r.comparisons).toEqual([]);
    expect(r.decisions).toHaveLength(14);
  });

  it('invalid run shapes are refused before anything runs', async () => {
    await expect(mockRun(file, [], 1).run).rejects.toThrow(RangeError);
    await expect(mockRun(file, ['bot', 'bot'], 1).run).rejects.toThrow(RangeError);
    await expect(mockRun(file, VARIANTS, 0).run).rejects.toThrow(RangeError);
    await expect(mockRun(file, VARIANTS, 11).run).rejects.toThrow(RangeError);
  });
});

describe('dry-run plan', () => {
  it('counts decisions and model calls; every prompt fits under the limit', () => {
    const plan = planBenchmark({
      file,
      module: gameModule,
      rules,
      variants: VARIANTS,
      repeats: 3,
      modelRole: 'tactical',
      rulesConfig: RULES_CONFIG,
    });
    expect(plan.decisions).toBe(14 * 3 * 3);
    expect(plan.calls).toHaveLength(14 * 2);
    expect(plan.modelCalls).toBe(14 * 2 * 3);
    expect(plan.calls.every((c) => c.upperBoundTokens !== null)).toBe(true);
    // Rules on makes a larger prompt for the same scenario.
    for (let i = 0; i < 14; i += 1) {
      const off = plan.calls[2 * i]!;
      const on = plan.calls[2 * i + 1]!;
      expect(off.variant).toBe('openai-no-rules');
      expect(on.variant).toBe('openai-rules');
      expect(on.upperBoundTokens!).toBeGreaterThan(off.upperBoundTokens!);
    }
  });
});

describe('TC-H-09 (b): the mock request of an Imperial scenario does not depend on where the hidden base is', () => {
  const hidden = () =>
    prepared.filter((p) => {
      if (p.scenario.side !== 'empire') return false;
      const state = CoreGameStateV3Schema.parse(p.scenario.state) as CoreGameState;
      return !state.rebelBase.revealed;
    });

  it('relocating the base gives byte-identical requests in both model variants', async () => {
    const scenarios = hidden();
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
    let relocations = 0;
    for (const { scenario } of scenarios) {
      const single: BenchScenarioFile = { ...file, scenarios: [scenario] };
      const original = mockRun(single, ['openai-no-rules', 'openai-rules']);
      await original.run;
      const state = CoreGameStateV3Schema.parse(scenario.state) as CoreGameState;
      let here = 0;
      for (const to of eligibleRebelBaseSystemIds(coreDataBaseV1)) {
        if (here >= 3) break;
        // Conservative: no Imperial unit at the target (a hidden base never stands with Imperial ground).
        if (state.units.some((u) => u.owner === 'empire' && u.systemId === to)) continue;
        const moved = relocateBase(state, to);
        if (moved === null) continue;
        const movedState = CoreGameStateV3Schema.parse(moved);
        const variant = mockRun({ ...file, scenarios: [{ ...scenario, state: movedState }] }, [
          'openai-no-rules',
          'openai-rules',
        ]);
        await variant.run;
        expect(variant.seen.map((s) => buildPrompt(s.ctx))).toEqual(
          original.seen.map((s) => buildPrompt(s.ctx)),
        );
        here += 1;
      }
      expect(here, scenario.id).toBeGreaterThanOrEqual(1);
      relocations += here;
    }
    expect(relocations).toBeGreaterThanOrEqual(10);
  });
});

describe('InMemoryAiUsageStore', () => {
  const row = {
    budgetKey: 'bench-a',
    provider: 'openai' as const,
    model: 'gpt-6-luna',
    role: 'tactical' as const,
    status: 'ok' as const,
    attempts: 1,
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 10,
    reasoningTokens: null,
    estimatedCostMicroUsd: 15,
    pricingVersion: 'v',
    durationMs: 3,
    errorCode: null,
  };

  it('validates rows like the database repository and sums the cost per budget key', async () => {
    const store = new InMemoryAiUsageStore(() => new Date(FIXED_NOW));
    const stored = await store.insert(row);
    await store.insert({ ...row, budgetKey: 'bench-b', estimatedCostMicroUsd: 7 });
    await store.insert({ ...row, estimatedCostMicroUsd: 5 });
    expect(stored.rulesCount).toBe(0);
    expect(stored.rulesIds).toBeNull();
    expect(stored.createdAt.toISOString()).toBe(FIXED_NOW);
    expect(await store.sumCostMicroUsd('bench-a')).toBe(20);
    expect(await store.sumCostMicroUsd('bench-b')).toBe(7);
    expect(await store.sumCostMicroUsd('other')).toBe(0);
    await expect(store.insert({ ...row, provider: 'mock' })).rejects.toBeInstanceOf(
      InvalidAiUsageRowError,
    );
    expect(store.size).toBe(3);
    // The store behind a BudgetService: the limit counts the stored cost.
    const budget = new BudgetService(store);
    await expect(budget.reserve('bench-a', 80, 100)).rejects.toThrow('AI budget exceeded');
    const hold = await budget.reserve('bench-a', 79, 100);
    hold.release();
  });
});
