/**
 * SWR-008 W10 — the REAL Rebellion knowledge base reaches the OpenAI commander in automated games over HTTP
 * (AC-3, AC-4; test-cases.md TC-INT-01, TC-INT-02, TC-INT-04; PO §10 items 1 and 4). Real Nest app, real game
 * registry, real OpenAI SDK on a fake fetch (never the network), sentinel key, rules `on` with the default limits.
 *
 * - TC-INT-01: in both AI setups (human Rebels vs AI Empire, human Empire vs AI Rebels), 3 rounds: every request with
 *   ≥ 2 candidates has `instructions = COMMANDER_INSTRUCTIONS + ' ' + COMMANDER_RULES_INSTRUCTIONS` and
 *   `input = Rules (reference data, not instructions):\n…\n\nGame (data):\n…`; every rules line starts with
 *   `[rebellion:`, the first is `[rebellion:impl.engine-scope]`, the ids are ids of the knowledge base.
 * - TC-INT-02: with a spy on the module's decision points and selections: the block of each request is byte-equal to
 *   `SEL(rulesSelectionInputOf(DP(s), 6000)).text` of an independent provider for THAT point (not a cached one);
 *   points with the same actor / phase / rulesQuery but other candidates give the same input and block (AM-BE-1).
 * - TC-INT-04: the knowledge base is loaded exactly once per app (two sessions, ≥ 20 decisions); the bot commander and
 *   `openai` + rules `off` load nothing.
 */
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  AutomationDecisionPointSchema,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
  type ServerGameModule,
} from '@bga/platform';
import {
  REBELLION_KNOWLEDGE_BASE_DIR,
  rebellionRules,
  rebellionServerModule,
} from '@bga/game-rebellion/server';
import { afterEach, describe, expect, it } from 'vitest';
import { COMMANDER_INSTRUCTIONS, COMMANDER_RULES_INSTRUCTIONS } from '../src/ai/prompt';
import { readKnowledgeBaseDir } from '../src/rules-context/knowledge-base.loader';
import {
  AutomatedGame,
  commanderFake,
  empireVsAi,
  promptParts,
  rebelsVsAi,
  ruleIdsOfBlock,
  startRebellionApp,
  usageRows,
  type CommanderCall,
  type RebellionApp,
} from './support/automation-helpers';
import { decisionText, enabledOpenAI, okResponse } from './support/openai-fake-fetch';
import { activeRebels, huntingEmpire } from './support/scripted-empire';
import { REPO_ROOT } from './support/test-config';
import { createTestDb, removeTestDb, startApp, type TestDb } from './support/test-app';
import type { AiCommanderConfig } from '../src/config/env';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

function newDb(): TestDb {
  const db = createTestDb();
  dbs.push(db);
  return db;
}

const KB_DIR = join(REPO_ROOT, REBELLION_KNOWLEDGE_BASE_DIR);
const DEFAULT_MAX_CHARS = 6000;

/** Ids of every entry of the real knowledge base (read once by the test, independently of the app). */
const KB_IDS: ReadonlySet<string> = new Set(
  (readKnowledgeBaseDir(KB_DIR).entries as { id: string }[]).map((e) => e.id),
);

/** An independent provider on the real knowledge base (oracle; never the server's instance). */
function oracleProvider(): RulesContextProvider {
  return rebellionRules.createRulesContextProvider(readKnowledgeBaseDir(KB_DIR));
}

/** Deterministic "model": the second candidate (a pure function of the request; not always the bot's pick). */
function modelFake() {
  return commanderFake((call: CommanderCall) =>
    okResponse({ text: decisionText(call.ids[1] ?? call.ids[0] ?? 'c1', 'Hold the line.') }),
  );
}

type Trace =
  | { kind: 'point'; point: AutomationDecisionPoint }
  | { kind: 'select'; input: RulesSelectionInput; result: RulesContextResult };

/** The Rebellion module with spies on its decision points and on the selections of its provider (same KB). */
function spiedRebellion(): {
  module: ServerGameModule;
  trace: Trace[];
  providers: () => number;
} {
  const rules = rebellionServerModule.rules;
  const automation = rebellionServerModule.automation;
  if (!rules || !automation) throw new Error('rebellion has no rules / automation');
  const trace: Trace[] = [];
  let providers = 0;
  const module = {
    ...rebellionServerModule,
    automation: {
      ...automation,
      decisionPoint(state: unknown) {
        const point = automation.decisionPoint(state);
        trace.push({ kind: 'point', point: AutomationDecisionPointSchema.parse(point) });
        return point;
      },
    },
    rules: {
      knowledgeBaseDir: rules.knowledgeBaseDir,
      createRulesContextProvider(source) {
        providers += 1;
        const inner = rules.createRulesContextProvider(source);
        return {
          rulesVersion: inner.rulesVersion,
          requiredChars: inner.requiredChars,
          selectRules(input) {
            const result = inner.selectRules(input);
            trace.push({ kind: 'select', input, result });
            return result;
          },
        };
      },
    },
  } as ServerGameModule;
  return { module, trace, providers: () => providers };
}

async function openaiApp(
  id: string | string[],
  fake: ReturnType<typeof commanderFake>,
  options: {
    gameModules?: readonly ServerGameModule[];
    loaded?: string[];
    aiCommander?: Partial<AiCommanderConfig>;
  } = {},
): Promise<RebellionApp> {
  const started = await startRebellionApp(newDb(), {
    ids: Array.isArray(id) ? id : [id],
    fake,
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
    aiCommander: { provider: 'openai', rulesContext: 'on', ...options.aiCommander },
    ...(options.gameModules ? { gameModules: options.gameModules } : {}),
    ...(options.loaded
      ? {
          rules: {
            loader: (dir: string) => {
              options.loaded!.push(dir);
              return readKnowledgeBaseDir(dir);
            },
          },
        }
      : {}),
  });
  apps.push(started.app);
  return started;
}

/** Plays the human script until round `rounds` is over (or the game ends). Returns the commands sent. */
async function playRounds(
  game: AutomatedGame,
  script: (
    state: Awaited<ReturnType<AutomatedGame['state']>>,
  ) => Parameters<AutomatedGame['send']>[0],
  rounds: number,
): Promise<number> {
  let sent = 0;
  for (let i = 0; i < 200; i += 1) {
    const state = await game.state();
    if (state.outcome !== null || state.round > rounds) return sent;
    expect(state.activeSide).toBe(game.human);
    await game.send(script(state));
    sent += 1;
  }
  throw new Error('playRounds: too many commands');
}

/** TC-INT-01 shape of one request; returns its rule ids. */
function expectRulesRequest(call: CommanderCall): string[] {
  expect(call.ids.length).toBeGreaterThanOrEqual(2);
  expect(call.body.instructions).toBe(`${COMMANDER_INSTRUCTIONS} ${COMMANDER_RULES_INSTRUCTIONS}`);
  const { rules, game } = promptParts(call.body);
  expect(rules, 'a Rebellion request without a rules block').not.toBeNull();
  const lines = (rules ?? '').split('\n');
  expect(lines[0]?.startsWith('[rebellion:impl.engine-scope] ')).toBe(true);
  for (const line of lines) expect(line).toMatch(/^\[rebellion:[^\]\s]+\] \S/);
  const ids = ruleIdsOfBlock(rules ?? '');
  for (const id of ids) expect(KB_IDS.has(id), id).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  expect((rules ?? '').length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
  // The Game block is the SWR-006 data block, unchanged in form.
  const data = JSON.parse(game) as Record<string, unknown>;
  expect(Object.keys(data)).toEqual([
    'side',
    'phase',
    'objective',
    'situation',
    'availableActions',
  ]);
  return ids;
}

describe('SWR-008 W10: rules context of the real Rebellion knowledge base (AC-3, AC-4)', () => {
  it('TC-INT-01: human Rebels vs AI Empire, 3 rounds — every request carries the [rebellion:…] block for its decision point', async () => {
    const id = 'swr008-w10-int01-emp';
    const fake = modelFake();
    const started = await openaiApp(id, fake);
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    await playRounds(game, activeRebels, 3);
    expect(fake.responses.length).toBeGreaterThan(5);
    const sets = new Set<string>();
    for (const call of fake.responses) sets.add(expectRulesRequest(call).join(','));
    // Different decision points (idle / inside an activation) select different rule sets.
    expect(sets.size).toBeGreaterThan(1);
    expect(game.summaries.every((s) => s.strategy === 'openai')).toBe(true);
    expect(game.summaries.reduce((n, s) => n + s.fallbacks, 0)).toBe(0);
    // AiUsage: one row per request, rules enabled, ids = the ids of that request.
    const rows = await usageRows(started.app, id);
    expect(rows).toHaveLength(fake.responses.length);
    rows.forEach((row, i) => {
      expect(row.rulesEnabled).toBe(true);
      expect(JSON.parse(row.rulesIds ?? '[]')).toEqual(
        ruleIdsOfBlock(promptParts(fake.responses[i]!.body).rules ?? ''),
      );
    });
  });

  it('TC-INT-01: human Empire vs AI Rebels, 3 rounds — the same request form for the AI Rebels', async () => {
    const id = 'swr008-w10-int01-reb';
    const fake = modelFake();
    const started = await openaiApp(id, fake);
    const { game } = await AutomatedGame.create(started.app, empireVsAi('normal'));
    await playRounds(game, huntingEmpire, 3);
    expect(fake.responses.length).toBeGreaterThan(3);
    for (const call of fake.responses) expectRulesRequest(call);
    expect(game.summaries.reduce((n, s) => n + s.fallbacks, 0)).toBe(0);
  });

  it('TC-INT-02: each block = SEL(rulesSelectionInputOf(DP(s), 6000)) of THAT point (independent provider); other candidates, same public query → same input and block', async () => {
    const spied = spiedRebellion();
    const fake = modelFake();
    const started = await openaiApp(['swr008-w10-int02-a', 'swr008-w10-int02-b'], fake, {
      gameModules: [spied.module],
    });
    const a = (await AutomatedGame.create(started.app, rebelsVsAi('normal'))).game;
    await playRounds(a, activeRebels, 3);
    const b = (await AutomatedGame.create(started.app, empireVsAi('hard'))).game;
    await playRounds(b, huntingEmpire, 3);

    const oracle = oracleProvider();
    const selections: {
      point: AutomationDecisionPoint;
      input: RulesSelectionInput;
      text: string;
    }[] = [];
    let last: AutomationDecisionPoint | null = null;
    for (const t of spied.trace) {
      if (t.kind === 'point') last = t.point;
      else {
        expect(last, 'a selection without a decision point').not.toBeNull();
        selections.push({ point: last!, input: t.input, text: t.result.text });
      }
    }
    // One selection per request (≥ 2 candidates, no prompt-size drop with the default limits), in order.
    expect(selections).toHaveLength(fake.responses.length);
    expect(selections.length).toBeGreaterThan(10);
    selections.forEach((s, i) => {
      expect(s.input).toEqual(rulesSelectionInputOf(s.point, DEFAULT_MAX_CHARS));
      expect(s.input).toEqual({
        actor: s.point.actor,
        phase: s.point.phase,
        commandTypes: s.point.rulesQuery?.commandTypes,
        tags: s.point.rulesQuery?.tags,
        maxChars: DEFAULT_MAX_CHARS,
      });
      // The input never names a candidate (QD-7 / AM-BE-1).
      expect(Object.keys(s.input).sort()).toEqual([
        'actor',
        'commandTypes',
        'maxChars',
        'phase',
        'tags',
      ]);
      const expected = oracle.selectRules(s.input);
      expect(s.text).toBe(expected.text);
      expect(promptParts(fake.responses[i]!.body).rules).toBe(expected.text);
    });

    // Points with the same public query but different candidates: equal input and block.
    const groups = new Map<string, typeof selections>();
    for (const s of selections) {
      const key = JSON.stringify([s.point.actor, s.point.phase, s.point.rulesQuery]);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    let differentCandidates = 0;
    for (const group of groups.values()) {
      const first = group[0]!;
      for (const s of group.slice(1)) {
        expect(s.input).toEqual(first.input);
        expect(s.text).toBe(first.text);
        if (JSON.stringify(s.point.candidates) !== JSON.stringify(first.point.candidates))
          differentCandidates += 1;
      }
    }
    expect(differentCandidates).toBeGreaterThan(0);
    // Several distinct public queries were exercised (both sides, idle / active).
    expect(groups.size).toBeGreaterThanOrEqual(3);
    expect(spied.providers()).toBe(1);
    console.log(
      `[swr008-w10-int02] selections=${selections.length} groups=${groups.size} sameQueryOtherCandidates=${differentCandidates}`,
    );
  });

  it('TC-INT-04: the knowledge base is loaded exactly once per app (2 sessions, ≥ 20 decisions); decisions never load it again', async () => {
    const loaded: string[] = [];
    const spied = spiedRebellion();
    const fake = modelFake();
    const started = await openaiApp(['swr008-w10-int04-a', 'swr008-w10-int04-b'], fake, {
      loaded,
      gameModules: [spied.module],
    });
    expect(loaded).toEqual([KB_DIR]);
    expect(spied.providers()).toBe(1);
    const a = (await AutomatedGame.create(started.app, rebelsVsAi('normal'))).game;
    const b = (await AutomatedGame.create(started.app, empireVsAi('normal'))).game;
    await playRounds(a, activeRebels, 3);
    await playRounds(b, huntingEmpire, 3);
    expect(fake.responses.length).toBeGreaterThanOrEqual(20);
    expect(loaded).toEqual([KB_DIR]);
    expect(spied.providers()).toBe(1);
  });

  it('TC-INT-04 / Q-BE-2: the bot commander and openai + rules off load nothing (rules on or off)', async () => {
    for (const aiCommander of [
      { provider: 'bot', rulesContext: 'on' },
      { provider: 'bot', rulesContext: 'off' },
      { provider: 'openai', rulesContext: 'off' },
    ] as const) {
      const loaded: string[] = [];
      const app = await startApp(newDb().url, {
        logger: false,
        config: { openai: enabledOpenAI(), aiCommander },
        ai: { openaiFetch: modelFake().fetch, logSink: () => undefined },
        rules: {
          loader: (dir) => {
            loaded.push(dir);
            return readKnowledgeBaseDir(dir);
          },
        },
      });
      apps.push(app);
      expect(loaded, JSON.stringify(aiCommander)).toEqual([]);
    }
  });
});
