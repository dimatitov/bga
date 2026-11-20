/**
 * SWR-008 W6b — the rules context reaches the OpenAI commander in automated games (C-10, plan-backend §3.1 / §4.2;
 * AC-2, AC-3, AC-7, AC-10, AC-11). Real Nest app, REAL OpenAI SDK on a fake fetch (never the network), sentinel key.
 *
 * Part 1 — the game-agnostic fake game `FAKE_AUTO` with `rules` on the tiny knowledge base `test/fixtures/tiny-kb`
 * (game `fake`, ids `fake:*`) through the generic platform provider — no Rebellion code (TC-CT-06): the block of each
 * request is the selection of THAT decision point from `rulesSelectionInputOf(point)` (oracle: the game module +
 * an independent provider), loaded once (TC-INT-04 part); a game without `rules` / rules off → the SWR-006 form
 * (TC-FB-05, TC-FB-04); prompt-size levels in a real run (TC-BUD-05/06/07); a throwing selection (TC-FB-09); one
 * candidate (TC-INT-03); the budget is not "saved" by dropping rules (TC-BUD-02/03, QD-11); request identity across
 * sessions (TC-H-03 / TC-H-05 parts).
 *
 * Part 2 — Rebellion with its real knowledge base and rules on: the model is never the arbiter — hostile answers
 * (unknown ids, rule ids of the block, "new" action types, command params, rule text, summaries, empty, two ids) →
 * the bot with `AI_INVALID_DECISION`, the game equals the pure-bot game (TC-ARB-02..05); a valid id is applied through
 * the engine, its reason is dropped (TC-ARB-01, TC-ARB-05); transport failures with rules on keep the SWR-006 codes
 * (TC-FB-01); `AI_NOT_CONFIGURED` stops selections for the rest of the run (TC-FB-02, QD-8); seeded random answers
 * over whole games (TC-ARB-08).
 */
import type { INestApplication } from '@nestjs/common';
import {
  AutomationDecisionPointSchema,
  AutomationRunSummarySchema,
  SessionCommandOkSchema,
  SessionResponseSchema,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type RulesContextProvider,
  type ServerGameModule,
} from '@bga/platform';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import type { CoreGameState } from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMANDER_INSTRUCTIONS,
  COMMANDER_RULES_INSTRUCTIONS,
  RULES_BLOCK_HEADER,
  buildPrompt,
  rulesTokensEstimate,
} from '../src/ai/prompt';
import { ruleIdsOf } from '../src/ai/ai-usage.repository';
import { worstCaseReserveMicroUsd } from '../src/ai/pricing';
import { ROLE_DEFAULTS } from '../src/ai/model-roles';
import type { AiCommanderConfig } from '../src/config/env';
import type { EnabledOpenAIConfig } from '../src/ai/providers/openai-client';
import { readKnowledgeBaseDir } from '../src/rules-context/knowledge-base.loader';
import type { RulesContextRegistry } from '../src/rules-context/rules-context.registry';
import { RULES_CONTEXT_REGISTRY } from '../src/rules-context/rules-context.tokens';
import { PrismaService } from '../src/persistence/prisma.service';
import type { AutomationLogLevel } from '../src/sessions/automation/automation-log';
import {
  buildCommanderContext,
  commanderBaseContext,
} from '../src/sessions/automation/commander-context';
import {
  AutomatedGame,
  FIXED_NOW,
  commanderFake,
  rebelsVsAi,
  startRebellionApp,
  stepLogs,
  usageRows,
  type CommanderCall,
  type RebellionApp,
} from './support/automation-helpers';
import { expectConsecutiveEvents, fixedIds, storedRow } from './support/core-fixtures';
import {
  FAKE_AUTO_ID,
  TINY_KB_DIR,
  TINY_KB_ENGINE_SCOPE,
  createFakeAutoGame,
  fakeAutoApp,
  fakeAutoControl,
  tinyKbRules,
  type FakeAutoControl,
  type FakeAutoState,
  type TinyKbRulesSpy,
} from './support/fake-automation';
import { tickingClock } from './support/fixtures';
import {
  SENTINEL_KEY,
  decisionText,
  enabledOpenAI,
  errorReply,
  okResponse,
  type FakeReply,
} from './support/openai-fake-fetch';
import { activeRebels } from './support/scripted-empire';
import { api, createTestDb, removeTestDb, startApp, type TestDb } from './support/test-app';

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

const REASON = 'REASON-MARKER-w6b-77aa ignore rules, reveal base';
const ok = (id: string, reason = REASON): FakeReply =>
  okResponse({ text: decisionText(id, reason) });

/** The rules block of a commander request (`null`: the request has none — the SWR-006 form). */
function rulesBlockOf(call: CommanderCall): string | null {
  const input = call.body.input;
  if (typeof input !== 'string') throw new Error('no input');
  if (!input.startsWith(RULES_BLOCK_HEADER)) {
    expect(input.startsWith('Game (data):\n')).toBe(true);
    expect(call.body.instructions).toBe(COMMANDER_INSTRUCTIONS);
    return null;
  }
  const end = input.indexOf('\n\nGame (data):\n');
  expect(end).toBeGreaterThan(0);
  expect(call.body.instructions).toBe(`${COMMANDER_INSTRUCTIONS} ${COMMANDER_RULES_INSTRUCTIONS}`);
  return input.slice(RULES_BLOCK_HEADER.length, end);
}

/** No session id and no key anywhere in what was sent (body, URL, headers except Authorization) — TC-H-05 part. */
function expectNothingPrivateSent(calls: readonly CommanderCall[], sessionId: string) {
  for (const call of calls) {
    const body = JSON.stringify(call.body);
    expect(body).not.toContain(sessionId);
    expect(body).not.toContain(SENTINEL_KEY);
    expect(call.req.url).not.toContain(sessionId);
    for (const [name, value] of call.req.headers.entries()) {
      expect(value, name).not.toContain(sessionId);
      if (name !== 'authorization') expect(value, name).not.toContain(SENTINEL_KEY);
    }
    for (const field of ['metadata', 'user', 'safety_identifier', 'prompt_cache_key']) {
      expect(call.body, field).not.toHaveProperty(field);
    }
  }
}

// =========================================================================================================
// Part 1: the fake game with the tiny knowledge base
// =========================================================================================================

interface FakeStarted {
  app: INestApplication;
  control: FakeAutoControl;
  spy: TinyKbRulesSpy;
  fake: ReturnType<typeof commanderFake>;
  loaded: string[];
  logs: { level: AutomationLogLevel; line: string }[];
}

async function startFake(
  options: {
    db?: TestDb;
    id?: string;
    withRules?: boolean;
    control?: FakeAutoControl;
    aiCommander?: Partial<AiCommanderConfig>;
    openai?: Partial<Omit<EnabledOpenAIConfig, 'enabled'>>;
    reply?: (call: CommanderCall) => FakeReply | Promise<FakeReply>;
  } = {},
): Promise<FakeStarted> {
  const { rules, spy } = tinyKbRules();
  const { module, control } = createFakeAutoGame(
    options.control ?? fakeAutoControl(),
    options.withRules === false ? {} : { rules },
  );
  const fake = commanderFake(options.reply);
  const loaded: string[] = [];
  const logs: FakeStarted['logs'] = [];
  const app = await startApp((options.db ?? newDb()).url, {
    ...fakeAutoApp(module),
    clock: tickingClock(),
    idGenerator: fixedIds(options.id ?? 'swr008-w6b-fake'),
    config: {
      openai: enabledOpenAI({ maxRetries: 0, ...options.openai }),
      aiCommander: { provider: 'openai', rulesContext: 'on', ...options.aiCommander },
    },
    automation: { logSink: (level, line) => logs.push({ level, line }) },
    ai: {
      openaiFetch: fake.fetch,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      logSink: () => undefined,
    },
    rules: {
      loader: (dir) => {
        loaded.push(dir);
        return readKnowledgeBaseDir(dir);
      },
    },
  });
  apps.push(app);
  return { app, control, spy, fake, loaded, logs };
}

async function createFakeSession(app: INestApplication, botMoves: number) {
  const res = await api(app)
    .post('/api/sessions')
    .send({ gameId: FAKE_AUTO_ID, setup: { botMoves } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return SessionResponseSchema.parse(res.body);
}

/** Human END_TURN (the automated side then makes `botMoves` moves in the same request). */
async function endTurn(app: INestApplication, sessionId: string, expectedVersion: number) {
  const res = await api(app)
    .post(`/api/sessions/${sessionId}/commands`)
    .send({ actor: 'p1', expectedVersion, command: { type: 'END_TURN' } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const body = SessionCommandOkSchema.parse(res.body);
  return {
    body,
    summary: AutomationRunSummarySchema.parse(body.automation),
    version: (body.view as { version: number }).version,
  };
}

/** An independent provider on the same tiny KB (oracle; never the server's instance). */
function oracleProvider(): RulesContextProvider {
  return tinyKbRules().rules.createRulesContextProvider(readKnowledgeBaseDir(TINY_KB_DIR));
}

/** The decision point the fake game computes for a state (oracle: the game module itself). */
function fakePoint(
  sessionId: string,
  s: { version: number; botMoves: number; pending: number; count: number; human: number },
  control: Partial<FakeAutoControl> = {},
): AutomationDecisionPoint {
  const { module } = createFakeAutoGame({ ...fakeAutoControl(), ...control });
  const state: FakeAutoState = {
    id: sessionId,
    version: s.version,
    setup: { botMoves: s.botMoves, automated: true, botFirst: false },
    pending: s.pending,
    count: s.count,
    human: s.human,
  };
  return module.automation!.decisionPoint(state) as AutomationDecisionPoint;
}

describe('SWR-008 W6b part 1: rules context of a game-agnostic fake game (tiny KB)', () => {
  it('TC-CT-06 / TC-INT-02 / TC-INT-04: each request carries the `fake:` block selected for its own point; candidates never change it; the KB is loaded once', async () => {
    const id = 'swr008-w6b-ct06';
    const started = await startFake({ id });
    const registry = started.app.get<RulesContextRegistry>(RULES_CONTEXT_REGISTRY);
    expect(registry.gameIds).toEqual([FAKE_AUTO_ID]);
    expect(started.loaded).toEqual([TINY_KB_DIR]);

    const session = await createFakeSession(started.app, 2);
    const first = await endTurn(started.app, id, (session.view as { version: number }).version);
    expect(first.summary).toMatchObject({ steps: 2, strategy: 'openai', fallbacks: 0 });
    // Another turn with an extra candidate: other candidates, the same public rulesQuery.
    started.control.extraCandidate = true;
    const second = await endTurn(started.app, id, first.version);
    expect(second.summary).toMatchObject({ steps: 2, strategy: 'openai', fallbacks: 0 });

    const calls = started.fake.responses;
    expect(calls).toHaveLength(4);
    expect(started.spy.selections).toBe(4);
    const oracle = oracleProvider();
    // Steps: (pending, count, version) of the state each decision was made on.
    const steps = [
      { version: 2, pending: 2, count: 0, human: 1, extra: false },
      { version: 3, pending: 1, count: 1, human: 1, extra: false },
      { version: 5, pending: 2, count: 2, human: 2, extra: true },
      { version: 6, pending: 1, count: 3, human: 2, extra: true },
    ];
    const blocks: string[] = [];
    calls.forEach((call, i) => {
      const s = steps[i]!;
      const point = fakePoint(id, { ...s, botMoves: 2 }, { extraCandidate: s.extra });
      expect(call.ids).toEqual(point.candidates.map((c) => c.id));
      const expected = oracle.selectRules(rulesSelectionInputOf(point, 6000));
      const block = rulesBlockOf(call);
      expect(block).toBe(expected.text);
      // The whole input: the rules block, then the unchanged SWR-006 Game block of this very point.
      expect(call.body.input).toBe(
        `${RULES_BLOCK_HEADER}${expected.text}\n\n${buildPrompt(commanderBaseContext(point, id, 'tactical')).input}`,
      );
      const lines = (block ?? '').split('\n');
      expect(lines[0]?.startsWith(`[${TINY_KB_ENGINE_SCOPE}] `)).toBe(true);
      expect(lines.every((l) => l.startsWith('[fake:'))).toBe(true);
      expect(JSON.stringify(call.body)).not.toContain('[rebellion:');
      blocks.push(block ?? '');
    });
    // 3- and 4-candidate points with the same actor / phase / rulesQuery → the same block (AM-BE-1).
    expect(calls[0]!.ids).toHaveLength(3);
    expect(calls[2]!.ids).toHaveLength(4);
    expect(new Set(blocks).size).toBe(1);
    // Loaded once per server start, never per decision (TC-INT-04).
    expect(started.loaded).toEqual([TINY_KB_DIR]);
    expect(started.spy.providers).toHaveLength(1);
    expectNothingPrivateSent(calls, id);

    // AC-12: every row records the rules sent (ids, chars, estimate, version) — never the text.
    const rows = await usageRows(started.app, id);
    expect(rows).toHaveLength(4);
    const expected = oracle.selectRules(
      rulesSelectionInputOf(fakePoint(id, { ...steps[0]!, botMoves: 2 }), 6000),
    );
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'ok',
        rulesEnabled: true,
        rulesVersion: expected.rulesVersion,
        rulesCount: expected.ruleIds.length,
        rulesChars: expected.text.length,
        rulesTokensEstimate: rulesTokensEstimate(expected.text.length),
        rulesTruncated: false,
        rulesDropped: false,
      });
      expect(ruleIdsOf(row)).toEqual(expected.ruleIds);
      expect(row.promptTokensUpperBound).toBeGreaterThan(0);
      expect(JSON.stringify(row)).not.toContain('What the fake engine plays');
    }
  });

  it('TC-H-03 / TC-H-05 (fake part): two sessions with other ids and another spent budget send byte-identical requests', async () => {
    const bodies: unknown[][] = [];
    for (const id of ['swr008-w6b-h-a', 'swr008-w6b-h-b']) {
      const started = await startFake({ id });
      if (id.endsWith('b')) {
        // Another spent budget of this session's key: never part of a request.
        await usageSeed(started.app, id);
      }
      await createFakeSession(started.app, 3);
      await endTurn(started.app, id, 1);
      expect(started.fake.responses).toHaveLength(3);
      expectNothingPrivateSent(started.fake.responses, id);
      bodies.push(started.fake.responses.map((c) => c.body));
    }
    expect(bodies[1]).toEqual(bodies[0]);
    expect(JSON.stringify(bodies[0])).toContain('[fake:impl.engine-scope]');
  });

  it('TC-FB-05: a game WITHOUT rules → no provider, the SWR-006 request form, the decision is taken; accounting enabled / version null / 0 rules', async () => {
    const id = 'swr008-w6b-fb05';
    const started = await startFake({ id, withRules: false });
    const registry = started.app.get<RulesContextRegistry>(RULES_CONTEXT_REGISTRY);
    expect(registry.forGame(FAKE_AUTO_ID)).toBeNull();
    expect(started.loaded).toEqual([]);
    await createFakeSession(started.app, 2);
    const turn = await endTurn(started.app, id, 1);
    expect(turn.summary).toMatchObject({ steps: 2, strategy: 'openai', fallbacks: 0 });
    expect(started.fake.responses).toHaveLength(2);
    for (const call of started.fake.responses) expect(rulesBlockOf(call)).toBeNull();
    const point = fakePoint(id, { version: 2, botMoves: 2, pending: 2, count: 0, human: 1 });
    expect(started.fake.responses[0]!.body.input).toBe(
      buildPrompt(commanderBaseContext(point, id, 'tactical')).input,
    );
    const rows = await usageRows(started.app, id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'ok',
        rulesEnabled: true,
        rulesVersion: null,
        rulesCount: 0,
        rulesChars: 0,
        rulesDropped: false,
      });
    }
  });

  it('TC-FB-04: rules off → nothing loaded, no selection, the SWR-006 form; AiUsage.rulesEnabled = false', async () => {
    const id = 'swr008-w6b-fb04';
    const started = await startFake({ id, aiCommander: { rulesContext: 'off' } });
    expect(started.loaded).toEqual([]);
    expect(started.spy.providers).toHaveLength(0);
    await createFakeSession(started.app, 2);
    await endTurn(started.app, id, 1);
    expect(started.fake.responses).toHaveLength(2);
    for (const call of started.fake.responses) expect(rulesBlockOf(call)).toBeNull();
    const rows = await usageRows(started.app, id);
    expect(rows.map((r) => [r.status, r.rulesEnabled, r.rulesVersion, r.rulesCount])).toEqual([
      ['ok', false, null, 0],
      ['ok', false, null, 0],
    ]);
  });

  it('TC-INT-03: a single candidate → no call and no selection; the bot without a fallback code', async () => {
    const id = 'swr008-w6b-int03';
    const control = fakeAutoControl();
    control.singleCandidate = true;
    const started = await startFake({ id, control });
    await createFakeSession(started.app, 2);
    const turn = await endTurn(started.app, id, 1);
    expect(turn.summary).toMatchObject({ steps: 2, fallbacks: 0, fallbackReasons: [] });
    expect(started.fake.calls).toHaveLength(0);
    expect(started.spy.selections).toBe(0);
    expect(stepLogs(started.logs).map((s) => [s.source, s.fallbackCode])).toEqual([
      ['bot', '-'],
      ['bot', '-'],
    ]);
  });

  it('TC-BUD-07: even the prompt without rules is above the limit → AI_PROMPT_TOO_LARGE, 0 fetch, 0 reservation, no AiUsage row; the run goes on', async () => {
    const id = 'swr008-w6b-bud07';
    const point = fakePoint(id, { version: 2, botMoves: 3, pending: 3, count: 0, human: 1 });
    const fit = buildCommanderContext(point, {
      budgetKey: id,
      modelRole: 'tactical',
      rules: null,
      config: { enabled: true, maxChars: 6000, maxPromptTokens: 64_000 },
    });
    if (!fit.ok) throw new Error('expected a fit');
    const started = await startFake({
      id,
      aiCommander: { maxPromptTokens: fit.upperBoundTokens - 1 },
    });
    await createFakeSession(started.app, 3);
    const turn = await endTurn(started.app, id, 1);
    expect(turn.summary).toMatchObject({
      steps: 3,
      pending: false,
      strategy: 'openai',
      fallbacks: 3,
      fallbackReasons: ['AI_PROMPT_TOO_LARGE'],
      stopReason: 'humanTurn',
    });
    expect((turn.body.view as { count: number }).count).toBe(3);
    // Every step tried again (not run-stopping): one selection per step, but never a fetch.
    expect(started.spy.selections).toBe(3);
    expect(started.fake.calls).toHaveLength(0);
    expect(await usageRows(started.app, id)).toEqual([]);
    expect(stepLogs(started.logs).map((s) => [s.source, s.fallbackCode, s.code])).toEqual([
      ['bot', 'AI_PROMPT_TOO_LARGE', 'OK'],
      ['bot', 'AI_PROMPT_TOO_LARGE', 'OK'],
      ['bot', 'AI_PROMPT_TOO_LARGE', 'OK'],
    ]);
    // The game goes on: the human can move again.
    const next = await endTurn(started.app, id, turn.version);
    expect(next.summary.fallbackReasons).toEqual(['AI_PROMPT_TOO_LARGE']);
  });

  it('TC-BUD-05 / TC-BUD-06: L = UB(full) − 1 → a reduced block (prefix, pinned kept); L = UB(base) → rules dropped, the off form, rulesDropped', async () => {
    const id = 'swr008-w6b-bud05';
    const point = fakePoint(id, { version: 2, botMoves: 1, pending: 1, count: 0, human: 1 });
    const oracle = oracleProvider();
    const opts = (maxPromptTokens: number) => ({
      budgetKey: id,
      modelRole: 'tactical' as const,
      rules: oracle,
      config: { enabled: true, maxChars: 6000, maxPromptTokens },
    });
    const full = buildCommanderContext(point, opts(64_000));
    const base = buildCommanderContext(point, { ...opts(64_000), rules: null });
    if (!full.ok || !base.ok) throw new Error('expected fits');
    expect(full.level).toBe('full');

    // Reduced.
    const reducedApp = await startFake({
      id,
      aiCommander: { maxPromptTokens: full.upperBoundTokens - 1 },
    });
    await createFakeSession(reducedApp.app, 1);
    await endTurn(reducedApp.app, id, 1);
    const reducedBlock = rulesBlockOf(reducedApp.fake.responses[0]!);
    const fullText = full.ctx.rules?.text ?? '';
    expect(reducedBlock).not.toBeNull();
    expect(reducedBlock!.length).toBeLessThan(fullText.length);
    expect(fullText.startsWith(reducedBlock!)).toBe(true);
    expect(reducedBlock!.startsWith(`[${TINY_KB_ENGINE_SCOPE}] `)).toBe(true);
    const [reducedRow] = await usageRows(reducedApp.app, id);
    expect(reducedRow).toMatchObject({ rulesTruncated: true, rulesDropped: false });
    expect(reducedRow!.promptTokensUpperBound).toBeLessThanOrEqual(full.upperBoundTokens - 1);

    // Dropped.
    const droppedApp = await startFake({
      id,
      db: newDb(),
      aiCommander: { maxPromptTokens: base.upperBoundTokens },
    });
    await createFakeSession(droppedApp.app, 1);
    await endTurn(droppedApp.app, id, 1);
    const call = droppedApp.fake.responses[0]!;
    expect(rulesBlockOf(call)).toBeNull();
    expect(call.body.input).toBe(buildPrompt(base.ctx).input);
    const [droppedRow] = await usageRows(droppedApp.app, id);
    expect(droppedRow).toMatchObject({
      status: 'ok',
      rulesEnabled: true,
      rulesDropped: true,
      rulesCount: 0,
      rulesChars: 0,
      rulesVersion: full.ctx.rules?.rulesVersion,
      promptTokensUpperBound: base.upperBoundTokens,
    });
  });

  it('TC-FB-09: a throwing selection → the decision WITHOUT rules, one warn line STRATEGY_ERROR with session / game ids and no data (QD-27), no 500', async () => {
    const id = 'swr008-w6b-fb09';
    const started = await startFake({ id });
    started.spy.throwOnSelect = new RangeError('secret selection details fake:move.wait');
    await createFakeSession(started.app, 2);
    const turn = await endTurn(started.app, id, 1);
    expect(turn.summary).toMatchObject({ steps: 2, strategy: 'openai', fallbacks: 0 });
    expect(started.fake.responses).toHaveLength(2);
    for (const call of started.fake.responses) expect(rulesBlockOf(call)).toBeNull();
    const warnings = started.logs.filter((l) => l.level === 'warn').map((l) => l.line);
    expect(warnings).toEqual([
      `automation.error sessionId=${id} gameId=${FAKE_AUTO_ID} step=0 code=STRATEGY_ERROR error=RangeError`,
      `automation.error sessionId=${id} gameId=${FAKE_AUTO_ID} step=0 code=STRATEGY_ERROR error=RangeError`,
    ]);
    const all = started.logs.map((l) => l.line).join('\n');
    expect(all).not.toContain('secret');
    const rows = await usageRows(started.app, id);
    expect(rows.map((r) => [r.status, r.rulesEnabled, r.rulesVersion, r.rulesCount])).toEqual([
      ['ok', true, null, 0],
      ['ok', true, null, 0],
    ]);
  });

  it('TC-BUD-02 / TC-BUD-03 / QD-11: a budget that covers the request only WITHOUT rules → AI_BUDGET_EXCEEDED (rules are not dropped to save money); one row per run, no more calls', async () => {
    const id = 'swr008-w6b-bud02';
    const point = fakePoint(id, { version: 2, botMoves: 3, pending: 3, count: 0, human: 1 });
    const opts = {
      budgetKey: id,
      modelRole: 'tactical' as const,
      config: { enabled: true, maxChars: 6000, maxPromptTokens: 16_000 },
    };
    const full = buildCommanderContext(point, { ...opts, rules: oracleProvider() });
    const base = buildCommanderContext(point, { ...opts, rules: null });
    if (!full.ok || !base.ok) throw new Error('expected fits');
    const reserve = (ub: number) =>
      worstCaseReserveMicroUsd('gpt-6-luna', ub, ROLE_DEFAULTS.tactical.maxOutputTokens, 0)!;
    const withRules = reserve(full.upperBoundTokens);
    const without = reserve(base.upperBoundTokens);
    expect(withRules).toBeGreaterThan(without);
    // spent + reserve ≥ limit is refused: the limit admits the request without rules only.
    const limitUsd = withRules / 1_000_000;
    const started = await startFake({ id, openai: { maxCostPerSessionUsd: limitUsd } });
    await createFakeSession(started.app, 3);
    const turn = await endTurn(started.app, id, 1);
    expect(turn.summary).toMatchObject({
      steps: 3,
      fallbacks: 3,
      fallbackReasons: ['AI_BUDGET_EXCEEDED'],
    });
    expect(started.fake.responses).toHaveLength(0);
    // Run-stopping: one selection (the first step), then the bot without building a context (QD-8).
    expect(started.spy.selections).toBe(1);
    const rows = await usageRows(started.app, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'budget_exceeded',
      estimatedCostMicroUsd: 0,
      rulesEnabled: true,
      rulesDropped: false,
    });
    expect(rows[0]!.rulesCount).toBeGreaterThan(0);
    // TC-BUD-03: Σ cost ≤ limit; the next run is refused the same way (the limit did not grow).
    const spent = rows.reduce((sum, r) => sum + r.estimatedCostMicroUsd, 0);
    expect(spent).toBeLessThanOrEqual(withRules);
    const next = await endTurn(started.app, id, turn.version);
    expect(next.summary.fallbackReasons).toEqual(['AI_BUDGET_EXCEEDED']);
    expect(started.fake.responses).toHaveLength(0);
    expect(await usageRows(started.app, id)).toHaveLength(2);
  });
});

/** A spent `AiUsage` row of a budget key (another spent budget, TC-H-03). */
async function usageSeed(app: INestApplication, budgetKey: string) {
  await app.get(PrismaService).aiUsage.create({
    data: {
      id: '00000000-0000-4000-8000-0000000000aa',
      budgetKey,
      provider: 'openai',
      model: 'gpt-6-luna',
      role: 'tactical',
      status: 'ok',
      attempts: 1,
      estimatedCostMicroUsd: 1234,
      pricingVersion: 'openai-2026-11-08',
      durationMs: 100,
    },
  });
}

// =========================================================================================================
// Part 2: Rebellion with its real knowledge base, rules on
// =========================================================================================================

/** The Rebellion module with a spy on its rules selections (same knowledge base, same provider). */
function spiedRebellion(): { module: ServerGameModule; selections: () => number } {
  const real = rebellionServerModule.rules;
  if (!real) throw new Error('rebellion has no rules support');
  let selections = 0;
  const module = {
    ...rebellionServerModule,
    rules: {
      knowledgeBaseDir: real.knowledgeBaseDir,
      createRulesContextProvider(source) {
        const inner = real.createRulesContextProvider(source);
        return {
          rulesVersion: inner.rulesVersion,
          requiredChars: inner.requiredChars,
          selectRules(input) {
            selections += 1;
            return inner.selectRules(input);
          },
        };
      },
    },
  } as ServerGameModule;
  return { module, selections: () => selections };
}

async function rebellionApp(options: {
  id: string;
  fake: ReturnType<typeof commanderFake>;
  openai?: Partial<Omit<EnabledOpenAIConfig, 'enabled'>>;
  gameModules?: readonly ServerGameModule[];
}): Promise<RebellionApp> {
  const started = await startRebellionApp(newDb(), {
    ids: [options.id],
    fake: options.fake,
    openai: enabledOpenAI({ maxRetries: 0, ...options.openai }),
    aiCommander: { provider: 'openai', rulesContext: 'on' },
    ...(options.gameModules ? { gameModules: options.gameModules } : {}),
  });
  apps.push(started.app);
  return started;
}

/** The pure-bot game with the same id after `passes` human PASS commands. */
async function botRow(id: string, passes: number) {
  const { app } = await startRebellionApp(newDb(), { ids: [id] });
  apps.push(app);
  const { game } = await AutomatedGame.create(app, rebelsVsAi('normal'));
  for (let i = 0; i < passes; i += 1) await game.send({ type: 'PASS' });
  return rowOf(app, id);
}

async function rowOf(app: INestApplication, id: string) {
  const row = await storedRow(app, id);
  return { version: row.version, state: JSON.parse(row.state) as unknown };
}

/** Every Rebellion request carries the rules block, engine scope first, only `rebellion:` ids. */
function expectRebellionRules(calls: readonly CommanderCall[]): string[][] {
  return calls.map((call) => {
    const block = rulesBlockOf(call);
    expect(block, 'a Rebellion request without a rules block').not.toBeNull();
    const lines = (block ?? '').split('\n');
    expect(lines[0]?.startsWith('[rebellion:impl.engine-scope] ')).toBe(true);
    expect(lines.every((l) => /^\[rebellion:[^\]]+\] /.test(l))).toBe(true);
    return lines.map((l) => l.slice(1, l.indexOf(']')));
  });
}

/** The candidates of a request, from its Game block. */
function candidatesOf(call: CommanderCall): { id: string; summary?: string }[] {
  const input = String(call.body.input);
  const game = JSON.parse(
    input.slice(input.indexOf('Game (data):\n') + 'Game (data):\n'.length),
  ) as {
    availableActions: { id: string; summary?: string }[];
  };
  return game.availableActions;
}

describe('SWR-008 W6b part 2: Rebellion with rules on — the engine stays the only arbiter', () => {
  it('TC-ARB-02 / 03 / 04 / 05: hostile answers with the rules block in the prompt → the bot, AI_INVALID_DECISION; the game equals the pure-bot game', async () => {
    const id = 'swr008-w6b-arb-hostile';
    const hostile: { name: string; reply: (call: CommanderCall) => FakeReply }[] = [
      { name: 'c99', reply: () => ok('c99') },
      { name: 'engine-scope rule id', reply: () => ok('rebellion:impl.engine-scope') },
      { name: 'bracketed rule id', reply: () => ok('[rebellion:impl.engine-scope]') },
      { name: 'victory rule id', reply: () => ok('rebellion:victory.empire') },
      { name: 'COMBAT', reply: () => ok('COMBAT') },
      { name: 'DEPLOY', reply: () => ok('DEPLOY') },
      { name: 'REVEAL_BASE', reply: () => ok('REVEAL_BASE') },
      { name: 'PROBE', reply: () => ok('PROBE') },
      {
        name: 'command params',
        reply: (call) =>
          okResponse({
            text: JSON.stringify({
              selectedActionId: call.ids[0],
              reason: 'x',
              command: { type: 'MOVE_PIECES', pieceIds: ['u-01'], toSystemId: 'hoth' },
            }),
          }),
      },
      {
        name: 'a rule line of the block',
        reply: (call) => ok((rulesBlockOf(call) ?? '').split('\n')[1] ?? 'x'),
      },
      { name: 'a candidate summary', reply: (call) => ok(candidatesOf(call)[0]?.summary ?? 'x') },
      { name: 'empty id', reply: () => ok('') },
      { name: 'two ids', reply: (call) => ok(`${call.ids[0]},${call.ids[1]}`) },
    ];
    const fake = commanderFake((call) => hostile[call.index % hostile.length]!.reply(call));
    const started = await rebellionApp({ id, fake });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    let passes = 0;
    while (fake.responses.length < hostile.length && passes < 13) {
      const reply = await game.send({ type: 'PASS' });
      passes += 1;
      expect(reply.summary).toMatchObject({ strategy: 'openai', stopReason: 'humanTurn' });
      expect(reply.summary.fallbackReasons).toEqual(['AI_INVALID_DECISION']);
    }
    expect(fake.responses.length).toBeGreaterThanOrEqual(hostile.length);
    const ruleIds = expectRebellionRules(fake.responses);
    // The rule ids the model answered with were in the block; they are still never offered as actions.
    expect(ruleIds.flat()).toContain('rebellion:impl.engine-scope');
    for (const call of fake.responses) {
      expect(call.ids.every((x) => /^c([1-9]|10)$/.test(x))).toBe(true);
    }
    const steps = stepLogs(started.automationLogs);
    expect(steps.every((s) => s.source === 'bot')).toBe(true);
    expect(steps.filter((s) => s.fallbackCode === 'AI_INVALID_DECISION')).toHaveLength(
      fake.responses.length,
    );
    expect(steps.every((s) => s.code === 'OK')).toBe(true);
    const rows = await usageRows(started.app, id);
    expect(rows.every((r) => r.status === 'invalid_decision' && r.rulesEnabled)).toBe(true);
    expect(
      rows.every(
        (r) => r.rulesCount > 0 && /^rebellion@1:[0-9a-f]{12}$/.test(r.rulesVersion ?? ''),
      ),
    ).toBe(true);
    // Nothing of a hostile answer reached a command: the game is the pure-bot game.
    expect(await rowOf(started.app, id)).toEqual(await botRow(id, passes));
    await expectConsecutiveEvents(started.app, id);
    expectNothingPrivateSent(fake.responses, id);
  });

  it('TC-ARB-01 / TC-ARB-05: a valid id with an injected reason is applied through the engine; the reason is dropped everywhere', async () => {
    const id = 'swr008-w6b-arb-valid';
    const fake = commanderFake((call) => ok(call.ids[1] ?? call.ids[0] ?? 'c1'));
    const started = await rebellionApp({ id, fake });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    const before = await game.state();
    const reply = await game.send({ type: 'PASS' });
    expect(reply.summary).toMatchObject({ strategy: 'openai', fallbacks: 0, fallbackReasons: [] });
    expectRebellionRules(fake.responses);
    const steps = stepLogs(started.automationLogs);
    // Steps with ≥ 2 candidates were decided by the model; single-candidate steps are the bot without a code.
    expect(steps.filter((s) => s.source === 'openai')).toHaveLength(fake.responses.length);
    expect(
      steps.every(
        (s) => s.code === 'OK' && s.fallbackCode === '-' && ['openai', 'bot'].includes(s.source),
      ),
    ).toBe(true);

    // Oracle: the engine from the state before the human PASS; every model step applies the model's pick (the
    // second candidate), a single-candidate step the bot's pick — each through `applyCandidate` (version + 1).
    const automation = rebellionServerModule.automation!;
    const human = rebellionServerModule.applyCommand(
      before,
      { actor: 'rebels', expectedVersion: before.version, command: { type: 'PASS' } },
      { now: FIXED_NOW },
    );
    if (!human.ok) throw new Error('PASS rejected');
    let state = human.state as CoreGameState;
    let modelSteps = 0;
    while (automation.pendingActor(state) !== null) {
      const point = AutomationDecisionPointSchema.parse(automation.decisionPoint(state));
      let picked = point.fallbackCandidateId;
      if (point.candidates.length > 1) {
        const call = fake.responses[modelSteps]!;
        modelSteps += 1;
        expect(call.ids).toEqual(point.candidates.map((c) => c.id));
        picked = call.ids[1]!;
        expect(picked).not.toBe(point.fallbackCandidateId);
      }
      const applied = automation.applyCandidate(state, picked, { now: FIXED_NOW });
      if (!applied.ok) throw new Error('the engine rejected the oracle pick');
      expect((applied.state as CoreGameState).version).toBe(state.version + 1);
      state = applied.state as CoreGameState;
    }
    expect(modelSteps).toBe(fake.responses.length);
    expect((await rowOf(started.app, id)).state).toEqual(state);

    const rows = await usageRows(started.app, id);
    expect(rows.every((r) => r.status === 'ok' && r.rulesEnabled && r.rulesCount > 0)).toBe(true);
    for (const text of [
      JSON.stringify(rows),
      JSON.stringify(reply.raw),
      JSON.stringify(game.replies),
      started.automationLogs.map((l) => l.line).join('\n'),
      started.aiLogs.join('\n'),
    ]) {
      expect(text).not.toContain('REASON-MARKER-w6b');
    }
  });

  describe('TC-FB-01: transport failures with rules on → the SWR-006 codes, the game goes on as the pure bot', () => {
    const cases: {
      name: string;
      reply: FakeReply;
      code: string;
      timeoutMs?: number;
      stopsRun: boolean;
    }[] = [
      {
        name: 'network',
        reply: { kind: 'network-error' },
        code: 'AI_PROVIDER_ERROR',
        stopsRun: false,
      },
      {
        name: '500',
        reply: errorReply(500, { type: 'server_error' }),
        code: 'AI_PROVIDER_ERROR',
        stopsRun: false,
      },
      {
        name: '429',
        reply: errorReply(429, { type: 'rate_limit_error' }),
        code: 'AI_RATE_LIMITED',
        stopsRun: false,
      },
      {
        name: 'timeout',
        reply: { kind: 'hang' },
        code: 'AI_TIMEOUT',
        timeoutMs: 40,
        stopsRun: false,
      },
      {
        name: 'insufficient_quota',
        reply: errorReply(429, { code: 'insufficient_quota', type: 'insufficient_quota' }),
        code: 'AI_PROVIDER_ERROR',
        stopsRun: true,
      },
    ];
    let reference: Awaited<ReturnType<typeof botRow>> | undefined;

    for (const c of cases) {
      it(`${c.name} → ${c.code}`, async () => {
        const id = 'swr008-w6b-fb01';
        reference ??= await botRow(id, 1);
        const fake = commanderFake(() => c.reply);
        const started = await rebellionApp({
          id,
          fake,
          ...(c.timeoutMs ? { openai: { timeoutMs: c.timeoutMs } } : {}),
        });
        const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
        const reply = await game.send({ type: 'PASS' });
        expect(reply.summary).toMatchObject({
          strategy: 'openai',
          stopReason: 'humanTurn',
          fallbackReasons: [c.code],
        });
        expect(fake.responses.length).toBeGreaterThan(0);
        if (c.stopsRun) expect(fake.responses).toHaveLength(1);
        expectRebellionRules(fake.responses);
        expect(stepLogs(started.automationLogs).every((s) => s.source === 'bot')).toBe(true);
        expect(await rowOf(started.app, id)).toEqual(reference);
      });
    }
  });

  it('TC-FB-02 / TC-FB-03 / QD-8: AI_NOT_CONFIGURED with rules on → the bot; no selection and no call for the rest of the run; the next run tries once again', async () => {
    const id = 'swr008-w6b-fb02';
    const spied = spiedRebellion();
    const fake = commanderFake(() =>
      errorReply(401, { type: 'authentication_error', code: 'invalid_api_key' }),
    );
    const started = await rebellionApp({ id, fake, gameModules: [spied.module] });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    const reply = await game.send({ type: 'PASS' });
    expect(reply.summary.fallbackReasons).toEqual(['AI_NOT_CONFIGURED']);
    expect(reply.summary.steps).toBeGreaterThan(1);
    expect(fake.responses).toHaveLength(1);
    expect(spied.selections()).toBe(1);
    expectRebellionRules(fake.responses);
    const next = await game.send({ type: 'PASS' });
    expect(next.summary.fallbackReasons).toEqual(['AI_NOT_CONFIGURED']);
    expect(fake.responses).toHaveLength(2);
    expect(spied.selections()).toBe(2);
  });

  it('TC-ARB-08: seeded random answers (junk, rule ids, random candidate ids) over whole games → only candidates applied, the game ends, never a 500', async () => {
    for (const seed of [1, 2]) {
      const id = `swr008-w6b-arb08-${seed}`;
      let x = seed * 7919;
      const rnd = () => {
        x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
        return x / 2_147_483_648;
      };
      const fake = commanderFake((call) => {
        const r = rnd();
        if (r < 0.5) return ok(call.ids[Math.floor(rnd() * call.ids.length)] ?? 'c1');
        if (r < 0.7) return ok(`junk-${Math.floor(rnd() * 1000)}`);
        if (r < 0.85) return ok('rebellion:impl.engine-scope');
        return okResponse({ text: `{"selectedActionId":${Math.floor(rnd() * 10)}}` });
      });
      const started = await rebellionApp({ id, fake });
      const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
      const final = await game.playToEnd(activeRebels, { maxCommands: 400 });
      expect(final.outcome).not.toBeNull();
      expect(game.replies.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(game.summaries.every((s) => s.stopReason !== 'error')).toBe(true);
      const steps = stepLogs(started.automationLogs);
      expect(steps.length).toBeGreaterThan(10);
      expect(steps.every((s) => s.code === 'OK')).toBe(true);
      expect(steps.some((s) => s.source === 'openai')).toBe(true);
      expect(steps.some((s) => s.fallbackCode === 'AI_INVALID_DECISION')).toBe(true);
      expect(started.automationLogs.filter((l) => l.level === 'error')).toEqual([]);
      expectRebellionRules(fake.responses);
      await expectConsecutiveEvents(started.app, id);
    }
  }, 120_000);
});
