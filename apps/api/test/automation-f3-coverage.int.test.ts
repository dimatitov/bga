/**
 * SWR-006 QA_EXECUTION — tests added by qa-lead for review finding F-3 (test-cases.md TC-OA-14, TC-OA-19, TC-OA-20,
 * TC-RS-05; PO п.8 items 7, 8, 11). Test code only; no product code was changed.
 * - TC-OA-14: Retry-After of a 429 on the commander path (2 s → waits 2000 ms then the model's pick; 3600 s → no
 *   wait, one call, the bot with AI_RATE_LIMITED). `429 ×3` is already in `automation-openai.int.test.ts`.
 * - TC-OA-19: the budget boundary `spent + reserve = limit` refuses the call (bot, AI_BUDGET_EXCEEDED); one micro-USD
 *   less spent lets the call through.
 * - TC-OA-20: budgets of two sessions are isolated; the dev diagnostics budget does not change; the dev endpoint still
 *   refuses any budgetKey other than `dev-diagnostics`.
 * - TC-RS-05: a SWR-005B-shaped stored game (written by the SWR-005 auto-pass policy: the AI passed at once, the
 *   human is to move in the middle of the command phase) opens on the SWR-006 server without any migration:
 *   `pending` is false, the stored pass holds for the rest of the phase, and in a later round the AI makes non-pass moves.
 * The REAL OpenAI SDK talks to a fake fetch only (sentinel key, `no-network` guard).
 */
import type { INestApplication } from '@nestjs/common';
import {
  AI_DEV_BUDGET_KEY,
  AiDevStatusSchema,
  AutomationDecisionPointSchema,
  ERROR_MESSAGE_KEYS,
  usdToMicroUsd,
} from '@bga/platform';
import { chooseAutoCommand } from '@bga/game-rebellion/ai';
import { createRebellionServerModule, rebellionServerModule } from '@bga/game-rebellion/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { AIDecisionContext } from '../src/ai/ai.types';
import { ROLE_DEFAULTS } from '../src/ai/model-roles';
import { PRICING_VERSION, worstCaseReserveMicroUsd } from '../src/ai/pricing';
import { buildPrompt, upperBoundInputTokens } from '../src/ai/prompt';
import { PrismaService } from '../src/persistence/prisma.service';
import type { AiCommanderConfig } from '../src/config/env';
import type { EnabledOpenAIConfig } from '../src/ai/providers/openai-client';
import { decisionBody, getStatus, postDecision } from './support/ai-fakes';
import {
  AutomatedGame,
  FIXED_NOW,
  commanderFake,
  rebelsVsAi,
  startRebellionApp,
  stepLogs,
  usageRows,
  type CommanderCall,
  type StartRebellionOptions,
} from './support/automation-helpers';
import { expectConsecutiveEvents, storedRow } from './support/core-fixtures';
import { expectError } from './support/fixtures';
import {
  decisionText,
  enabledOpenAI,
  errorReply,
  okResponse,
  type FakeReply,
} from './support/openai-fake-fetch';
import { activeRebels } from './support/scripted-empire';
import { createTestDb, removeTestDb, type TestDb } from './support/test-app';

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

async function open(db: TestDb, options: StartRebellionOptions) {
  const started = await startRebellionApp(db, options);
  apps.push(started.app);
  return started;
}

async function openaiApp(options: {
  ids: string[];
  fake: ReturnType<typeof commanderFake>;
  openai?: Partial<Omit<EnabledOpenAIConfig, 'enabled'>>;
  aiCommander?: Partial<AiCommanderConfig>;
  ai?: StartRebellionOptions['ai'];
}) {
  return open(newDb(), {
    ids: options.ids,
    fake: options.fake,
    openai: enabledOpenAI({ maxRetries: 0, ...options.openai }),
    // SWR-006 baseline: the commander without the SWR-008 rules context (rules on: automation-rules.int.test.ts).
    aiCommander: { provider: 'openai', rulesContext: 'off', ...options.aiCommander },
    ...(options.ai ? { ai: options.ai } : {}),
  });
}

const ok = (id: string): FakeReply => okResponse({ text: decisionText(id, 'QA-F3 reason') });
/** The model's pick: the SECOND candidate (the bot takes the first-ranked one). */
const altId = (call: CommanderCall) => call.ids[1] ?? call.ids[0] ?? 'c1';

async function seedSpent(app: INestApplication, budgetKey: string, microUsd: number) {
  await app.get(PrismaService).aiUsage.create({
    data: {
      id: `00000000-0000-4000-8000-${String(microUsd).padStart(12, '0').slice(-12)}`,
      budgetKey,
      provider: 'openai',
      model: 'gpt-6-luna',
      role: 'tactical',
      status: 'ok',
      attempts: 1,
      estimatedCostMicroUsd: microUsd,
      pricingVersion: PRICING_VERSION,
      durationMs: 100,
    },
  });
}

/**
 * The worst-case reserve of the FIRST automated step after the human's PASS at the start of a Rebels-vs-AI game
 * (the same decision point the server computes; the context built exactly like `commanderBaseContext` of
 * `commander-context.ts`, i.e. the commander without rules — this file runs with `rulesContext: 'off'`).
 */
async function firstStepReserve(game: AutomatedGame, maxRetries: number): Promise<number> {
  const automation = rebellionServerModule.automation;
  if (!automation) throw new Error('no automation');
  const s0 = await game.state();
  const human = rebellionServerModule.applyCommand(
    s0,
    { actor: 'rebels', expectedVersion: s0.version, command: { type: 'PASS' } },
    { now: FIXED_NOW },
  );
  if (!human.ok) throw new Error('PASS rejected');
  const point = AutomationDecisionPointSchema.parse(automation.decisionPoint(human.state));
  expect(point.candidates.length).toBeGreaterThan(1);
  const ctx: AIDecisionContext = {
    purpose: 'commander',
    budgetKey: game.id,
    role: 'tactical',
    side: point.actor,
    phase: point.phase,
    objective: point.objective,
    situation: point.situation,
    availableActions: point.candidates.map((c) => ({
      id: c.id,
      type: c.type,
      ...(c.target === undefined ? {} : { target: c.target }),
      summary: c.summary,
    })),
  };
  const reserve = worstCaseReserveMicroUsd(
    'gpt-6-luna',
    upperBoundInputTokens(
      buildPrompt(ctx),
      ctx.availableActions.map((a) => a.id),
    ),
    ROLE_DEFAULTS.tactical.maxOutputTokens,
    maxRetries,
  );
  if (reserve === null) throw new Error('no pricing');
  return reserve;
}

describe('SWR-006 QA (F-3): Retry-After on the commander path (TC-OA-14, PO 8.7)', () => {
  it('429 with retry-after: 2 → the runtime waits 2000 ms, the retry succeeds, the model pick is applied', async () => {
    const delays: number[] = [];
    const fake = commanderFake((call) =>
      call.index === 0
        ? errorReply(429, { type: 'rate_limit_error' }, { 'retry-after': '2' })
        : ok(altId(call)),
    );
    const started = await openaiApp({
      ids: ['swr006-qa-ra-2s'],
      fake,
      openai: { maxRetries: 2 },
      aiCommander: { maxSteps: 1 },
      ai: {
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
      },
    });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    const reply = await game.send({ type: 'PASS' });
    expect(reply.summary).toMatchObject({
      steps: 1,
      strategy: 'openai',
      fallbacks: 0,
      fallbackReasons: [],
    });
    expect(fake.responses).toHaveLength(2);
    expect(delays).toEqual([2000]);
    expect(stepLogs(started.automationLogs)).toEqual([
      expect.objectContaining({ source: 'openai', fallbackCode: '-', code: 'OK' }),
    ]);
    const rows = await usageRows(started.app, game.id);
    expect(rows).toEqual([expect.objectContaining({ status: 'ok', attempts: 2 })]);
  });

  it('429 with retry-after: 3600 → no wait, one call, the bot moves with AI_RATE_LIMITED', async () => {
    const delays: number[] = [];
    const fake = commanderFake(() =>
      errorReply(429, { type: 'rate_limit_error' }, { 'retry-after': '3600' }),
    );
    const started = await openaiApp({
      ids: ['swr006-qa-ra-3600'],
      fake,
      openai: { maxRetries: 2 },
      aiCommander: { maxSteps: 1 },
      ai: {
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
      },
    });
    const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
    const reply = await game.send({ type: 'PASS' });
    expect(reply.summary).toMatchObject({
      steps: 1,
      strategy: 'openai',
      fallbacks: 1,
      fallbackReasons: ['AI_RATE_LIMITED'],
    });
    expect(fake.responses).toHaveLength(1);
    expect(delays).toEqual([]);
    expect(stepLogs(started.automationLogs)).toEqual([
      expect.objectContaining({ source: 'bot', fallbackCode: 'AI_RATE_LIMITED' }),
    ]);
    const rows = await usageRows(started.app, game.id);
    expect(rows).toEqual([expect.objectContaining({ status: 'rate_limited', attempts: 1 })]);
  });
});

describe('SWR-006 QA (F-3): budget boundary and isolation (TC-OA-19, TC-OA-20, PO 8.8)', () => {
  it('TC-OA-19: spent + reserve = limit → no call, the bot moves with AI_BUDGET_EXCEEDED; one micro-USD less → the call is made', async () => {
    const limit = usdToMicroUsd(0.25);
    for (const [id, gap, expectCall] of [
      ['swr006-qa-budget-eq', 0, false],
      ['swr006-qa-budget-below', 1, true],
    ] as const) {
      const fake = commanderFake((call) => ok(altId(call)));
      const started = await openaiApp({ ids: [id], fake, aiCommander: { maxSteps: 1 } });
      const { game } = await AutomatedGame.create(started.app, rebelsVsAi('normal'));
      const reserve = await firstStepReserve(game, 0);
      expect(reserve).toBeGreaterThan(0);
      expect(reserve).toBeLessThan(limit);
      await seedSpent(started.app, id, limit - reserve - gap);
      const reply = await game.send({ type: 'PASS' });
      expect(reply.summary.steps, id).toBe(1);
      if (expectCall) {
        expect(fake.responses, id).toHaveLength(1);
        expect(reply.summary.fallbackReasons, id).toEqual([]);
        expect(stepLogs(started.automationLogs), id).toEqual([
          expect.objectContaining({ source: 'openai', fallbackCode: '-' }),
        ]);
      } else {
        expect(fake.responses, id).toHaveLength(0);
        expect(reply.summary.fallbackReasons, id).toEqual(['AI_BUDGET_EXCEEDED']);
        expect(stepLogs(started.automationLogs), id).toEqual([
          expect.objectContaining({ source: 'bot', fallbackCode: 'AI_BUDGET_EXCEEDED' }),
        ]);
        const rows = await usageRows(started.app, id);
        expect(rows.filter((r) => r.status === 'budget_exceeded')).toEqual([
          expect.objectContaining({ estimatedCostMicroUsd: 0, attempts: 0 }),
        ]);
      }
    }
  });

  it('TC-OA-20: session A exhausted, session B still calls with its own budgetKey; dev-diagnostics budget unchanged; dev endpoint refuses a session budgetKey', async () => {
    const [idA, idB] = ['swr006-qa-iso-a', 'swr006-qa-iso-b'];
    const fake = commanderFake((call) => ok(altId(call)));
    const started = await openaiApp({ ids: [idA, idB], fake, aiCommander: { maxSteps: 1 } });
    const devBefore = AiDevStatusSchema.parse((await getStatus(started.app)).body).budget;
    expect(devBefore).toMatchObject({ budgetKey: AI_DEV_BUDGET_KEY, spentMicroUsd: 0 });

    const a = (await AutomatedGame.create(started.app, rebelsVsAi('normal'))).game;
    const b = (await AutomatedGame.create(started.app, rebelsVsAi('normal'))).game;
    expect([a.id, b.id]).toEqual([idA, idB]);
    await seedSpent(started.app, idA, usdToMicroUsd(0.25));

    const replyA = await a.send({ type: 'PASS' });
    expect(replyA.summary.fallbackReasons).toEqual(['AI_BUDGET_EXCEEDED']);
    expect(fake.responses).toHaveLength(0);

    const replyB = await b.send({ type: 'PASS' });
    expect(replyB.summary.fallbackReasons).toEqual([]);
    expect(fake.responses).toHaveLength(1);
    const rowsB = await usageRows(started.app, idB);
    expect(rowsB).toEqual([expect.objectContaining({ budgetKey: idB, status: 'ok' })]);
    expect(rowsB[0]?.estimatedCostMicroUsd).toBeGreaterThan(0);
    expect((await usageRows(started.app, idA)).filter((r) => r.estimatedCostMicroUsd > 0)).toEqual([
      expect.objectContaining({ estimatedCostMicroUsd: usdToMicroUsd(0.25) }),
    ]);

    const devAfter = AiDevStatusSchema.parse((await getStatus(started.app)).body).budget;
    expect(devAfter).toEqual(devBefore);
    expect(await usageRows(started.app, AI_DEV_BUDGET_KEY)).toEqual([]);

    expectError(
      await postDecision(started.app, { ...decisionBody(), budgetKey: idA }),
      400,
      'VALIDATION',
      ERROR_MESSAGE_KEYS.validation,
    );
    expect(fake.responses).toHaveLength(1);
  });
});

describe('SWR-006 QA (F-3): a SWR-005B-era stored game on the SWR-006 server (TC-RS-05, PO 8.11)', () => {
  it('a game stored by the SWR-005 auto-pass policy (AI passed, human to move mid command phase) continues without migration; the AI plays non-pass moves in a later round', async () => {
    const id = 'swr006-qa-legacy-005b';
    const db = newDb();

    // "SWR-005B server": the same DB schema, the AI side driven by the SWR-005 auto-pass policy.
    const legacyModule = createRebellionServerModule({ automation: { policy: chooseAutoCommand } });
    const legacy = await open(db, { ids: [id], gameModules: [legacyModule] });
    const { game: g1 } = await AutomatedGame.create(legacy.app, rebelsVsAi('normal'));
    for (let i = 0; i < 10; i += 1) {
      const s = await g1.state();
      if (s.passed.empire && s.activeSide === 'rebels') break;
      await g1.send(activeRebels(s));
    }
    const legacyState = await g1.state();
    expect(legacyState).toMatchObject({
      phase: 'command',
      outcome: null,
      activeSide: 'rebels',
      passed: { empire: true, rebels: false },
    });
    const legacyEvents = await g1.events();
    expect(
      legacyEvents.filter((e) => e.actor === 'empire').map((e) => e.type),
      'the legacy AI only passed',
    ).toEqual(['PASSED']);
    const legacyRow = await storedRow(legacy.app, id);
    apps.splice(apps.indexOf(legacy.app), 1);
    await legacy.app.close();

    // SWR-006 server (registered module, real bot) on the same file: no migration step in between.
    const current = await open(db, {});
    const g2 = new AutomatedGame(current.app, id, 'rebels', legacyRow.version);
    const got = await g2.get();
    expect(got.status).toBe(legacyRow.status);
    expect(got.automation).toEqual({ pending: false, strategy: 'bot' });
    expect((await storedRow(current.app, id)).version).toBe(legacyRow.version);

    const aiMoves: string[] = [];
    let roundTurned = false;
    for (let i = 0; i < 40 && aiMoves.length === 0; i += 1) {
      const s = await g2.state();
      if (s.outcome !== null) break;
      expect(s.activeSide).toBe('rebels');
      const reply = await g2.send(activeRebels(s));
      for (const e of reply.events) {
        if (e.type === 'TIME_ADVANCED') roundTurned = true;
        if (e.actor === 'empire' && e.type !== 'PASSED') {
          // The stored pass holds for the rest of the legacy command phase.
          expect(roundTurned, `AI move ${e.type} before the round ended`).toBe(true);
          aiMoves.push(e.type);
        }
      }
    }
    expect(aiMoves.length).toBeGreaterThan(0);
    expect(aiMoves).toContain('SYSTEM_ACTIVATED');
    await expectConsecutiveEvents(current.app, id);
  }, 60_000);
});
