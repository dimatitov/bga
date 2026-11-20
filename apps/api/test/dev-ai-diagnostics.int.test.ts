/**
 * SWR-008 W7 — `GET /api/dev/ai/sessions/:sessionId/decisions` (plan-backend §6, AC-13; TC-DIAG-04, TC-DIAG-05 (API part),
 * TC-DIAG-10, TC-COST-03 through the endpoint; QD-19 consistency of `rules`; Q-BE-1 whitelist of fields).
 * Real app (`createApp`), real SQLite test DB; OpenAI only through the fake fetch — never the network.
 */
import {
  AiSessionDecisionsResponseSchema,
  AutomationRunSummarySchema,
  ERROR_MESSAGE_KEYS,
  SessionResponseSchema,
  type AiSessionDecisionsResponse,
} from '@bga/platform';
import type { INestApplication } from '@nestjs/common';
import type { AiUsage } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AiUsageRepository, type NewAiUsageRow } from '../src/ai/ai-usage.repository';
import { DevAiController } from '../src/dev/ai/dev-ai.controller';
import { AI_SESSION_DECISIONS_LIMIT, toDecisionDiagnostic } from '../src/dev/ai/dev-ai-diagnostics';
import { PrismaService } from '../src/persistence/prisma.service';
import {
  decisionBody,
  enabledOpenAI,
  fakeOpenAI,
  OBJECTIVE_MARKER,
  postDecision,
  REASON_MARKER,
  rowsOf,
  startAiApp,
  type AiApp,
} from './support/ai-fakes';
import { createRebellionSession, expectError } from './support/fixtures';
import { decisionText, okResponse, SENTINEL_KEY } from './support/openai-fake-fetch';
import { api, createTestDb, startApp, stopApp } from './support/test-app';

const SESSION = 'sess-diag-0001';
const OTHER_SESSION = 'sess-diag-0002';
const RULES_VERSION = 'rebellion@1:0123456789ab';
const PRICING_MARKER = 'pricing-marker-2026-11';
const T0 = Date.UTC(2026, 10, 20, 12, 0, 0);

const decisionsPath = (sessionId: string) =>
  `/api/dev/ai/sessions/${encodeURIComponent(sessionId)}/decisions`;

function getDecisions(app: INestApplication, sessionId: string) {
  return api(app).get(decisionsPath(sessionId));
}

/** Fields of an `AiUsage` row that must never reach the wire (Q-BE-1, plan §6). */
const FORBIDDEN_KEYS = [
  'budgetKey',
  'sessionId',
  'reason',
  'prompt',
  'situation',
  'promptTokensUpperBound',
  'pricingVersion',
  'role',
  'reasoningTokens',
  'id',
  'estimatedCostMicroUsd',
  'rulesIds',
  'rulesCount',
  'rulesText',
  'text',
];

function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) allKeys(v, out);
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  return out;
}

interface RowSpec {
  /** Rules ids sent (empty → none). */
  ids?: string[];
  enabled?: boolean;
  dropped?: boolean;
  truncated?: boolean;
  status?: NewAiUsageRow['status'];
  errorCode?: string | null;
  cost?: number;
  input?: number;
  cached?: number;
  output?: number;
  duration?: number;
  provider?: 'openai' | 'mock';
  /** Default 1 (a model call was attempted). */
  attempts?: number;
}

function row(budgetKey: string, i: number, spec: RowSpec = {}): NewAiUsageRow {
  const ids = spec.ids ?? [];
  const enabled = spec.enabled ?? (ids.length > 0 || spec.dropped === true);
  const provider = spec.provider ?? 'openai';
  return {
    budgetKey,
    provider,
    model: provider === 'mock' ? 'mock-deterministic-v1' : 'gpt-6-luna',
    role: 'strategy',
    status: spec.status ?? 'ok',
    attempts: spec.attempts ?? 1,
    inputTokens: spec.input ?? 100 + i,
    cachedInputTokens: spec.cached ?? 0,
    outputTokens: spec.output ?? 10 + i,
    reasoningTokens: 7,
    estimatedCostMicroUsd: provider === 'mock' ? 0 : (spec.cost ?? 1000 + i),
    pricingVersion: PRICING_MARKER,
    durationMs: spec.duration ?? 50 + i,
    errorCode: spec.errorCode ?? null,
    createdAt: new Date(T0 + i * 1000),
    rulesEnabled: enabled,
    rulesVersion: enabled && (ids.length > 0 || spec.dropped) ? RULES_VERSION : null,
    rulesIds: ids,
    rulesChars: ids.length * 120,
    rulesTruncated: spec.truncated ?? false,
    rulesDropped: spec.dropped ?? false,
    promptTokensUpperBound: 4321,
  };
}

async function insertAll(app: INestApplication, rows: readonly NewAiUsageRow[]): Promise<void> {
  const repo = app.get(AiUsageRepository);
  for (const r of rows) await repo.insert(r);
}

/** Manual totals (independent of `summarizeCostByRules`). */
function manualGroup(rows: readonly NewAiUsageRow[]) {
  const decisions = rows.length;
  const costMicroUsd = rows.reduce((s, r) => s + r.estimatedCostMicroUsd, 0);
  return {
    decisions,
    costMicroUsd,
    inputTokens: rows.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: rows.reduce((s, r) => s + r.outputTokens, 0),
    meanCostMicroUsd: decisions === 0 ? null : costMicroUsd / decisions,
  };
}

/** QD-19: every row of the answer is self-consistent. */
function expectConsistentRules(body: AiSessionDecisionsResponse): void {
  for (const d of body.decisions) {
    expect(d.rules.count).toBe(d.rules.ids.length);
    if (d.rules.dropped) {
      expect(d.rules.count).toBe(0);
      expect(d.rules.ids).toEqual([]);
    }
    if (d.rules.count === 0) {
      expect(d.rules.chars).toBe(0);
      expect(d.rules.tokensEstimate).toBe(0);
    }
    expect(d.fallback).toBe(d.status !== 'ok');
  }
}

describe('GET /api/dev/ai/sessions/:sessionId/decisions (SWR-008 W7)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
  });

  describe('TC-DIAG-04: production', () => {
    it('the route is 404 (module absent); session and run answers carry no diagnostics', async () => {
      const db = createTestDb();
      const app = await startApp(db.url, {
        logger: false,
        config: { nodeEnv: 'production', openai: enabledOpenAI() },
      });
      try {
        const { sessionId } = await createRebellionSession(app);
        await app.get(PrismaService).aiUsage.create({
          data: { ...stored(row(sessionId, 0, { ids: ['rebellion:a'] })), id: 'prod-row-1' },
        });
        expectError(await getDecisions(app, sessionId), 404, 'NOT_FOUND');
        expectError(await getDecisions(app, 'unknown-1'), 404, 'NOT_FOUND');
        // a non-loopback Host does not turn it into 403 either
        expectError(
          await getDecisions(app, sessionId).set('Host', 'evil.example'),
          404,
          'NOT_FOUND',
        );
        expect(() => app.get(DevAiController)).toThrow();

        // the session answer is the unchanged strict schema; no diagnostics fields anywhere
        const res = await api(app).get(`/api/sessions/${sessionId}`);
        expect(res.status).toBe(200);
        SessionResponseSchema.parse(res.body);
        const keys = allKeys(res.body);
        for (const k of ['decisions', 'totals', 'rules', 'costMicroUsd', 'rulesVersion'])
          expect(keys.has(k)).toBe(false);
      } finally {
        await stopApp(app, db);
      }
    });

    it('wire schemas of the session and of the run summary have no diagnostics fields', () => {
      expect(Object.keys(SessionResponseSchema.shape).sort()).toEqual(
        ['automation', 'gameId', 'sessionId', 'settings', 'status', 'view'].sort(),
      );
      expect(Object.keys(AutomationRunSummarySchema.shape).sort()).toEqual(
        ['fallbackReasons', 'fallbacks', 'pending', 'steps', 'stopReason', 'strategy'].sort(),
      );
    });
  });

  describe('TC-DIAG-10: access and validation (dev)', () => {
    it.each([
      ['underscore', 'sess_1'],
      ['dot', 'sess.1'],
      ['slash (encoded)', 'a/b'],
      ['space', 'a b'],
      ['non-ASCII', 'сессия'],
      ['65 chars', 'a'.repeat(65)],
    ])('bad :sessionId (%s) → 400 VALIDATION', async (_name, id) => {
      ctx = await startAiApp();
      expectError(
        await getDecisions(ctx.app, id),
        400,
        'VALIDATION',
        ERROR_MESSAGE_KEYS.validation,
      );
    });

    it('64-char id and the id alphabet are accepted', async () => {
      ctx = await startAiApp();
      expect((await getDecisions(ctx.app, 'A-z0-9'.padEnd(64, 'x'))).status).toBe(200);
    });

    it.each([
      ['Host', 'evil.example'],
      ['Origin', 'https://evil.example'],
      ['X-Forwarded-For', '203.0.113.7'],
      ['Sec-Fetch-Site', 'cross-site'],
    ])('non-loopback request (%s: %s) → 403 AI_DEV_FORBIDDEN, before validation', async (h, v) => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [row(SESSION, 0, { ids: ['rebellion:a'] })]);
      const res = await getDecisions(ctx.app, SESSION).set(h, v);
      const body = expectError(res, 403, 'AI_DEV_FORBIDDEN', ERROR_MESSAGE_KEYS.aiDevForbidden);
      expect(JSON.stringify(body)).not.toContain('rebellion:a');
      expectError(await getDecisions(ctx.app, 'bad_id').set(h, v), 403, 'AI_DEV_FORBIDDEN');
    });

    it('unknown session → 200 with no decisions and zero totals (existence not revealed)', async () => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [row(OTHER_SESSION, 0, { ids: ['rebellion:a'] })]);
      const res = await getDecisions(ctx.app, 'no-such-session');
      expect(res.status).toBe(200);
      const body = AiSessionDecisionsResponseSchema.parse(res.body);
      const empty = {
        decisions: 0,
        costMicroUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        meanCostMicroUsd: null,
      };
      expect(body).toEqual({
        decisions: [],
        totals: { withRules: empty, withoutRules: empty, total: empty },
      });
    });

    it('free dev rate limit: 429 with Retry-After; a 400 is answered before the limiter', async () => {
      ctx = await startAiApp({ devRateLimit: { paidPerMinute: 1000, totalPerMinute: 1 } });
      expectError(await getDecisions(ctx.app, 'bad_id'), 400, 'VALIDATION');
      expect((await getDecisions(ctx.app, SESSION)).status).toBe(200);
      const limited = await getDecisions(ctx.app, SESSION);
      expectError(limited, 429, 'AI_RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('read-only: no AiUsage / Session rows are written', async () => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [row(SESSION, 0)]);
      const before = await rowsOf(ctx.app);
      await getDecisions(ctx.app, SESSION);
      await getDecisions(ctx.app, 'no-such-session');
      expect(await rowsOf(ctx.app)).toEqual(before);
      expect(await ctx.app.get(PrismaService).session.count()).toBe(0);
    });
  });

  describe('TC-DIAG-10 / TC-COST-03: last 50 rows ascending, totals over all rows', () => {
    it('> 50 rows: the newest 50 in time order; totals = manual calculation over all rows', async () => {
      ctx = await startAiApp();
      // 56 rows (inserted out of order): with rules, without rules (off / enabled but none), dropped, fallbacks, mock
      const rows: NewAiUsageRow[] = [];
      for (let i = 0; i < 56; i++) {
        const kind = i % 7;
        const spec: RowSpec =
          kind === 0
            ? { ids: [`rebellion:r${i}`, 'rebellion:core'], truncated: i % 2 === 0 }
            : kind === 1
              ? { enabled: false }
              : kind === 2
                ? { enabled: true }
                : kind === 3
                  ? { dropped: true, truncated: true }
                  : kind === 4
                    ? { status: 'timeout', errorCode: 'AI_TIMEOUT', ids: ['rebellion:x'] }
                    : kind === 5
                      ? { provider: 'mock', ids: ['rebellion:m'] }
                      : { status: 'invalid_decision', errorCode: 'AI_INVALID_DECISION', cost: 0 };
        rows.push(row(SESSION, i, spec));
      }
      await insertAll(ctx.app, [...rows].reverse());
      // another session's rows never leak in
      await insertAll(ctx.app, [row(OTHER_SESSION, 100, { ids: ['rebellion:other'], cost: 9999 })]);

      const res = await getDecisions(ctx.app, SESSION);
      expect(res.status).toBe(200);
      const body = AiSessionDecisionsResponseSchema.parse(res.body);

      expect(body.decisions).toHaveLength(AI_SESSION_DECISIONS_LIMIT);
      const expected = rows.slice(-AI_SESSION_DECISIONS_LIMIT);
      expect(body.decisions.map((d) => d.at)).toEqual(
        expected.map((r) => (r.createdAt as Date).toISOString()),
      );
      expect(JSON.stringify(body)).not.toContain('rebellion:other');
      expectConsistentRules(body);

      // the first returned row (i = 6) and a with-rules row (i = 7) field by field
      expect(body.decisions[0]).toEqual({
        at: new Date(T0 + 6000).toISOString(),
        provider: 'openai',
        model: 'gpt-6-luna',
        status: 'invalid_decision',
        fallback: true,
        errorCode: 'AI_INVALID_DECISION',
        attempts: 1,
        inputTokens: 106,
        cachedInputTokens: 0,
        outputTokens: 16,
        costMicroUsd: 0,
        durationMs: 56,
        rules: {
          enabled: false,
          rulesVersion: null,
          count: 0,
          ids: [],
          chars: 0,
          tokensEstimate: 0,
          truncated: false,
          dropped: false,
        },
      });
      expect(body.decisions[1]?.rules).toEqual({
        enabled: true,
        rulesVersion: RULES_VERSION,
        count: 2,
        ids: ['rebellion:r7', 'rebellion:core'],
        chars: 240,
        tokensEstimate: 60,
        truncated: false,
        dropped: false,
      });
      const dropped = body.decisions.find((d) => d.rules.dropped);
      expect(dropped?.rules).toMatchObject({ enabled: true, count: 0, ids: [], truncated: true });
      const timeout = body.decisions.find((d) => d.status === 'timeout');
      expect(timeout).toMatchObject({ fallback: true, errorCode: 'AI_TIMEOUT' });
      expect(body.decisions.find((d) => d.provider === 'mock')?.costMicroUsd).toBe(0);

      // totals over ALL 56 rows of the session (withRules := enabled ∧ ¬dropped ∧ count > 0)
      const sent = (r: NewAiUsageRow) =>
        r.rulesEnabled === true && r.rulesDropped !== true && (r.rulesIds?.length ?? 0) > 0;
      expect(body.totals).toEqual({
        withRules: manualGroup(rows.filter(sent)),
        withoutRules: manualGroup(rows.filter((r) => !sent(r))),
        total: manualGroup(rows),
      });
      expect(body.totals.total.decisions).toBe(56);
      expect(body.totals.withRules.decisions + body.totals.withoutRules.decisions).toBe(56);
      // integer micro-USD sums
      expect(Number.isInteger(body.totals.total.costMicroUsd)).toBe(true);
    });

    it('TC-COST-03 data set (5 with rules, 5 without, 1 dropped): groups and means', async () => {
      ctx = await startAiApp();
      const rows = [
        ...[0, 1, 2, 3, 4].map((i) => row(SESSION, i, { ids: [`rebellion:w${i}`], cost: 2000 })),
        ...[5, 6, 7, 8, 9].map((i) => row(SESSION, i, { enabled: false, cost: 1000 })),
        row(SESSION, 10, { dropped: true, cost: 1500 }),
      ];
      await insertAll(ctx.app, rows);
      const body = AiSessionDecisionsResponseSchema.parse(
        (await getDecisions(ctx.app, SESSION)).body,
      );
      expect(body.decisions).toHaveLength(11);
      expect(body.totals.withRules).toMatchObject({
        decisions: 5,
        costMicroUsd: 10_000,
        meanCostMicroUsd: 2000,
      });
      expect(body.totals.withoutRules).toMatchObject({
        decisions: 6,
        costMicroUsd: 6500,
        meanCostMicroUsd: 6500 / 6,
      });
      expect(body.totals.total).toEqual(manualGroup(rows));
    });

    it('review F-4: budget refusals and zero-attempt rows are listed but excluded from the totals (means not diluted)', async () => {
      ctx = await startAiApp();
      const zero = { input: 0, output: 0, cached: 0, cost: 0, duration: 0, attempts: 0 };
      const paid = [
        row(SESSION, 0, { ids: ['rebellion:a'], cost: 2000 }),
        row(SESSION, 1, { ids: ['rebellion:b'], cost: 4000 }),
        row(SESSION, 2, { enabled: false, cost: 1000 }),
        // a failed call after one attempt still counts (it was attempted / may be billed)
        row(SESSION, 3, { status: 'timeout', errorCode: 'AI_TIMEOUT', enabled: false, cost: 0 }),
      ];
      const notCalled = [
        // budget refusals: one carried a rules block, one did not
        row(SESSION, 4, {
          ...zero,
          ids: ['rebellion:a'],
          status: 'budget_exceeded',
          errorCode: 'AI_BUDGET_EXCEEDED',
        }),
        row(SESSION, 5, {
          ...zero,
          enabled: false,
          status: 'budget_exceeded',
          errorCode: 'AI_BUDGET_EXCEEDED',
        }),
        // failure before the first attempt (not configured)
        row(SESSION, 6, {
          ...zero,
          ids: ['rebellion:b'],
          status: 'not_configured',
          errorCode: 'AI_NOT_CONFIGURED',
        }),
      ];
      await insertAll(ctx.app, [...paid, ...notCalled]);
      const body = AiSessionDecisionsResponseSchema.parse(
        (await getDecisions(ctx.app, SESSION)).body,
      );
      // every row is still listed …
      expect(body.decisions).toHaveLength(7);
      expect(body.decisions.filter((d) => d.attempts === 0)).toHaveLength(3);
      // … but the totals cover only the attempted calls
      expect(body.totals).toEqual({
        withRules: manualGroup(paid.slice(0, 2)),
        withoutRules: manualGroup(paid.slice(2)),
        total: manualGroup(paid),
      });
      expect(body.totals.withRules).toMatchObject({ decisions: 2, meanCostMicroUsd: 3000 });
      expect(body.totals.withoutRules).toMatchObject({ decisions: 2, meanCostMicroUsd: 500 });
    });

    it('only budget refusals: zero totals with mean null (never NaN)', async () => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [
        row(SESSION, 0, {
          input: 0,
          output: 0,
          cost: 0,
          attempts: 0,
          ids: ['rebellion:a'],
          status: 'budget_exceeded',
          errorCode: 'AI_BUDGET_EXCEEDED',
        }),
      ]);
      const body = AiSessionDecisionsResponseSchema.parse(
        (await getDecisions(ctx.app, SESSION)).body,
      );
      expect(body.decisions).toHaveLength(1);
      expect(body.totals.total).toEqual({
        decisions: 0,
        costMicroUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        meanCostMicroUsd: null,
      });
      expect(JSON.stringify(body)).not.toContain('NaN');
    });

    it('only rows without rules: withRules is empty with mean null (never NaN)', async () => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [row(SESSION, 0, { enabled: false })]);
      const body = AiSessionDecisionsResponseSchema.parse(
        (await getDecisions(ctx.app, SESSION)).body,
      );
      expect(body.totals.withRules).toEqual({
        decisions: 0,
        costMicroUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        meanCostMicroUsd: null,
      });
      expect(JSON.stringify(body)).not.toContain('NaN');
    });
  });

  describe('QD-19: rules consistency', () => {
    it('rows stored past the repository invariants are normalised: count = ids.length, dropped ⇒ count 0', async () => {
      ctx = await startAiApp();
      const prisma = ctx.app.get(PrismaService);
      // stored rulesCount disagrees with the ids (5 vs 2)
      await prisma.aiUsage.create({
        data: {
          ...stored(row(SESSION, 0, { ids: ['rebellion:a', 'rebellion:b'] })),
          id: 'qd19-1',
          rulesCount: 5,
        },
      });
      // dropped, but ids / chars stored anyway
      await prisma.aiUsage.create({
        data: {
          ...stored(row(SESSION, 1, { ids: ['rebellion:c'] })),
          id: 'qd19-2',
          rulesDropped: true,
        },
      });
      // ids column is not a JSON array of strings
      await prisma.aiUsage.create({
        data: {
          ...stored(row(SESSION, 2, { ids: ['rebellion:d'] })),
          id: 'qd19-3',
          rulesIds: '{"not":"an array"}',
        },
      });
      const body = AiSessionDecisionsResponseSchema.parse(
        (await getDecisions(ctx.app, SESSION)).body,
      );
      expectConsistentRules(body);
      expect(body.decisions.map((d) => [d.rules.count, d.rules.ids, d.rules.dropped])).toEqual([
        [2, ['rebellion:a', 'rebellion:b'], false],
        [0, [], true],
        [0, [], false],
      ]);
      expect(body.decisions[1]?.rules).toMatchObject({ chars: 0, tokensEstimate: 0 });
    });

    it('rows written through the repository are always consistent (every shape)', async () => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [
        row(SESSION, 0, { ids: ['rebellion:a', 'rebellion:b', 'rebellion:c'], truncated: true }),
        row(SESSION, 1, { dropped: true, truncated: true }),
        row(SESSION, 2, { enabled: true }),
        row(SESSION, 3, { enabled: false }),
        row(SESSION, 4, { status: 'rate_limited', errorCode: 'AI_RATE_LIMITED', ids: ['r:x'] }),
      ]);
      const body = AiSessionDecisionsResponseSchema.parse(
        (await getDecisions(ctx.app, SESSION)).body,
      );
      expect(body.decisions).toHaveLength(5);
      expectConsistentRules(body);
      expect(body.decisions.map((d) => d.rules.count)).toEqual([3, 0, 0, 0, 1]);
    });

    it('toDecisionDiagnostic is a whitelist: extra row fields never pass through', () => {
      const record = {
        ...stored(row(SESSION, 0, { ids: ['rebellion:a'] })),
        id: 'x',
        reason: REASON_MARKER,
        prompt: OBJECTIVE_MARKER,
      } as unknown as AiUsage;
      const wire = toDecisionDiagnostic(record);
      const keys = allKeys(wire);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
      expect(JSON.stringify(wire)).not.toContain(REASON_MARKER);
      expect(JSON.stringify(wire)).not.toContain(SESSION);
    });
  });

  describe('TC-DIAG-05 (API part) / Q-BE-1: no hidden or internal data', () => {
    it('real writer (dev test-decision via fake OpenAI) → reader: tokens/cost shown; no key, reason, prompt, pricing', async () => {
      const fake = fakeOpenAI({
        responses: [okResponse({ text: decisionText('action-1', REASON_MARKER) })],
      });
      ctx = await startAiApp({ openai: enabledOpenAI(), fake });
      expect((await postDecision(ctx.app, decisionBody())).status).toBe(200);
      const [stored0] = await rowsOf(ctx.app);
      expect(stored0).toBeDefined();
      if (!stored0) return;

      const res = await getDecisions(ctx.app, stored0.budgetKey);
      expect(res.status).toBe(200);
      const body = AiSessionDecisionsResponseSchema.parse(res.body);
      expect(body.decisions).toHaveLength(1);
      expect(body.decisions[0]).toMatchObject({
        provider: 'openai',
        status: 'ok',
        fallback: false,
        errorCode: null,
        inputTokens: stored0.inputTokens,
        outputTokens: stored0.outputTokens,
        costMicroUsd: stored0.estimatedCostMicroUsd,
        rules: { enabled: false, count: 0, ids: [], dropped: false },
      });
      expect(body.totals.total.costMicroUsd).toBe(stored0.estimatedCostMicroUsd);

      const text = res.text;
      for (const marker of [
        REASON_MARKER,
        OBJECTIVE_MARKER,
        SENTINEL_KEY,
        stored0.budgetKey,
        stored0.pricingVersion,
        stored0.id,
      ])
        expect(text).not.toContain(marker);
      const keys = allKeys(res.body);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
      expect(fake.callsTo('/responses')).toHaveLength(1); // the read made no model call
    });

    it('seeded rows: the session id, pricing version and upper bound never appear in the answer', async () => {
      ctx = await startAiApp();
      await insertAll(ctx.app, [
        row(SESSION, 0, { ids: ['rebellion:a'] }),
        row(SESSION, 1, { dropped: true }),
      ]);
      const res = await getDecisions(ctx.app, SESSION);
      expect(res.status).toBe(200);
      AiSessionDecisionsResponseSchema.parse(res.body);
      expect(res.text).not.toContain(SESSION);
      expect(res.text).not.toContain(PRICING_MARKER);
      expect(res.text).not.toContain('4321');
      const keys = allKeys(res.body);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
    });
  });
});

/** `NewAiUsageRow` → the stored Prisma shape (for writes that bypass the repository on purpose). */
function stored(r: NewAiUsageRow) {
  const ids = r.rulesIds ?? [];
  const chars = r.rulesChars ?? 0;
  return {
    budgetKey: r.budgetKey,
    provider: r.provider,
    model: r.model,
    role: r.role,
    status: r.status,
    attempts: r.attempts,
    inputTokens: r.inputTokens,
    cachedInputTokens: r.cachedInputTokens,
    outputTokens: r.outputTokens,
    reasoningTokens: r.reasoningTokens,
    estimatedCostMicroUsd: r.estimatedCostMicroUsd,
    pricingVersion: r.pricingVersion,
    durationMs: r.durationMs,
    errorCode: r.errorCode,
    createdAt: r.createdAt ?? new Date(T0),
    rulesEnabled: r.rulesEnabled ?? false,
    rulesVersion: r.rulesVersion ?? null,
    rulesCount: ids.length,
    rulesIds: ids.length === 0 ? null : JSON.stringify(ids),
    rulesChars: chars,
    rulesTokensEstimate: Math.ceil(chars / 4),
    rulesTruncated: r.rulesTruncated ?? false,
    rulesDropped: r.rulesDropped ?? false,
    promptTokensUpperBound: r.promptTokensUpperBound ?? null,
  };
}
