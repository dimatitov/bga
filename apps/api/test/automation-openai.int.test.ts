/**
 * SWR-006 W9 — the OpenAI commander strategy in real Rebellion games through HTTP (AC-09, AC-11; PO п.8 items 2, 3, 7,
 * 8, 13, 14; test-cases.md TC-OA-01, 03, 06, 07, 08, 09, 10, 11 (integration part), 13, 15, 16, 17, 18, 21, 24, 25,
 * TC-CC-02, TC-ENV-09).
 * The REAL OpenAI SDK talks to a fake fetch (`openai-fake-fetch.ts`): never the network (the `no-network` setup guard
 * fails the file on any non-loopback request); sentinel key only; `AI_COMMANDER_PROVIDER=openai` is set in the test
 * config (never from the environment). The AI side is the Empire (human Rebels, normal) unless stated.
 * Key property: whenever every model call fails, every step is the bot's pick, so the game is IDENTICAL to a pure-bot
 * game with the same session id — nothing from a hostile answer reaches a command (D-PO-2, D-PO-3).
 */
import type { INestApplication } from '@nestjs/common';
import { AutomationDecisionPointSchema } from '@bga/platform';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import type { CoreGameState } from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { COMMANDER_INSTRUCTIONS } from '../src/ai/prompt';
import type { AiCommanderConfig } from '../src/config/env';
import type { EnabledOpenAIConfig } from '../src/ai/providers/openai-client';
import {
  AutomatedGame,
  FIXED_NOW,
  commanderFake,
  eventually,
  gameDataOf,
  rebelsVsAi,
  startRebellionApp,
  stepLogs,
  usageRows,
  type CommanderCall,
  type RebellionApp,
} from './support/automation-helpers';
import { expectConsecutiveEvents, storedRow } from './support/core-fixtures';
import {
  SENTINEL_KEY,
  decisionText,
  enabledOpenAI,
  errorReply,
  okResponse,
  type FakeReply,
} from './support/openai-fake-fetch';
import { activeRebels } from './support/scripted-empire';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

const REASON = 'REASON-MARKER-w9-5d1e keeps pressure on the frontier';

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

async function openaiApp(options: {
  id: string;
  fake: ReturnType<typeof commanderFake>;
  openai?: Partial<Omit<EnabledOpenAIConfig, 'enabled'>>;
  aiCommander?: Partial<AiCommanderConfig>;
  db?: TestDb;
}): Promise<RebellionApp> {
  const started = await startRebellionApp(options.db ?? newDb(), {
    ids: [options.id],
    fake: options.fake,
    openai: enabledOpenAI({ maxRetries: 0, ...options.openai }),
    aiCommander: { provider: 'openai', ...options.aiCommander },
  });
  apps.push(started.app);
  return started;
}

/** The pure-bot game with the same id after `passes` human PASS commands (the reference of "every step = bot"). */
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

/** No session id and no key anywhere in what was sent to "OpenAI" (body, URL, headers except Authorization). */
function expectNoSessionIdSent(calls: readonly CommanderCall[], sessionId: string) {
  for (const call of calls) {
    expect(JSON.stringify(call.body)).not.toContain(sessionId);
    expect(JSON.stringify(call.body)).not.toContain(SENTINEL_KEY);
    expect(call.req.url).not.toContain(sessionId);
    for (const [name, value] of call.req.headers.entries()) {
      expect(value, name).not.toContain(sessionId);
      if (name !== 'authorization') expect(value, name).not.toContain(SENTINEL_KEY);
    }
    for (const field of [
      'metadata',
      'user',
      'safety_identifier',
      'prompt_cache_key',
      'previous_response_id',
    ]) {
      expect(call.body, field).not.toHaveProperty(field);
    }
  }
}

function expectNoSecretsInLogs(started: RebellionApp) {
  const text = [...started.aiLogs, ...started.automationLogs.map((l) => l.line)].join('\n');
  expect(text).not.toContain(SENTINEL_KEY);
  expect(text).not.toContain(REASON);
  expect(text).not.toContain('selectedActionId');
}

const ok = (id: string): FakeReply => okResponse({ text: decisionText(id, REASON) });
/** The model's pick in "valid" scenarios: the SECOND candidate (the bot takes the first-ranked one). */
const altId = (call: CommanderCall) => call.ids[1] ?? call.ids[0] ?? 'c1';

describe('SWR-006 W9: OpenAI commander on the fake fetch (AC-09)', () => {
  it('TC-OA-03 / TC-OA-25 / TC-H-04 / TC-H-07 / PO 8.2: a valid non-bot choice is applied exactly; one ok AiUsage row with budgetKey = sessionId; nothing of the model reaches the player', async () => {
    const id = 'swr006-w9-oa-valid';
    const fake = commanderFake((call) => ok(altId(call)));
    const started = await openaiApp({ id, fake, aiCommander: { maxSteps: 1 } });
    const { game, automation } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    expect(automation).toEqual({ pending: false, strategy: 'openai' });
    const s0 = await game.state();
    const reply = await game.send({ type: 'PASS' });
    expect(reply.summary).toEqual({
      steps: 1,
      pending: true,
      strategy: 'openai',
      fallbacks: 0,
      fallbackReasons: [],
      stopReason: 'stepLimit',
    });
    expect(fake.responses).toHaveLength(1);
    const call = fake.responses[0] as CommanderCall;

    // Oracle: the same decision point on the engine; the model's pick (not the bot's) was applied.
    const automationOf = rebellionServerModule.automation;
    if (!automationOf) throw new Error('no automation');
    const human = rebellionServerModule.applyCommand(
      s0,
      { actor: 'rebels', expectedVersion: s0.version, command: { type: 'PASS' } },
      { now: FIXED_NOW },
    );
    if (!human.ok) throw new Error('PASS rejected');
    const point = AutomationDecisionPointSchema.parse(automationOf.decisionPoint(human.state));
    expect(call.ids).toEqual(point.candidates.map((c) => c.id));
    const picked = altId(call);
    expect(picked).not.toBe(point.fallbackCandidateId);
    const expected = automationOf.applyCandidate(human.state, picked, { now: FIXED_NOW });
    if (!expected.ok) throw new Error('pick rejected');
    expect((await rowOf(started.app, id)).state).toEqual(expected.state);
    expect((expected.state as CoreGameState).version).toBe(3);

    // The prompt: constant instructions, only the decision point's data, the strict enum of candidate ids.
    expect(call.body.instructions).toBe(COMMANDER_INSTRUCTIONS);
    expect(call.body.model).toBe('gpt-6-luna');
    expect(call.body.store).toBe(false);
    const data = gameDataOf(call.body);
    expect(data).toMatchObject({
      side: point.actor,
      phase: point.phase,
      objective: point.objective,
      situation: point.situation,
    });
    expect(data.availableActions).toEqual(JSON.parse(JSON.stringify(point.candidates)));
    expectNoSessionIdSent(fake.responses, id);

    const rows = await usageRows(started.app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      budgetKey: id,
      provider: 'openai',
      model: 'gpt-6-luna',
      role: 'tactical',
      status: 'ok',
      attempts: 1,
      inputTokens: 420,
      outputTokens: 37,
    });
    expect(rows[0]?.estimatedCostMicroUsd).toBeGreaterThan(0);
    expect(stepLogs(started.automationLogs)).toEqual([
      expect.objectContaining({
        sessionId: id,
        strategy: 'openai',
        source: 'openai',
        fallbackCode: '-',
        code: 'OK',
      }),
    ]);

    // TC-OA-25: the player never sees the model's reason, its raw answer or any cost / budget field.
    // maxSteps 1: each run is one more step; run until the human's turn.
    let run = await game.run();
    for (let i = 0; i < 64 && run.summary.pending; i += 1) {
      expect(run.summary).toMatchObject({ steps: 1, strategy: 'openai', stopReason: 'stepLimit' });
      run = await game.run();
    }
    expect(run.summary).toMatchObject({
      strategy: 'openai',
      pending: false,
      stopReason: 'humanTurn',
    });
    const got = await game.get();
    for (const body of [reply.raw, run.raw, got.raw]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(REASON);
      expect(text).not.toContain('selectedActionId');
      expect(text).not.toContain('estimatedCost');
      expect(text).not.toContain(SENTINEL_KEY);
    }
    expect(Object.keys((run.raw as { automation: object }).automation).sort()).toEqual([
      'fallbackReasons',
      'fallbacks',
      'pending',
      'steps',
      'stopReason',
      'strategy',
    ]);
    expectNoSecretsInLogs(started);
    expect(JSON.stringify(await usageRows(started.app))).not.toContain(REASON);
  });

  it('TC-OA-06 / 07 / 08 / 09 / 10 / 11: hostile answers (ids outside the list, malformed JSON, schema violations with command params, empty reason, incomplete, refusal, injected id) → the bot moves, AI_INVALID_DECISION, the game goes on unchanged', async () => {
    const id = 'swr006-w9-oa-hostile';
    const hostile: { name: string; reply: FakeReply }[] = [
      { name: 'id outside the list', reply: ok('a99') },
      { name: 'PASS as id', reply: ok('PASS') },
      { name: 'id with a space', reply: ok(' c1') },
      { name: 'upper-case id', reply: ok('C1') },
      { name: 'not json', reply: okResponse({ text: 'not json' }) },
      {
        name: 'truncated json',
        reply: okResponse({ text: '{"selectedActionId":"c1","reason":"x' }),
      },
      { name: 'array', reply: okResponse({ text: '[]' }) },
      { name: 'null', reply: okResponse({ text: 'null' }) },
      { name: 'empty text', reply: okResponse({ text: '' }) },
      {
        name: 'fenced json',
        reply: okResponse({ text: '```json\n{"selectedActionId":"c1","reason":"ok"}\n```' }),
      },
      {
        name: 'numeric id',
        reply: okResponse({ text: JSON.stringify({ selectedActionId: 3, reason: 'x' }) }),
      },
      { name: 'missing id', reply: okResponse({ text: JSON.stringify({ reason: 'x' }) }) },
      {
        name: 'extra command params',
        reply: okResponse({
          text: JSON.stringify({
            selectedActionId: 'c1',
            reason: 'x',
            command: {
              type: 'MOVE_PIECES',
              pieceIds: ['u-29'],
              fromSystemId: 'coruscant',
              toSystemId: 'naboo',
            },
          }),
        }),
      },
      {
        name: 'extra systemId',
        reply: okResponse({
          text: JSON.stringify({ selectedActionId: 'c1', reason: 'x', systemId: 'naboo' }),
        }),
      },
      {
        name: 'empty reason',
        reply: okResponse({ text: JSON.stringify({ selectedActionId: 'c1', reason: '' }) }),
      },
      {
        name: 'blank reason',
        reply: okResponse({ text: JSON.stringify({ selectedActionId: 'c1', reason: '   ' }) }),
      },
      { name: 'incomplete', reply: okResponse({ status: 'incomplete', text: decisionText('c1') }) },
      { name: 'refusal', reply: okResponse({ refusal: 'I will not choose.' }) },
      { name: 'injected id', reply: ok('x-evil') },
    ];
    const fake = commanderFake(
      (call) => (hostile[call.index % hostile.length] as { reply: FakeReply }).reply,
    );
    const started = await openaiApp({ id, fake });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    let passes = 0;
    while (fake.responses.length < hostile.length && passes < 13) {
      const reply = await game.send({ type: 'PASS' });
      passes += 1;
      expect(reply.summary).toMatchObject({
        strategy: 'openai',
        pending: false,
        stopReason: 'humanTurn',
      });
      expect(reply.summary.fallbackReasons).toEqual(['AI_INVALID_DECISION']);
      expect(reply.summary.fallbacks).toBeGreaterThan(0);
    }
    const calls = fake.responses.length;
    expect(calls).toBeGreaterThanOrEqual(hostile.length);

    const steps = stepLogs(started.automationLogs);
    const invalid = steps.filter((s) => s.fallbackCode === 'AI_INVALID_DECISION');
    // One call per step (an invalid answer is never repeated); steps without a call had a single candidate.
    expect(invalid).toHaveLength(calls);
    expect(
      steps.every(
        (s) => s.source === 'bot' && ['AI_INVALID_DECISION', '-'].includes(s.fallbackCode),
      ),
    ).toBe(true);
    const rows = await usageRows(started.app);
    expect(rows).toHaveLength(calls);
    expect(
      rows.every((r) => r.status === 'invalid_decision' && r.budgetKey === id && r.attempts === 1),
    ).toBe(true);
    // The cost of an invalid / incomplete / refused attempt is still counted.
    expect(rows.every((r) => r.estimatedCostMicroUsd > 0)).toBe(true);
    // The injected id was never offered; the instructions never changed.
    const injected = fake.responses.filter((c) => c.index % hostile.length === hostile.length - 1);
    expect(injected.length).toBeGreaterThan(0);
    for (const c of fake.responses) {
      expect(c.ids).not.toContain('x-evil');
      expect(c.ids.every((x) => /^c([1-9]|10)$/.test(x))).toBe(true);
      expect(c.body.instructions).toBe(COMMANDER_INSTRUCTIONS);
    }
    // Every step was the bot's pick: the game is the pure-bot game.
    expect(await rowOf(started.app, id)).toEqual(await botRow(id, passes));
    await expectConsecutiveEvents(started.app, id);
    expectNoSessionIdSent(fake.responses, id);
    expectNoSecretsInLogs(started);
  });

  describe('TC-OA-13 / 14 / 15 / 16 / 17 / PO 8.7: transport failures → the bot, the game goes on', () => {
    const cases: {
      name: string;
      reply: FakeReply;
      code: string;
      status: string;
      maxRetries: number;
      timeoutMs?: number;
      /** Ends model calls for the rest of the run (Q-7). */
      stopsRun: boolean;
      /** Fake fetch calls of one failed decision (retries included). */
      attempts: number;
      model?: string;
    }[] = [
      {
        name: 'timeout ×3',
        reply: { kind: 'hang' },
        code: 'AI_TIMEOUT',
        status: 'timeout',
        maxRetries: 2,
        timeoutMs: 40,
        stopsRun: false,
        attempts: 3,
      },
      {
        name: '429 ×3',
        reply: errorReply(429, { type: 'rate_limit_error' }),
        code: 'AI_RATE_LIMITED',
        status: 'rate_limited',
        maxRetries: 2,
        stopsRun: false,
        attempts: 3,
      },
      {
        name: '500 ×3',
        reply: errorReply(500, { type: 'server_error' }),
        code: 'AI_PROVIDER_ERROR',
        status: 'provider_error',
        maxRetries: 2,
        stopsRun: false,
        attempts: 3,
      },
      {
        name: '503',
        reply: errorReply(503, { type: 'server_error' }),
        code: 'AI_PROVIDER_ERROR',
        status: 'provider_error',
        maxRetries: 0,
        stopsRun: false,
        attempts: 1,
      },
      {
        name: 'network',
        reply: { kind: 'network-error' },
        code: 'AI_PROVIDER_ERROR',
        status: 'provider_error',
        maxRetries: 0,
        stopsRun: false,
        attempts: 1,
      },
      {
        name: 'insufficient_quota',
        reply: errorReply(429, { code: 'insufficient_quota', type: 'insufficient_quota' }),
        code: 'AI_PROVIDER_ERROR',
        status: 'provider_error',
        maxRetries: 2,
        stopsRun: true,
        attempts: 1,
      },
      {
        name: '401 key rejected',
        reply: errorReply(401, { type: 'authentication_error', code: 'invalid_api_key' }),
        code: 'AI_NOT_CONFIGURED',
        status: 'not_configured',
        maxRetries: 2,
        stopsRun: true,
        attempts: 1,
      },
      {
        name: 'model without a price',
        reply: ok('c1'),
        code: 'AI_NOT_CONFIGURED',
        status: 'not_configured',
        maxRetries: 0,
        stopsRun: true,
        model: 'gpt-unpriced-9',
        attempts: 0,
      },
    ];

    let reference: Awaited<ReturnType<typeof botRow>> | undefined;

    for (const c of cases) {
      it(`${c.name} → ${c.code}`, async () => {
        const id = 'swr006-w9-oa-fail';
        reference ??= await botRow(id, 1);
        const fake = commanderFake(() => c.reply);
        const started = await openaiApp({
          id,
          fake,
          openai: {
            maxRetries: c.maxRetries,
            ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
            ...(c.model ? { tacticalModel: c.model } : {}),
          },
        });
        const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
        const reply = await game.send({ type: 'PASS' });
        expect(reply.summary).toMatchObject({
          strategy: 'openai',
          pending: false,
          stopReason: 'humanTurn',
          fallbackReasons: [c.code],
        });
        const steps = stepLogs(started.automationLogs);
        const failed = steps.filter((s) => s.fallbackCode === c.code);
        expect(failed.length).toBeGreaterThan(1);
        expect(reply.summary.fallbacks).toBe(failed.length);
        expect(steps.every((s) => s.source === 'bot')).toBe(true);
        const attempts = c.attempts;
        const rows = await usageRows(started.app, id);
        if (c.stopsRun) {
          // Q-7: one failed call (with its retries), the rest of the run is the bot without calls / rows.
          expect(fake.responses).toHaveLength(attempts);
          expect(rows).toHaveLength(1);
        } else {
          expect(fake.responses).toHaveLength(attempts * failed.length);
          expect(rows).toHaveLength(failed.length);
        }
        expect(rows.every((r) => r.status === c.status && r.budgetKey === id)).toBe(true);
        if (attempts > 0) expect(rows.every((r) => r.attempts === attempts)).toBe(true);
        // All steps were the bot's picks: the same game as the pure bot.
        expect(await rowOf(started.app, id)).toEqual(reference);
        expect(JSON.stringify(reply.raw)).not.toContain(SENTINEL_KEY);
        expectNoSecretsInLogs(started);
        if (c.stopsRun) {
          // The next run tries the model again (and stops again).
          const before = fake.responses.length;
          const next = await game.send({ type: 'PASS' });
          expect(next.summary.fallbackReasons).toEqual([c.code]);
          expect(fake.responses.length - before).toBe(attempts);
        }
      });
    }
  });

  it('TC-OA-24: a mixed run [ok, timeout ×3, ok …] → strategy openai, fallbacks 1, fallbackReasons [AI_TIMEOUT]', async () => {
    const id = 'swr006-w9-oa-mixed';
    const fake = commanderFake((call) =>
      call.index >= 1 && call.index <= 3 ? { kind: 'hang' } : ok(altId(call)),
    );
    const started = await openaiApp({ id, fake, openai: { maxRetries: 2, timeoutMs: 40 } });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    const reply = await game.send({ type: 'PASS' });
    expect(reply.summary).toMatchObject({
      strategy: 'openai',
      fallbacks: 1,
      fallbackReasons: ['AI_TIMEOUT'],
      stopReason: 'humanTurn',
      pending: false,
    });
    const steps = stepLogs(started.automationLogs);
    expect(steps[0]).toMatchObject({ source: 'openai', fallbackCode: '-' });
    expect(steps[1]).toMatchObject({ source: 'bot', fallbackCode: 'AI_TIMEOUT' });
    expect(steps.filter((s) => s.source === 'openai').length).toBeGreaterThan(1);
    const rows = await usageRows(started.app, id);
    expect(rows.filter((r) => r.status === 'timeout')).toEqual([
      expect.objectContaining({ attempts: 3 }),
    ]);
    expect(rows.filter((r) => r.status === 'ok')).toHaveLength(
      steps.filter((s) => s.source === 'openai').length,
    );
  });

  it('TC-OA-18 / PO 8.8 / PO 8.13: the session budget runs out mid-game → no more calls, the bot finishes the game; ≤ 1 budget_exceeded row per run; Σ cost ≤ limit', async () => {
    const id = 'swr006-w9-oa-budget';
    const limitUsd = 0.002;
    // Realistic usage, below the worst-case reserve of a call (1000 input + 400 output tokens of gpt-6-luna).
    const fake = commanderFake((call) =>
      okResponse({ text: decisionText(altId(call), REASON), usage: { input: 1000, output: 400 } }),
    );
    const started = await openaiApp({ id, fake, openai: { maxCostPerSessionUsd: limitUsd } });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    let exhaustedAt: number | null = null;
    for (let i = 0; i < 13; i += 1) {
      const rowsBefore = (await usageRows(started.app, id)).filter(
        (r) => r.status === 'budget_exceeded',
      ).length;
      const callsBefore = fake.responses.length;
      const reply = await game.send({ type: 'PASS' });
      const rowsAfter = (await usageRows(started.app, id)).filter(
        (r) => r.status === 'budget_exceeded',
      ).length;
      // Q-6 / Q-BE-7: at most one budget_exceeded row per run.
      expect(rowsAfter - rowsBefore).toBeLessThanOrEqual(1);
      if (exhaustedAt !== null) {
        expect(fake.responses.length, `no call after the budget ran out (run ${i + 1})`).toBe(
          callsBefore,
        );
        expect(reply.summary.fallbackReasons).toContain('AI_BUDGET_EXCEEDED');
      }
      if (exhaustedAt === null && rowsAfter > 0) {
        exhaustedAt = fake.responses.length;
        expect(reply.summary.fallbackReasons).toContain('AI_BUDGET_EXCEEDED');
      }
      expect(reply.summary.strategy).toBe('openai');
    }
    expect(exhaustedAt).not.toBeNull();
    expect(fake.responses.length).toBe(exhaustedAt);
    expect(fake.responses.length).toBeGreaterThanOrEqual(1);
    const final = await game.state();
    expect(final.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    const rows = await usageRows(started.app, id);
    const spent = rows.reduce((sum, r) => sum + r.estimatedCostMicroUsd, 0);
    expect(spent).toBeLessThanOrEqual(limitUsd * 1_000_000);
    expect(rows.filter((r) => r.status === 'ok')).toHaveLength(fake.responses.length);
    expect(
      rows
        .filter((r) => r.status === 'budget_exceeded')
        .every((r) => r.estimatedCostMicroUsd === 0),
    ).toBe(true);
    expect(rows.every((r) => r.budgetKey === id)).toBe(true);
    await expectConsecutiveEvents(started.app, id);
  }, 60_000);

  it('TC-OA-21 / PO 8.13: a hanging model and a 1 s run deadline → the request ends in time, AI_DEADLINE, no more calls in that run; the next run tries again', async () => {
    const id = 'swr006-w9-oa-deadline';
    const fake = commanderFake((call) => (call.index === 0 ? { kind: 'hang' } : ok(altId(call))));
    const started = await openaiApp({
      id,
      fake,
      openai: { timeoutMs: 2500 },
      aiCommander: { runDeadlineMs: 1000 },
    });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    const t0 = performance.now();
    const reply = await game.send({ type: 'PASS' });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2500);
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(reply.summary).toMatchObject({
      strategy: 'openai',
      fallbackReasons: ['AI_DEADLINE'],
      stopReason: 'humanTurn',
      pending: false,
    });
    expect(fake.responses).toHaveLength(1);
    const steps = stepLogs(started.automationLogs);
    expect(steps[0]).toMatchObject({ source: 'bot', fallbackCode: 'AI_DEADLINE' });
    expect(
      steps.every((s) => s.source === 'bot' && ['AI_DEADLINE', '-'].includes(s.fallbackCode)),
    ).toBe(true);
    // Q-BE-2: the losing call finishes in the background (SDK timeout) and writes its own AiUsage row.
    await eventually(async () => (await usageRows(started.app, id)).length === 1, 5000);
    expect((await usageRows(started.app, id))[0]).toMatchObject({
      status: 'timeout',
      budgetKey: id,
    });
    // The next run asks the model again.
    const next = await game.send({ type: 'PASS' });
    expect(next.summary.fallbackReasons).toEqual([]);
    expect(fake.responses.length).toBeGreaterThan(1);
    expect(stepLogs(started.automationLogs).some((s) => s.source === 'openai')).toBe(true);
  });

  it('TC-CC-02: two parallel runs in OpenAI mode → no duplicated paid calls (calls = AiUsage rows = steps with a call)', async () => {
    const id = 'swr006-w9-oa-race';
    const db = newDb();
    const slow = (call: CommanderCall) =>
      new Promise<FakeReply>((resolve) => setTimeout(() => resolve(ok(altId(call))), 20));
    // Leave a pending AI turn (maxSteps 1), then race two runs on a fresh instance.
    const first = await openaiApp({
      id,
      fake: commanderFake(slow),
      db,
      aiCommander: { maxSteps: 1 },
    });
    const { game } = await AutomatedGame.create(first.app, rebelsVsAi('normal'));
    await game.send({ type: 'PASS' });
    apps.splice(apps.indexOf(first.app), 1);
    await first.app.close();
    const fake = commanderFake(slow);
    const second = await openaiApp({ id, fake, db });
    const resumed = new AutomatedGame(second.app, id, 'rebels', game.version);
    const [a, b] = await Promise.all([resumed.runRaw(), resumed.runRaw()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const steps = stepLogs(second.automationLogs);
    const withCall = steps.filter((s) => s.source === 'openai' || s.fallbackCode !== '-');
    expect(fake.responses.length).toBe(withCall.length);
    expect((await usageRows(second.app, id)).length).toBe(1 + withCall.length);
    await expectConsecutiveEvents(second.app, id);
  });

  it('TC-OA-01: provider bot with OpenAI enabled and a key → no client call at all, strategy bot', async () => {
    const id = 'swr006-w9-oa-botmode';
    const fake = commanderFake();
    const started = await startRebellionApp(newDb(), {
      ids: [id],
      fake,
      openai: enabledOpenAI(),
      aiCommander: { provider: 'bot' },
    });
    apps.push(started.app);
    const { game, automation } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    expect(automation.strategy).toBe('bot');
    for (let i = 0; i < 2; i += 1) {
      const reply = await game.send({ type: 'PASS' });
      expect(reply.summary).toMatchObject({ strategy: 'bot', fallbacks: 0 });
    }
    expect(fake.calls).toHaveLength(0);
    expect(await usageRows(started.app)).toHaveLength(0);
  });

  it('TC-ENV-09 / PO 8.14: default config (bot, OPENAI_ENABLED=false, no key) — three active rounds against the AI, no AiUsage, no network', async () => {
    const id = 'swr006-w9-nokey';
    const started = await startRebellionApp(newDb(), { ids: [id] });
    apps.push(started.app);
    const { game, automation } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    expect(automation).toEqual({ pending: false, strategy: 'bot' });
    for (let passes = 0; passes < 3;) {
      const command = activeRebels(await game.state());
      const reply = await game.send(command);
      expect(reply.summary).toMatchObject({ strategy: 'bot', fallbacks: 0, fallbackReasons: [] });
      if (command.type === 'PASS') passes += 1;
    }
    const events = await expectConsecutiveEvents(started.app, id);
    expect(events.some((e) => e.actor === 'empire' && e.type === 'SYSTEM_ACTIVATED')).toBe(true);
    expect(events.some((e) => e.actor === 'empire' && e.type === 'PIECES_MOVED')).toBe(true);
    expect(await usageRows(started.app)).toHaveLength(0);
    expect(started.aiLogs).toEqual([]);
  });
});
