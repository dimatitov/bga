/**
 * SWR-005B W6 — budget through HTTP (plan-backend §5.2–§5.3, §6.2; AC-07): an exhausted key never reaches OpenAI,
 * the mock never spends, concurrent paid requests never exceed the limit together.
 */
import { AI_DEV_BUDGET_KEY, ERROR_MESSAGE_KEYS } from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { ROLE_DEFAULTS } from '../src/ai/model-roles';
import { PRICING_VERSION, worstCaseReserveMicroUsd } from '../src/ai/pricing';
import { buildPrompt, upperBoundInputTokens } from '../src/ai/prompt';
import { PrismaService } from '../src/persistence/prisma.service';
import { DevAiTestDecisionRequestSchema, toDecisionContext } from '../src/dev/ai/dev-ai.schemas';
import { expectError } from './support/fixtures';
import { decisionText, okResponse } from './support/openai-fake-fetch';
import {
  decisionBody,
  enabledOpenAI,
  fakeOpenAI,
  postDecision,
  rowsOf,
  startAiApp,
  type AiApp,
} from './support/ai-fakes';

async function seedSpent(app: AiApp['app'], microUsd: number): Promise<void> {
  await app.get(PrismaService).aiUsage.create({
    data: {
      id: '00000000-0000-4000-8000-000000000001',
      budgetKey: AI_DEV_BUDGET_KEY,
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

function reserveOf(body: unknown, model: string): number {
  const ctx = toDecisionContext(DevAiTestDecisionRequestSchema.parse(body));
  const reserve = worstCaseReserveMicroUsd(
    model,
    upperBoundInputTokens(
      buildPrompt(ctx),
      ctx.availableActions.map((a) => a.id),
    ),
    ROLE_DEFAULTS[ctx.role].maxOutputTokens,
    2,
  );
  if (reserve === null) throw new Error('no pricing');
  return reserve;
}

describe('dev AI budget (SWR-005B W6)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  it('exhausted key → 429 AI_BUDGET_EXCEEDED with safe details; /responses never called; budget_exceeded row', async () => {
    const fake = fakeOpenAI();
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    await seedSpent(ctx.app, 250_000);
    const res = await postDecision(ctx.app);
    const body = expectError(res, 429, 'AI_BUDGET_EXCEEDED', ERROR_MESSAGE_KEYS.aiBudgetExceeded);
    const required = reserveOf(decisionBody(), 'gpt-6-luna');
    expect(body.error.details).toEqual({
      budgetKey: 'dev-diagnostics',
      spentUsd: 0.25,
      spentMicroUsd: 250_000,
      limitUsd: 0.25,
      limitMicroUsd: 250_000,
      remainingUsd: 0,
      remainingMicroUsd: 0,
      requiredUsd: required / 1_000_000,
      requiredMicroUsd: required,
    });
    expect(fake.callsTo('/responses')).toHaveLength(0);
    const rows = await rowsOf(ctx.app);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      status: 'budget_exceeded',
      attempts: 0,
      estimatedCostMicroUsd: 0,
      errorCode: 'AI_BUDGET_EXCEEDED',
    });
  });

  it('spent + reserve exactly equal to the limit is refused', async () => {
    const fake = fakeOpenAI();
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    await seedSpent(ctx.app, 250_000 - reserveOf(decisionBody(), 'gpt-6-luna'));
    expectError(await postDecision(ctx.app), 429, 'AI_BUDGET_EXCEEDED');
    expect(fake.callsTo('/responses')).toHaveLength(0);
  });

  it('the mock answers with an exhausted budget and spends nothing', async () => {
    const fake = fakeOpenAI();
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    await seedSpent(ctx.app, 250_000);
    const res = await postDecision(ctx.app, decisionBody({ provider: 'mock' }));
    expect(res.status).toBe(200);
    expect(res.body.budget).toMatchObject({ spentMicroUsd: 250_000, remainingMicroUsd: 0 });
    expect(fake.calls).toHaveLength(0);
  });

  it('3 concurrent strategy requests with room for 2 reserves → 2×200 + 1×429; spent never above the limit', async () => {
    const body = decisionBody({ role: 'strategy' });
    const reserve = reserveOf(body, 'gpt-6.1-sol');
    const limitMicro = Math.floor(reserve * 2.5);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const fake = fakeOpenAI({
      onResponse: async () => {
        await gate; // hold both admitted calls until the third one was refused
        return okResponse({ text: decisionText('action-1'), usage: { input: 800, output: 200 } });
      },
    });
    ctx = await startAiApp({
      openai: enabledOpenAI({ maxCostPerSessionUsd: limitMicro / 1_000_000 }),
      fake,
    });
    const app = ctx.app;
    const requests = [0, 1, 2].map(() => postDecision(app, body).then((r) => r));
    const first = await Promise.race(requests);
    expect(first.status).toBe(429);
    open();
    const statuses = (await Promise.all(requests)).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 429]);
    expect(fake.callsTo('/responses')).toHaveLength(2);
    const spent = (await rowsOf(app)).reduce((s, r) => s + r.estimatedCostMicroUsd, 0);
    expect(spent).toBeLessThan(limitMicro);
  });
});
