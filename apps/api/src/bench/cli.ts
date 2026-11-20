/**
 * SWR-008 W8 (plan-backend §8.2, AC-14, AC-15, PO-2): command line of the AI benchmark.
 *
 *   pnpm --filter @bga/api bench:ai -- [--repeats N] [--variants a,b] [--out DIR] [--dry-run]
 *   pnpm --filter @bga/api bench:ai -- --real --max-usd <0 < x ≤ 1> [--repeats ≥3] [--role tactical|strategy] [--dry-run]
 *
 * - Mock (default): `AiDecisionService` over the deterministic mock provider, built-in defaults — the environment and
 *   `.env` are not read, nothing leaves the machine, $0.
 * - Real: only with `--real --max-usd X` (0 < X ≤ 1, PO-2). Refused with exit code 2 BEFORE any network access when the
 *   flag pair is incomplete or out of range, when fewer than 3 repeats are asked (QD-10), when the configuration cannot
 *   be read, under `NODE_ENV=test`, when OpenAI is not enabled, or when the role's model has no price. The configuration
 *   (incl. the API key) is read only through `loadAppConfig`; the key is never printed. The model is the commander's
 *   (`AI_COMMANDER_MODEL_ROLE`, A-6) unless `--role` names the other configured role. The hard limit is a budget
 *   reservation of the worst case of every call against the run's own in-memory budget (`bench-<runId>`, limit =
 *   `--max-usd`; `OPENAI_MAX_COST_PER_SESSION_USD` is ignored): the run cannot spend more than `--max-usd`.
 * - `--dry-run`: prints the plan (scenarios × variants × repeats, model calls) and the worst-case cost (Σ of the
 *   reservations the run would make), then exits 0 without calling any provider.
 *
 * Exit codes: 0 done; 2 refused (arguments / configuration); 1 failed (scenario file, game, unexpected error).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { usdToMicroUsd, type ServerGameModule } from '@bga/platform';
import { AiDecisionService } from '../ai/ai-decision.service';
import { aiRuntime, type AIModelRole, type AiRuntime } from '../ai/ai.types';
import { BudgetService } from '../ai/budget.service';
import { ModelAvailabilityService } from '../ai/model-availability.service';
import { modelForRole } from '../ai/model-roles';
import { MODEL_PRICING, pricingFor } from '../ai/pricing';
import { MockAIProvider } from '../ai/providers/mock.provider';
import { lazyOpenAIClient } from '../ai/providers/openai-client';
import { OpenAIProvider } from '../ai/providers/openai.provider';
import {
  DEFAULT_AI_COMMANDER,
  DEFAULT_OPENAI_MAX_RETRIES,
  DEFAULT_OPENAI_TIMEOUT_MS,
  DEFAULT_PORT,
  EnvValidationError,
  loadAppConfig,
  type AppConfig,
  type OpenAIConfig,
} from '../config/env';
import { SERVER_GAME_MODULES } from '../game-registry/registry';
import { createRulesContextRegistry } from '../rules-context/rules-context.registry';
import type { CommanderRulesConfig } from '../sessions/automation/commander-context';
import {
  MAX_BENCH_REPEATS,
  fileMatchesGame,
  parseScenarioFile,
  planBenchmark,
  runBenchmark,
  worstCaseCostMicroUsd,
  type BenchPlan,
} from './harness';
import { InMemoryAiUsageStore } from './in-memory-usage';
import { renderBenchReportJson, renderBenchReportMarkdown, reportFileStem } from './report';
import { BENCH_VARIANTS, type BenchVariant } from './types';

/** PO-2: one real run costs at most $1. */
export const BENCH_MAX_USD_LIMIT = 1;
/** QD-10: a real run makes at least 3 repeats per scenario × variant. */
export const BENCH_MIN_REAL_REPEATS = 3;
export const BENCH_DEFAULT_REPEATS = { mock: 1, real: BENCH_MIN_REAL_REPEATS } as const;
/** Default report directory, relative to the repository root. */
export const BENCH_DEFAULT_OUT = join('docs', 'tasks', 'SWR-008', 'artifacts', 'benchmark');
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_REFUSED = 2;

export interface BenchArgs {
  scenarios: string;
  real: boolean;
  /** USD, 0 < x ≤ 1; only with `real`. */
  maxUsd: number | null;
  repeats: number;
  /** `null` → the commander's configured role (real) / the default role (mock). */
  role: AIModelRole | null;
  variants: BenchVariant[];
  out: string | null;
  dryRun: boolean;
}

export type BenchArgsResult = { ok: true; args: BenchArgs } | { ok: false; message: string };

const VALUE_FLAGS = [
  '--scenarios',
  '--max-usd',
  '--repeats',
  '--role',
  '--variants',
  '--out',
] as const;
const BOOLEAN_FLAGS = ['--real', '--dry-run'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
type BooleanFlag = (typeof BOOLEAN_FLAGS)[number];

const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;

function isValueFlag(name: string): name is ValueFlag {
  return (VALUE_FLAGS as readonly string[]).includes(name);
}

function isBooleanFlag(name: string): name is BooleanFlag {
  return (BOOLEAN_FLAGS as readonly string[]).includes(name);
}

/** Pure parsing and checking of the arguments (no configuration, no I/O). */
export function parseBenchArgs(argv: readonly string[]): BenchArgsResult {
  const values = new Map<ValueFlag, string>();
  const flags = new Set<BooleanFlag>();
  const fail = (message: string): BenchArgsResult => ({ ok: false, message });
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? '';
    if (token === '--') continue; // `pnpm run x -- args` may pass the separator through
    const eq = token.indexOf('=');
    const name = eq > 0 ? token.slice(0, eq) : token;
    if (isBooleanFlag(name)) {
      if (eq > 0) return fail(`${name} takes no value`);
      if (flags.has(name)) return fail(`${name} is given twice`);
      flags.add(name);
      continue;
    }
    if (!isValueFlag(name)) return fail(`unknown argument ${JSON.stringify(token.slice(0, 40))}`);
    if (values.has(name)) return fail(`${name} is given twice`);
    let value: string | undefined;
    if (eq > 0) value = token.slice(eq + 1);
    else {
      value = argv[i + 1];
      i += 1;
    }
    if (value === undefined || value === '' || value.startsWith('--')) {
      return fail(`${name} needs a value`);
    }
    values.set(name, value);
  }

  const real = flags.has('--real');
  const scenarios = values.get('--scenarios');
  if (scenarios === undefined) return fail('--scenarios <file> is required');

  const maxUsdText = values.get('--max-usd');
  if (maxUsdText !== undefined && !real) {
    return fail('--max-usd is only allowed together with --real');
  }
  let maxUsd: number | null = null;
  if (real) {
    if (maxUsdText === undefined) {
      return fail(`--real needs --max-usd <amount> (0 < amount <= ${BENCH_MAX_USD_LIMIT})`);
    }
    const parsed = DECIMAL.test(maxUsdText) ? Number(maxUsdText) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > BENCH_MAX_USD_LIMIT) {
      return fail(`--max-usd must be a number > 0 and <= ${BENCH_MAX_USD_LIMIT} (USD)`);
    }
    maxUsd = parsed;
  }

  const repeatsText = values.get('--repeats');
  let repeats: number = real ? BENCH_DEFAULT_REPEATS.real : BENCH_DEFAULT_REPEATS.mock;
  if (repeatsText !== undefined) {
    repeats = INTEGER.test(repeatsText) ? Number(repeatsText) : Number.NaN;
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_BENCH_REPEATS) {
      return fail(`--repeats must be an integer 1..${MAX_BENCH_REPEATS}`);
    }
  }
  if (real && repeats < BENCH_MIN_REAL_REPEATS) {
    return fail(`a real run needs --repeats >= ${BENCH_MIN_REAL_REPEATS} (QD-10)`);
  }

  const roleText = values.get('--role');
  let role: AIModelRole | null = null;
  if (roleText !== undefined) {
    if (roleText !== 'tactical' && roleText !== 'strategy') {
      return fail('--role must be tactical or strategy');
    }
    role = roleText;
  }

  let variants: BenchVariant[] = [...BENCH_VARIANTS];
  const variantsText = values.get('--variants');
  if (variantsText !== undefined) {
    const list = variantsText.split(',').map((v) => v.trim());
    const known = new Set<string>(BENCH_VARIANTS);
    if (list.some((v) => !known.has(v)) || new Set(list).size !== list.length) {
      return fail(`--variants must be a comma list of distinct ${BENCH_VARIANTS.join(' | ')}`);
    }
    // Canonical order.
    variants = BENCH_VARIANTS.filter((v) => list.includes(v));
  }

  return {
    ok: true,
    args: {
      scenarios,
      real,
      maxUsd,
      repeats,
      role,
      variants,
      out: values.get('--out') ?? null,
      dryRun: flags.has('--dry-run'),
    },
  };
}

export interface BenchCliDeps {
  /** Reads and validates the application configuration (real runs only). */
  loadConfig: () => AppConfig;
  /** Server modules of the playable games (the game registry). */
  modules: readonly ServerGameModule[];
  /** Repository root: the games' knowledge bases and the default report directory are relative to it. */
  repoRoot: string;
  /** Base of relative `--scenarios` / `--out` paths. */
  cwd: string;
  readText: (path: string) => string;
  /** Writes a file, creating its directory. */
  writeText: (path: string, text: string) => void;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  now: () => Date;
  monotonicNow: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Test only: fake fetch handed to the OpenAI SDK (with a non-`test` config). */
  openaiFetch?: typeof fetch;
}

/** OpenAI off: the mock run's configuration (nothing read from the environment). */
const MOCK_OPENAI: OpenAIConfig = Object.freeze({
  enabled: false,
  apiKeyConfigured: false,
  strategyModel: null,
  tacticalModel: null,
  maxCostPerSessionUsd: null,
  timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS,
  maxRetries: DEFAULT_OPENAI_MAX_RETRIES,
});

function mockConfig(repoRoot: string): AppConfig {
  return Object.freeze({
    nodeEnv: 'development',
    databaseUrl: 'file:./bench-mock-unused.db',
    port: DEFAULT_PORT,
    openai: MOCK_OPENAI,
    aiCommander: DEFAULT_AI_COMMANDER,
    knowledgeBaseRoot: repoRoot,
  });
}

function usdText(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(6)}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unexpected non-error value';
}

class Refusal extends Error {}

/** Real-run preflight: configuration, environment, OpenAI on, priced model. Throws `Refusal`. */
function preflightReal(
  deps: BenchCliDeps,
  args: BenchArgs,
): { config: AppConfig; role: AIModelRole; model: string } {
  let config: AppConfig;
  try {
    config = deps.loadConfig();
  } catch (error) {
    // EnvValidationError names variables and fixed reasons only; anything else may carry values → fixed text.
    throw new Refusal(
      error instanceof EnvValidationError
        ? error.message
        : 'the configuration could not be read (unexpected error)',
    );
  }
  if (config.nodeEnv === 'test') {
    throw new Refusal('a real run is not allowed under NODE_ENV=test');
  }
  if (config.openai.enabled !== true) {
    throw new Refusal('a real run needs OPENAI_ENABLED=true and a configured key');
  }
  const role = args.role ?? config.aiCommander.modelRole;
  const model = modelForRole(role, config.openai);
  if (model === null || pricingFor(model) === null) {
    throw new Refusal(
      `the ${role} model has no price in the pricing table: refusing (cost could not be bounded)`,
    );
  }
  return { config, role, model };
}

function printPlan(
  deps: BenchCliDeps,
  gameId: string,
  plan: BenchPlan,
  rulesConfig: CommanderRulesConfig,
): void {
  const tooLarge = plan.calls.filter((c) => c.upperBoundTokens === null).length;
  deps.stdout(
    `bench plan: game=${gameId} scenarios=${plan.scenarios} variants=${plan.variants.join(',')} ` +
      `repeats=${plan.repeats} decisions=${plan.decisions} model-calls=${plan.modelCalls}` +
      (tooLarge > 0 ? ` prompt-too-large=${tooLarge * plan.repeats}` : ''),
  );
  deps.stdout(
    `bench rules: version=${plan.rulesVersion ?? 'none'} maxChars=${rulesConfig.maxChars} ` +
      `maxPromptTokens=${rulesConfig.maxPromptTokens}`,
  );
  for (const variant of ['openai-no-rules', 'openai-rules'] as const) {
    const bounds = plan.calls
      .filter((c) => c.variant === variant && c.upperBoundTokens !== null)
      .map((c) => c.upperBoundTokens as number);
    if (bounds.length === 0) continue;
    deps.stdout(
      `bench prompt upper bound (${variant}): min=${Math.min(...bounds)} max=${Math.max(...bounds)} tokens`,
    );
  }
}

/** Runs the command line; resolves with the exit code. Never throws. */
export async function runBenchCli(argv: readonly string[], deps: BenchCliDeps): Promise<number> {
  const parsed = parseBenchArgs(argv);
  if (!parsed.ok) {
    deps.stderr(`bench: refused: ${parsed.message}`);
    return EXIT_REFUSED;
  }
  const args = parsed.args;

  let config: AppConfig;
  let role: AIModelRole;
  let model: string | null;
  try {
    if (args.real) {
      ({ config, role, model } = preflightReal(deps, args));
    } else {
      config = mockConfig(deps.repoRoot);
      role = args.role ?? DEFAULT_AI_COMMANDER.modelRole;
      model = null;
    }
  } catch (error) {
    if (error instanceof Refusal) {
      deps.stderr(`bench: refused: ${error.message}`);
      return EXIT_REFUSED;
    }
    deps.stderr(`bench: failed: ${describeError(error)}`);
    return EXIT_FAILED;
  }

  try {
    const file = parseScenarioFile(JSON.parse(deps.readText(resolve(deps.cwd, args.scenarios))));
    // The rules providers exactly as the server builds them for the openai commander with rules on.
    const registry = createRulesContextRegistry({
      config: {
        ...config,
        aiCommander: { ...config.aiCommander, provider: 'openai', rulesContext: 'on' },
        knowledgeBaseRoot: deps.repoRoot,
      },
      modules: deps.modules,
    });
    const gameModule = deps.modules.find((m) =>
      fileMatchesGame(file, m, registry.forGame(m.definition.id)),
    );
    if (!gameModule) {
      deps.stderr(`bench: failed: no server module for game ${file.gameId}`);
      return EXIT_FAILED;
    }
    const rules = registry.forGame(gameModule.definition.id);
    const rulesConfig: CommanderRulesConfig = {
      enabled: true,
      maxChars: config.aiCommander.rulesMaxChars,
      maxPromptTokens: config.aiCommander.maxPromptTokens,
    };

    const plan = planBenchmark({
      file,
      module: gameModule,
      rules,
      variants: args.variants,
      repeats: args.repeats,
      modelRole: role,
      rulesConfig,
    });
    printPlan(deps, file.gameId, plan, rulesConfig);
    const maxRetries = config.openai.maxRetries;
    if (args.real && model !== null && args.maxUsd !== null) {
      const worst = worstCaseCostMicroUsd(plan, model, role, maxRetries) ?? 0;
      const cap = usdToMicroUsd(args.maxUsd);
      deps.stdout(
        `bench worst case: model=${model} role=${role} retries=${maxRetries}: ${usdText(worst)} ` +
          `(Σ reservations of ${plan.modelCalls} calls); hard cap --max-usd ${usdText(cap)}; ` +
          `the run can spend at most ${usdText(Math.min(worst, cap))}`,
      );
    } else {
      deps.stdout('bench worst case: mock provider, $0 (no paid call)');
      for (const priced of Object.keys(MODEL_PRICING)) {
        const worst = worstCaseCostMicroUsd(plan, priced, role, maxRetries);
        if (worst !== null) {
          deps.stdout(
            `bench worst case if real with model=${priced} role=${role} retries=${maxRetries}: ${usdText(worst)}`,
          );
        }
      }
    }
    if (args.dryRun) {
      deps.stdout('bench dry run: nothing was called, no report written');
      return EXIT_OK;
    }

    const startedAt = deps.now();
    const stem = reportFileStem(args.real ? 'real' : 'mock', startedAt);
    const budgetKey = `bench-${stem}`;
    const runtime: AiRuntime = aiRuntime(
      { sleep: deps.sleep, random: deps.random, monotonicNow: deps.monotonicNow },
      (line) => deps.stdout(line),
    );
    const usage = new InMemoryAiUsageStore(deps.now);
    const budget = new BudgetService(usage);
    const mock = new MockAIProvider({ runtime, maxRetries: config.openai.maxRetries });
    let decisions: AiDecisionService;
    if (args.real && config.openai.enabled && args.maxUsd !== null) {
      // The run's own limit: `--max-usd` replaces the per-session limit of the configuration.
      const openai = { ...config.openai, maxCostPerSessionUsd: args.maxUsd };
      const client = lazyOpenAIClient({ openai, nodeEnv: config.nodeEnv, fetch: deps.openaiFetch });
      const availability = new ModelAvailabilityService({
        client,
        monotonicNow: deps.monotonicNow,
      });
      const openaiProvider = new OpenAIProvider({
        openai,
        client,
        runtime,
        onModelNotFound: (m) => availability.invalidate(m),
      });
      decisions = new AiDecisionService({
        openai,
        mock,
        openaiProvider,
        availability,
        budget,
        usage,
        runtime,
      });
    } else {
      decisions = new AiDecisionService({
        openai: MOCK_OPENAI,
        mock,
        openaiProvider: null,
        availability: null,
        budget,
        usage,
        runtime,
      });
    }

    const report = await runBenchmark({
      file,
      module: gameModule,
      rules,
      variants: args.variants,
      repeats: args.repeats,
      decisions,
      usage,
      requested: args.real ? 'auto' : 'mock',
      budgetKey,
      modelRole: role,
      rulesConfig,
      maxUsd: args.maxUsd,
      monotonicNow: deps.monotonicNow,
      now: () => deps.now().toISOString(),
      onProgress: (line) => deps.stdout(line),
    });

    const outDir =
      args.out === null
        ? join(deps.repoRoot, BENCH_DEFAULT_OUT)
        : isAbsolute(args.out)
          ? args.out
          : resolve(deps.cwd, args.out);
    const jsonPath = join(outDir, `${stem}.json`);
    const mdPath = join(outDir, `${stem}.md`);
    deps.writeText(jsonPath, renderBenchReportJson(report));
    deps.writeText(mdPath, renderBenchReportMarkdown(report));
    deps.stdout(
      `bench done: mode=${report.mode} decisions=${report.decisions.length} spent=${usdText(report.spentMicroUsd)}` +
        (report.stopped === null ? '' : ` stopped=${report.stopped}`),
    );
    deps.stdout(`bench report: ${jsonPath}`);
    deps.stdout(`bench report: ${mdPath}`);
    return EXIT_OK;
  } catch (error) {
    deps.stderr(`bench: failed: ${describeError(error)}`);
    return EXIT_FAILED;
  }
}

/** Entry point of `node dist/bench/cli.js` (CommonJS build). */
async function main(): Promise<void> {
  const apiRoot = join(__dirname, '..', '..');
  const repoRoot = join(apiRoot, '..', '..');
  process.exitCode = await runBenchCli(process.argv.slice(2), {
    loadConfig: () => loadAppConfig({ dotenvPath: join(apiRoot, '.env') }),
    modules: SERVER_GAME_MODULES,
    repoRoot,
    cwd: process.cwd(),
    readText: (path) => readFileSync(path, 'utf8'),
    writeText: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    now: () => new Date(),
    monotonicNow: () => performance.now(),
  });
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  void main();
}
