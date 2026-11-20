/**
 * SWR-008 W8 — command line of the benchmark (PO-2: real runs only with an explicit flag and a hard cap ≤ $1):
 * TC-BEN-08 (refusals before any network access: `--max-usd` without `--real`, `NODE_ENV=test`, OpenAI off),
 * TC-BEN-09 (`--max-usd` missing / > 1 / ≤ 0 / not a number), TC-BEN-10 (the real path with a FAKE fetch and a
 * `development` config: the budget reservation stops the run at the cap, `spent ≤ max`), TC-BEN-11 (no key, no session
 * ids in logs / reports; the run's own `bench-<runId>` budget), mock run + dry run of the CLI, TC-MEAS-04 (functions).
 * Never the network: the fetch guard of the test setup is active and the OpenAI SDK gets a fake fetch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BENCH_DEFAULT_OUT,
  EXIT_FAILED,
  EXIT_OK,
  EXIT_REFUSED,
  parseBenchArgs,
  runBenchCli,
  type BenchCliDeps,
} from '../../src/bench/cli';
import type { BenchReport } from '../../src/bench/types';
import { EnvValidationError, type AppConfig } from '../../src/config/env';
import { SERVER_GAME_MODULES } from '../../src/game-registry/registry';
import {
  SENTINEL_KEY,
  createFakeFetch,
  decisionText,
  enabledOpenAI,
  errorReply,
  modelReply,
  okResponse,
  type FakeFetch,
} from '../support/openai-fake-fetch';
import { REPO_ROOT, testConfig } from '../support/test-config';

const API_DIR = join(REPO_ROOT, 'apps', 'api');
const SCENARIOS_ARG = '../../packages/games/rebellion/benchmark/scenarios.json';
const FIXED_DATE = new Date('2026-11-20T10:11:12.000Z');
const SCENARIO_SESSION_IDS: string[] = (
  JSON.parse(readFileSync(join(API_DIR, SCENARIOS_ARG), 'utf8')) as {
    scenarios: { sessionId: string }[];
  }
).scenarios.map((s) => s.sessionId);

/** A development config with OpenAI on (sentinel key) — usable only with a fake fetch. */
function realConfig(over: Partial<Parameters<typeof enabledOpenAI>[0]> = {}): AppConfig {
  return testConfig({ nodeEnv: 'development', openai: enabledOpenAI(over) });
}

/** First legal id of a Responses request (from the strict JSON schema's enum). */
function firstLegalId(body: unknown): string {
  const b = body as {
    text?: { format?: { schema?: { properties?: { selectedActionId?: { enum?: string[] } } } } };
  };
  return b.text?.format?.schema?.properties?.selectedActionId?.enum?.[0] ?? 'none';
}

function openAiFake(usage = { input: 3000, output: 50 }): FakeFetch {
  return createFakeFetch((req) => {
    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path.startsWith('/v1/models/')) {
      return modelReply(decodeURIComponent(path.slice('/v1/models/'.length)));
    }
    if (req.method === 'POST' && path.endsWith('/responses')) {
      return okResponse({ text: decisionText(firstLegalId(req.body)), usage });
    }
    return errorReply(404);
  });
}

interface Harness {
  deps: BenchCliDeps;
  out: string[];
  err: string[];
  files: Map<string, string>;
  loadConfigCalls: () => number;
}

function cliDeps(over: Partial<BenchCliDeps> = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  let loads = 0;
  const loadConfig = over.loadConfig ?? (() => testConfig());
  const deps: BenchCliDeps = {
    modules: SERVER_GAME_MODULES,
    repoRoot: REPO_ROOT,
    cwd: API_DIR,
    readText: (path) => readFileSync(path, 'utf8'),
    writeText: (path, text) => {
      files.set(path, text);
    },
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    now: () => FIXED_DATE,
    monotonicNow: () => 1000,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
    ...over,
    loadConfig: () => {
      loads += 1;
      return loadConfig();
    },
  };
  return { deps, out, err, files, loadConfigCalls: () => loads };
}

const realArgs = (...extra: string[]) => ['--scenarios', SCENARIOS_ARG, '--real', ...extra];

describe('parseBenchArgs', () => {
  it('mock defaults: 1 repeat, all three variants, no cap', () => {
    const r = parseBenchArgs(['--', '--scenarios', 'x.json']);
    expect(r).toEqual({
      ok: true,
      args: {
        scenarios: 'x.json',
        real: false,
        maxUsd: null,
        repeats: 1,
        role: null,
        variants: ['bot', 'openai-no-rules', 'openai-rules'],
        out: null,
        dryRun: false,
      },
    });
  });

  it('real with a cap: 3 repeats by default (QD-10); --flag=value form; canonical variant order', () => {
    const r = parseBenchArgs([
      '--scenarios=x.json',
      '--real',
      '--max-usd=0.5',
      '--role',
      'strategy',
      '--variants',
      'openai-rules,bot',
      '--out',
      'dir',
      '--dry-run',
    ]);
    expect(r.ok && r.args).toEqual({
      scenarios: 'x.json',
      real: true,
      maxUsd: 0.5,
      repeats: 3,
      role: 'strategy',
      variants: ['bot', 'openai-rules'],
      out: 'dir',
      dryRun: true,
    });
    expect(parseBenchArgs(['--scenarios', 'x', '--real', '--max-usd', '1']).ok).toBe(true);
    expect(
      parseBenchArgs(['--scenarios', 'x', '--real', '--max-usd', '0.01', '--repeats', '5']).ok,
    ).toBe(true);
  });

  it.each([
    [['--scenarios', 'x', '--max-usd', '0.5'], /only allowed together with --real/],
    [['--scenarios', 'x', '--real'], /--real needs --max-usd/],
    [
      ['--scenarios', 'x', '--real', '--max-usd', '1.01'],
      /--max-usd must be a number > 0 and <= 1/,
    ],
    [['--scenarios', 'x', '--real', '--max-usd', '2'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', '0'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', '0.0'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', '-1'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', 'abc'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', '1e-1'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', 'Infinity'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd', '0x1'], /--max-usd must be/],
    [['--scenarios', 'x', '--real', '--max-usd'], /--max-usd needs a value/],
    [['--scenarios', 'x', '--real', '--max-usd', '--repeats', '3'], /--max-usd needs a value/],
    [['--scenarios', 'x', '--real', '--max-usd', '0.5', '--max-usd', '0.1'], /given twice/],
    [['--scenarios', 'x', '--real', '--max-usd', '0.5', '--repeats', '2'], /needs --repeats >= 3/],
    [['--scenarios', 'x', '--repeats', '0'], /--repeats must be an integer/],
    [['--scenarios', 'x', '--repeats', '11'], /--repeats must be an integer/],
    [['--scenarios', 'x', '--repeats', '1.5'], /--repeats must be an integer/],
    [['--scenarios', 'x', '--role', 'chief'], /--role must be/],
    [['--scenarios', 'x', '--variants', 'bot,bot'], /--variants must be/],
    [['--scenarios', 'x', '--variants', 'gpt'], /--variants must be/],
    [['--scenarios', 'x', '--live'], /unknown argument/],
    [['--scenarios', 'x', '--real=yes', '--max-usd', '0.5'], /takes no value/],
    [['--real', '--max-usd', '0.5'], /--scenarios <file> is required/],
  ])('refuses %j (TC-BEN-08 / TC-BEN-09)', (argv, message) => {
    const r = parseBenchArgs(argv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(message);
  });
});

describe('refusals before any network access (TC-BEN-08, TC-BEN-09)', () => {
  it.each([
    [['--scenarios', SCENARIOS_ARG, '--max-usd', '0.5']],
    [realArgs()],
    [realArgs('--max-usd', '1.5')],
    [realArgs('--max-usd', '0')],
    [realArgs('--max-usd', '-0.5')],
    [realArgs('--max-usd', 'lots')],
  ])('%j → exit 2, no config read, no fetch, nothing written', async (argv) => {
    const fake = openAiFake();
    const h = cliDeps({ loadConfig: realConfig, openaiFetch: fake.fetch });
    expect(await runBenchCli(argv, h.deps)).toBe(EXIT_REFUSED);
    expect(h.err.join('\n')).toMatch(/^bench: refused: /);
    expect(fake.calls).toHaveLength(0);
    expect(h.files.size).toBe(0);
    expect(h.loadConfigCalls()).toBe(0);
  });

  it('--real under NODE_ENV=test → exit 2 before any fetch', async () => {
    const fake = openAiFake();
    const h = cliDeps({
      loadConfig: () => testConfig({ nodeEnv: 'test', openai: enabledOpenAI() }),
      openaiFetch: fake.fetch,
    });
    expect(await runBenchCli(realArgs('--max-usd', '0.5'), h.deps)).toBe(EXIT_REFUSED);
    expect(h.err).toEqual(['bench: refused: a real run is not allowed under NODE_ENV=test']);
    expect(fake.calls).toHaveLength(0);
    expect(h.files.size).toBe(0);
  });

  it('--real with OpenAI not enabled → exit 2 before any fetch', async () => {
    const fake = openAiFake();
    const h = cliDeps({
      loadConfig: () => testConfig({ nodeEnv: 'development' }),
      openaiFetch: fake.fetch,
    });
    expect(await runBenchCli(realArgs('--max-usd', '0.5'), h.deps)).toBe(EXIT_REFUSED);
    expect(h.err.join('\n')).toMatch(/needs OPENAI_ENABLED=true/);
    expect(fake.calls).toHaveLength(0);
  });

  it('--real with an unpriced model → exit 2 (the cost could not be bounded)', async () => {
    const fake = openAiFake();
    const h = cliDeps({
      loadConfig: () => realConfig({ tacticalModel: 'gpt-unknown-model' }),
      openaiFetch: fake.fetch,
    });
    expect(await runBenchCli(realArgs('--max-usd', '0.5'), h.deps)).toBe(EXIT_REFUSED);
    expect(h.err.join('\n')).toMatch(/no price/);
    expect(fake.calls).toHaveLength(0);
  });

  it('an invalid environment: names and reasons only; an unexpected error: a fixed text (no values)', async () => {
    const env = cliDeps({
      loadConfig: () => {
        throw new EnvValidationError([{ name: 'OPENAI_API_KEY', reason: 'is required' }]);
      },
    });
    expect(await runBenchCli(realArgs('--max-usd', '0.5'), env.deps)).toBe(EXIT_REFUSED);
    expect(env.err).toEqual(['bench: refused: Invalid environment: OPENAI_API_KEY: is required']);
    const odd = cliDeps({
      loadConfig: () => {
        throw new Error(`boom ${SENTINEL_KEY}`);
      },
    });
    expect(await runBenchCli(realArgs('--max-usd', '0.5'), odd.deps)).toBe(EXIT_REFUSED);
    expect(odd.err.join('\n')).not.toContain(SENTINEL_KEY);
    expect(odd.err.join('\n')).toMatch(/could not be read/);
  });
});

describe('mock mode and dry runs', () => {
  it('mock run: no configuration read, writes <out>/mock-<ts>.{json,md}', async () => {
    const h = cliDeps();
    const code = await runBenchCli(['--scenarios', SCENARIOS_ARG, '--out', 'some/dir'], h.deps);
    expect(h.err).toEqual([]);
    expect(code).toBe(EXIT_OK);
    expect(h.loadConfigCalls()).toBe(0);
    const dir = join(API_DIR, 'some', 'dir');
    expect([...h.files.keys()].sort()).toEqual([
      join(dir, 'mock-20261120-101112.json'),
      join(dir, 'mock-20261120-101112.md'),
    ]);
    const report = JSON.parse(h.files.get(join(dir, 'mock-20261120-101112.json'))!) as BenchReport;
    expect(report.mode).toBe('mock');
    expect(report.decisions).toHaveLength(14 * 3);
    expect(report.generatedAt).toBe(FIXED_DATE.toISOString());
    expect(h.out.some((l) => l.startsWith('bench plan: '))).toBe(true);
  });

  it('the default report directory is docs/tasks/SWR-008/artifacts/benchmark', async () => {
    const h = cliDeps();
    expect(await runBenchCli(['--scenarios', SCENARIOS_ARG, '--variants', 'bot'], h.deps)).toBe(
      EXIT_OK,
    );
    for (const path of h.files.keys()) {
      expect(path.startsWith(join(REPO_ROOT, BENCH_DEFAULT_OUT))).toBe(true);
    }
    expect(BENCH_DEFAULT_OUT).toBe(join('docs', 'tasks', 'SWR-008', 'artifacts', 'benchmark'));
  });

  it('mock dry run: prints the plan and informational worst cases, writes nothing', async () => {
    const h = cliDeps();
    expect(
      await runBenchCli(['--scenarios', SCENARIOS_ARG, '--dry-run', '--repeats', '3'], h.deps),
    ).toBe(EXIT_OK);
    expect(h.files.size).toBe(0);
    const text = h.out.join('\n');
    expect(text).toMatch(
      /bench plan: game=rebellion scenarios=14 variants=bot,openai-no-rules,openai-rules repeats=3 decisions=126 model-calls=84/,
    );
    expect(text).toMatch(/bench worst case: mock provider, \$0/);
    expect(text).toMatch(/if real with model=gpt-6-luna role=tactical retries=2: \$\d+\.\d{6}/);
    expect(text).toMatch(/bench dry run: nothing was called/);
  });

  it('real dry run: the full preflight, the plan and the worst case of the configured model — no fetch', async () => {
    const fake = openAiFake();
    const h = cliDeps({ loadConfig: realConfig, openaiFetch: fake.fetch });
    expect(await runBenchCli(realArgs('--max-usd', '1', '--dry-run'), h.deps)).toBe(EXIT_OK);
    expect(fake.calls).toHaveLength(0);
    expect(h.files.size).toBe(0);
    const text = h.out.join('\n');
    expect(text).toMatch(/model-calls=84/);
    const m =
      /bench worst case: model=gpt-6-luna role=tactical retries=2: \$(\d+\.\d{6}) \(Σ reservations of 84 calls\); hard cap --max-usd \$1\.000000; the run can spend at most \$(\d+\.\d{6})/.exec(
        text,
      );
    expect(m).not.toBeNull();
    const worst = Number(m![1]);
    expect(worst).toBeGreaterThan(0);
    expect(Number(m![2])).toBe(Math.min(worst, 1));
    expect(text).not.toContain(SENTINEL_KEY);
  });
});

describe('real path with a fake fetch (TC-BEN-10, TC-BEN-11, TC-MEAS-04)', () => {
  it('the budget reservation stops the run at --max-usd; spent ≤ max; no call after the cap', async () => {
    const fake = openAiFake({ input: 3000, output: 50 });
    const h = cliDeps({ loadConfig: realConfig, openaiFetch: fake.fetch });
    const code = await runBenchCli(realArgs('--max-usd', '0.005'), h.deps);
    expect(h.err).toEqual([]);
    expect(code).toBe(EXIT_OK);
    const jsonPath = [...h.files.keys()].find((k) => k.endsWith('.json'))!;
    expect(jsonPath).toBe(join(REPO_ROOT, BENCH_DEFAULT_OUT, 'real-20261120-101112.json'));
    const report = JSON.parse(h.files.get(jsonPath)!) as BenchReport;
    expect(report.mode).toBe('real');
    expect(report.stopped).toBe('cost-cap');
    expect(report.maxUsd).toBe(0.005);
    expect(report.spentMicroUsd).toBeGreaterThan(0);
    expect(report.spentMicroUsd).toBeLessThanOrEqual(5000);
    expect(report.model).toBe('gpt-6-luna-2026-10-01');
    // Every paid call is one model decision; nothing was called after the refusal.
    const paid = fake.callsTo('/responses').length;
    const modelDecisions = report.decisions.filter((d) => d.source === 'model');
    expect(paid).toBe(modelDecisions.length);
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(14 * 2 * 3);
    expect(modelDecisions.every((d) => d.inputTokens === 3000 && d.outputTokens === 50)).toBe(true);
    expect(modelDecisions.every((d) => d.costMicroUsd === 325)).toBe(true);
    expect(report.spentMicroUsd).toBe(325 * paid);
    // The bot variant keeps running for free; the model variants stop at the cap.
    expect(report.decisions.filter((d) => d.variant === 'bot')).toHaveLength(14 * 3);
    expect(h.out.join('\n')).toMatch(
      /bench cost-cap reached at step \d+\/126: no further model calls/,
    );
    // TC-MEAS-04 (functions): the metrics agree with the accounting rows of the run.
    const m = report.metrics;
    expect(report.usageByRules.total.costMicroUsd).toBe(report.spentMicroUsd);
    expect(report.usageByRules.withRules.inputTokens).toBe(m['openai-rules']!.inputTokens);
    expect(report.usageByRules.withoutRules.inputTokens).toBe(m['openai-no-rules']!.inputTokens);
    expect(report.usageByRules.withRules.costMicroUsd).toBe(m['openai-rules']!.costMicroUsd);
    expect(report.usageByRules.withoutRules.costMicroUsd).toBe(m['openai-no-rules']!.costMicroUsd);
    // The rules variant really sent rules; the other did not.
    const sentRules = fake
      .callsTo('/responses')
      .map((c) =>
        String((c.body as { instructions?: string }).instructions ?? '').includes('Rules lists'),
      );
    expect(sentRules.some(Boolean)).toBe(true);
    expect(sentRules.some((x) => !x)).toBe(true);
  });

  it('TC-BEN-11: no key and no scenario session id in logs or reports; the key only in the Authorization header', async () => {
    const fake = openAiFake();
    const h = cliDeps({ loadConfig: realConfig, openaiFetch: fake.fetch });
    expect(
      await runBenchCli(realArgs('--max-usd', '0.003', '--variants', 'openai-rules'), h.deps),
    ).toBe(EXIT_OK);
    const everything = [...h.out, ...h.err, ...h.files.values()].join('\n');
    expect(everything).not.toContain(SENTINEL_KEY);
    for (const id of SCENARIO_SESSION_IDS) expect(everything).not.toContain(id);
    // The AI log lines name only the benchmark's own budget key.
    const keys = [...everything.matchAll(/budgetKey=(\S+)/g)].map((x) => x[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys)).toEqual(new Set(['bench-real-20261120-101112']));
    for (const call of fake.calls) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${SENTINEL_KEY}`);
      expect(JSON.stringify(call.body ?? null)).not.toContain(SENTINEL_KEY);
      for (const id of SCENARIO_SESSION_IDS)
        expect(JSON.stringify(call.body ?? null)).not.toContain(id);
    }
  });

  it('a provider failure falls back to the bot with the commander code and the run goes on', async () => {
    const fake = createFakeFetch((req) => {
      const path = new URL(req.url).pathname;
      if (req.method === 'GET') return modelReply(path.split('/').pop()!);
      return errorReply(400, { code: 'invalid_request' });
    });
    const h = cliDeps({ loadConfig: realConfig, openaiFetch: fake.fetch });
    expect(
      await runBenchCli(realArgs('--max-usd', '0.5', '--variants', 'openai-no-rules'), h.deps),
    ).toBe(EXIT_OK);
    const report = JSON.parse(
      [...h.files.entries()].find(([k]) => k.endsWith('.json'))![1],
    ) as BenchReport;
    expect(report.stopped).toBeNull();
    expect(report.decisions).toHaveLength(14 * 3);
    expect(
      report.decisions.every((d) => d.source === 'bot' && d.fallbackCode === 'AI_PROVIDER_ERROR'),
    ).toBe(true);
    expect(report.metrics['openai-no-rules']!.validRate).toBe(0);
  });

  it('an unknown scenario file / game → exit 1', async () => {
    const h = cliDeps();
    expect(await runBenchCli(['--scenarios', 'does-not-exist.json'], h.deps)).toBe(EXIT_FAILED);
    const other = cliDeps({
      readText: () =>
        JSON.stringify({
          formatVersion: 1,
          gameId: 'no-such-game',
          scenarios: [JSON.parse(readFileSync(join(API_DIR, SCENARIOS_ARG), 'utf8')).scenarios[0]],
        }),
    });
    expect(await runBenchCli(['--scenarios', 'x.json'], other.deps)).toBe(EXIT_FAILED);
    expect(other.err.join('\n')).toMatch(/no server module for game no-such-game/);
  });
});
