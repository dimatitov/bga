/**
 * SWR-005B W6 — `POST /api/dev/ai/test-decision` in mock mode (plan-backend §5.6, §5.8, §10.2; AC-03, AC-04, AC-06,
 * AC-11): deterministic, free, validated, accounted in `AiUsage`, and never touches game state.
 */
import { AiTestDecisionResponseSchema } from '@bga/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { MOCK_MODEL_ID, MOCK_REASON } from '../src/ai/providers/mock.provider';
import { PRICING_VERSION } from '../src/ai/pricing';
import { createRebellionSession, prismaOf } from './support/fixtures';
import {
  decisionBody,
  enabledOpenAI,
  fakeOpenAI,
  postDecision,
  rowsOf,
  scenario,
  startAiApp,
  type AiApp,
} from './support/ai-fakes';

async function gameTables(app: AiApp['app']) {
  const prisma = prismaOf(app);
  return {
    sessions: await prisma.session.findMany({ orderBy: { id: 'asc' } }),
    events: await prisma.sessionEvent.findMany({ orderBy: [{ sessionId: 'asc' }, { seq: 'asc' }] }),
  };
}

describe('POST /api/dev/ai/test-decision — mock (SWR-005B W6)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  it('200: strict wire schema, first action, cost 0, one AiUsage row; game tables unchanged', async () => {
    ctx = await startAiApp();
    await createRebellionSession(ctx.app);
    const before = await gameTables(ctx.app);
    expect(before.sessions).toHaveLength(1);

    const res = await postDecision(ctx.app);
    expect(res.status).toBe(200);
    const body = AiTestDecisionResponseSchema.parse(res.body);
    expect(body.decision).toMatchObject({
      selectedActionId: 'action-1',
      reason: MOCK_REASON,
      provider: 'mock',
      model: MOCK_MODEL_ID,
      attempts: 1,
      estimatedCostUsd: 0,
      estimatedCostMicroUsd: 0,
      pricingVersion: PRICING_VERSION,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        totalTokens: 0,
      },
    });
    expect(body.budget).toMatchObject({
      budgetKey: 'dev-diagnostics',
      spentMicroUsd: 0,
      limitMicroUsd: null,
    });

    const rows = await rowsOf(ctx.app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      budgetKey: 'dev-diagnostics',
      provider: 'mock',
      model: MOCK_MODEL_ID,
      role: 'tactical',
      status: 'ok',
      attempts: 1,
      estimatedCostMicroUsd: 0,
      pricingVersion: PRICING_VERSION,
      errorCode: null,
    });
    expect(await gameTables(ctx.app)).toEqual(before);
  });

  it('is deterministic: the same scenario gives the same choice; the order of actions decides', async () => {
    ctx = await startAiApp();
    const a = AiTestDecisionResponseSchema.parse((await postDecision(ctx.app)).body);
    const b = AiTestDecisionResponseSchema.parse((await postDecision(ctx.app)).body);
    expect(a.decision.selectedActionId).toBe(b.decision.selectedActionId);
    const reordered = scenario({
      availableActions: [
        { id: 'action-3', type: 'PASS' },
        { id: 'action-1', type: 'MOVE_FLEET', target: 'corellia' },
      ],
    });
    const c = AiTestDecisionResponseSchema.parse(
      (await postDecision(ctx.app, { scenario: reordered })).body,
    );
    expect(c.decision.selectedActionId).toBe('action-3');
  });

  it('role / faction / explicit budgetKey are accepted; role is recorded', async () => {
    ctx = await startAiApp();
    const res = await postDecision(
      ctx.app,
      decisionBody({
        role: 'strategy',
        provider: 'mock',
        budgetKey: 'dev-diagnostics',
        scenario: scenario({ faction: 'rebels' }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await rowsOf(ctx.app))[0]).toMatchObject({ role: 'strategy', provider: 'mock' });
  });

  it('OpenAI enabled + provider:"mock" → mock answers, no fetch at all, budget untouched', async () => {
    const fake = fakeOpenAI();
    ctx = await startAiApp({ openai: enabledOpenAI(), fake });
    const res = await postDecision(ctx.app, decisionBody({ provider: 'mock' }));
    expect(res.status).toBe(200);
    const body = AiTestDecisionResponseSchema.parse(res.body);
    expect(body.decision.provider).toBe('mock');
    expect(body.budget.spentMicroUsd).toBe(0);
    expect(body.budget.limitUsd).toBe(0.25);
    expect(fake.calls).toHaveLength(0);
  });

  it('logs only allow-listed lines (no objective, no reason text)', async () => {
    ctx = await startAiApp();
    await postDecision(ctx.app);
    expect(ctx.logs.length).toBeGreaterThan(0);
    for (const line of ctx.logs) {
      expect(line).toMatch(/^ai\.(attempt|decision) /);
      expect(line).not.toContain('OBJECTIVE-MARKER');
      expect(line).not.toContain(MOCK_REASON);
    }
  });
});
