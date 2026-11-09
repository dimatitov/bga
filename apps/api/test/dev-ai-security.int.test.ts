/**
 * SWR-005B W6 — dev AI endpoint protection (plan-backend BD-8, §10.2, AM-BE-6, AM-BE-11; AC-08, AC-10;
 * TC-API-03/04/08/09/15): production 404, loopback/Host/Origin/X-Forwarded-For/Sec-Fetch-Site guard, strict body,
 * 8 KiB limit, rate limits with Retry-After, and no secrets / objective / reason in logs or responses.
 */
import { PassThrough } from 'node:stream';
import { ConsoleLogger, Logger, type ExecutionContext } from '@nestjs/common';
import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, ProductionOverridesError } from '../src/app.factory';
import { AiModuleConfigError } from '../src/ai/ai.module';
import { ApiError } from '../src/common/api-error';
import { DevAiController } from '../src/dev/ai/dev-ai.controller';
import { devAiBodyGate } from '../src/dev/ai/dev-ai-body.middleware';
import { DevRateLimiter } from '../src/dev/ai/dev-rate-limiter';
import {
  isAllowedDevRequest,
  isLoopbackAddress,
  LoopbackGuard,
  type DevGuardRequest,
} from '../src/dev/ai/loopback.guard';
import { expectError } from './support/fixtures';
import { decisionText, errorReply, okResponse, SENTINEL_KEY } from './support/openai-fake-fetch';
import {
  DECISION_PATH,
  decisionBody,
  enabledOpenAI,
  fakeOpenAI,
  getStatus,
  instantSleep,
  OBJECTIVE_MARKER,
  postDecision,
  REASON_MARKER,
  scenario,
  startAiApp,
  STATUS_PATH,
  type AiApp,
} from './support/ai-fakes';
import { api, createTestDb, startApp, stopApp } from './support/test-app';
import { testConfig } from './support/test-config';

function guardReq(remoteAddress: string, headers: Record<string, string> = {}): DevGuardRequest {
  return { socket: { remoteAddress }, headers: { host: 'localhost:3000', ...headers } };
}

describe('dev AI security (SWR-005B W6)', () => {
  let ctx: AiApp | undefined;
  afterEach(async () => {
    await ctx?.stop();
    ctx = undefined;
    vi.restoreAllMocks();
  });

  describe('production', () => {
    it('routes are 404 (not 403), the module is not registered; health and sessions still work', async () => {
      const db = createTestDb();
      const app = await startApp(db.url, {
        logger: false,
        config: { nodeEnv: 'production', openai: enabledOpenAI() },
      });
      try {
        expectError(await api(app).get(STATUS_PATH), 404, 'NOT_FOUND');
        expectError(await api(app).post(DECISION_PATH).send(decisionBody()), 404, 'NOT_FOUND');
        expectError(await api(app).options(DECISION_PATH), 404, 'NOT_FOUND');
        expectError(await api(app).get('/api/dev/ai/unknown'), 404, 'NOT_FOUND');
        // a non-loopback Host does not turn it into 403 either
        expectError(await api(app).get(STATUS_PATH).set('Host', 'evil.example'), 404, 'NOT_FOUND');
        expect(() => app.get(DevAiController)).toThrow();
        expect((await api(app).get('/api/health')).status).toBe(200);
        expect((await api(app).get('/api/sessions')).status).toBe(200);
      } finally {
        await stopApp(app, db);
      }
    });

    it('createApp refuses AI test overrides in production', async () => {
      await expect(
        createApp({
          logger: false,
          config: testConfig({ nodeEnv: 'production' }),
          ai: { mockScript: ['timeout'] },
        }),
      ).rejects.toBeInstanceOf(ProductionOverridesError);
    });

    it('an enabled OpenAI config under NODE_ENV=test without a fake fetch is refused at wiring time', async () => {
      await expect(
        createApp({ logger: false, config: testConfig({ openai: enabledOpenAI() }) }),
      ).rejects.toBeInstanceOf(AiModuleConfigError);
    });
  });

  describe('loopback guard', () => {
    it.each([
      ['Host', 'evil.example'],
      ['Host', 'evil.example:3000'],
      ['Host', '127.0.0.1.evil.example'],
      ['Origin', 'https://evil.example'],
      ['Origin', 'null'],
      ['X-Forwarded-For', '203.0.113.7'],
      ['X-Forwarded-For', '127.0.0.1, 203.0.113.7'],
      ['Sec-Fetch-Site', 'cross-site'],
    ])('%s: %s → 403 AI_DEV_FORBIDDEN on both routes', async (header, value) => {
      ctx = await startAiApp();
      const status = await getStatus(ctx.app).set(header, value);
      const body = expectError(status, 403, 'AI_DEV_FORBIDDEN', ERROR_MESSAGE_KEYS.aiDevForbidden);
      expect(body.error.details).toBeUndefined();
      expectError(await postDecision(ctx.app).set(header, value), 403, 'AI_DEV_FORBIDDEN');
    });

    it('local browser headers pass (Vite proxy origin, same-origin, loopback X-Forwarded-For)', async () => {
      ctx = await startAiApp();
      const res = await postDecision(ctx.app)
        .set('Host', 'localhost:5173')
        .set('Origin', 'http://localhost:5173')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Forwarded-For', '127.0.0.1, ::1');
      expect(res.status).toBe(200);
      expect((await getStatus(ctx.app).set('Host', '[::1]:3000')).status).toBe(200);
    });

    it('403 comes before body validation (invalid / malformed / oversized body from a non-local Host)', async () => {
      ctx = await startAiApp();
      const evil = (r: ReturnType<typeof postDecision>) => r.set('Host', 'evil.example');
      expectError(await evil(postDecision(ctx.app, { nope: 1 })), 403, 'AI_DEV_FORBIDDEN');
      expectError(
        await api(ctx.app)
          .post(DECISION_PATH)
          .set('Host', 'evil.example')
          .set('Content-Type', 'application/json')
          .send('{broken'),
        403,
        'AI_DEV_FORBIDDEN',
      );
      expectError(
        await api(ctx.app)
          .post(DECISION_PATH)
          .set('Host', 'evil.example')
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ x: 'a'.repeat(20_000) })),
        403,
        'AI_DEV_FORBIDDEN',
      );
    });

    it('unit: the TCP peer decides, not client headers (192.168.1.5, 10.0.0.5 + X-Forwarded-For 127.0.0.1)', () => {
      const guard = new LoopbackGuard();
      const ctxOf = (req: DevGuardRequest) =>
        ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
      expect(() => guard.canActivate(ctxOf(guardReq('192.168.1.5')))).toThrow(ApiError);
      try {
        guard.canActivate(ctxOf(guardReq('192.168.1.5')));
      } catch (err) {
        expect((err as ApiError).code).toBe('AI_DEV_FORBIDDEN');
        expect((err as ApiError).status).toBe(403);
      }
      expect(isAllowedDevRequest(guardReq('10.0.0.5', { 'x-forwarded-for': '127.0.0.1' }))).toBe(
        false,
      );
      expect(guard.canActivate(ctxOf(guardReq('127.0.0.1')))).toBe(true);
      expect(isAllowedDevRequest(guardReq('::ffff:127.0.0.1'))).toBe(true);
      expect(isAllowedDevRequest(guardReq('::1'))).toBe(true);
      expect(isAllowedDevRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} })).toBe(
        false,
      );
      for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', '[::1]']) {
        expect(isLoopbackAddress(a)).toBe(true);
      }
      for (const a of [
        '192.168.1.5',
        '10.0.0.5',
        '::ffff:10.0.0.5',
        '0.0.0.0',
        '',
        'localhost',
        undefined,
      ]) {
        expect(isLoopbackAddress(a)).toBe(false);
      }
    });
  });

  describe('request body', () => {
    const actions = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `a-${i + 1}`, type: 'PASS' }));

    it.each([
      ['extra top-level field', { ...decisionBody(), extra: 1 }],
      ['extra scenario field', { scenario: scenario({ side: 'x' }) }],
      [
        'extra action field',
        {
          scenario: scenario({
            availableActions: [
              { id: 'a', type: 'T', x: 1 },
              { id: 'b', type: 'T' },
            ],
          }),
        },
      ],
      ['1 action', { scenario: scenario({ availableActions: actions(1) }) }],
      ['11 actions', { scenario: scenario({ availableActions: actions(11) }) }],
      [
        'duplicate ids',
        {
          scenario: scenario({
            availableActions: [
              { id: 'a', type: 'T' },
              { id: 'a', type: 'U' },
            ],
          }),
        },
      ],
      [
        'bad action id',
        {
          scenario: scenario({
            availableActions: [
              { id: '-a', type: 'T' },
              { id: 'b', type: 'T' },
            ],
          }),
        },
      ],
      ['objective 501 chars', { scenario: scenario({ objective: 'x'.repeat(501) }) }],
      ['objective with a control char', { scenario: scenario({ objective: 'a\u0007b' }) }],
      ['empty phase', { scenario: scenario({ phase: '   ' }) }],
      ['unknown faction', { scenario: scenario({ faction: 'pirates' }) }],
      ['unknown role', { ...decisionBody(), role: 'boss' }],
      ['unknown provider', { ...decisionBody(), provider: 'openai' }],
      ['other budgetKey', { ...decisionBody(), budgetKey: 'session-1' }],
      ['missing scenario', {}],
    ])('%s → 400 VALIDATION', async (_name, body) => {
      ctx = await startAiApp();
      expectError(
        await postDecision(ctx.app, body),
        400,
        'VALIDATION',
        ERROR_MESSAGE_KEYS.validation,
      );
    });

    it('objective of exactly 500 chars and 10 actions are accepted', async () => {
      ctx = await startAiApp();
      const res = await postDecision(ctx.app, {
        scenario: scenario({ objective: 'x'.repeat(500), availableActions: actions(10) }),
      });
      expect(res.status).toBe(200);
    });

    it('malformed JSON, text/plain and an empty body → 400', async () => {
      ctx = await startAiApp();
      const post = () => api(ctx!.app).post(DECISION_PATH);
      expectError(
        await post().set('Content-Type', 'application/json').send('{broken'),
        400,
        'VALIDATION',
      );
      expectError(
        await post().set('Content-Type', 'text/plain').send(JSON.stringify(decisionBody())),
        400,
        'VALIDATION',
      );
      expectError(await post(), 400, 'VALIDATION');
    });

    it('Content-Length > 8192 → 413 (unified envelope), nothing is called or recorded', async () => {
      const fake = fakeOpenAI();
      ctx = await startAiApp({ openai: enabledOpenAI(), fake });
      const big = JSON.stringify({ ...decisionBody(), pad: 'x'.repeat(9000) });
      const res = await api(ctx.app)
        .post(DECISION_PATH)
        .set('Content-Type', 'application/json')
        .send(big);
      const body = expectError(res, 413, 'VALIDATION', ERROR_MESSAGE_KEYS.validation);
      expect(body.error.details).toMatchObject({ issues: [{ code: 'payload_too_large' }] });
      expect(fake.calls).toHaveLength(0);
      // 100 KB as well (beyond the global parser's limit) → still 413, not 500
      const huge = JSON.stringify({ pad: 'x'.repeat(100_000) });
      expectError(
        await api(ctx.app).post(DECISION_PATH).set('Content-Type', 'application/json').send(huge),
        413,
        'VALIDATION',
      );
    });

    it('unit: a chunked body without Content-Length is cut at 8192 bytes → 413', async () => {
      const gate = devAiBodyGate(8192);
      const stream = new PassThrough();
      const req = Object.assign(stream, {
        headers: {
          host: 'localhost',
          'transfer-encoding': 'chunked',
          'content-type': 'application/json',
        },
        socket: { remoteAddress: '127.0.0.1' },
      });
      const result = new Promise<unknown>((resolve) => {
        gate(req as never, {} as never, (err?: unknown) => resolve(err));
      });
      stream.write(Buffer.alloc(5000, 0x20));
      stream.write(Buffer.alloc(5000, 0x20));
      const err = await result;
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(413);
      stream.end();
    });
  });

  describe('rate limits', () => {
    it('11th paid decision in a minute → 429 aiDevRateLimited + Retry-After; mock still allowed', async () => {
      const fake = fakeOpenAI();
      ctx = await startAiApp({
        openai: enabledOpenAI(),
        fake,
        devRateLimit: { paidPerMinute: 10, totalPerMinute: 120 },
      });
      for (let i = 0; i < 10; i += 1) expect((await postDecision(ctx.app)).status).toBe(200);
      const res = await postDecision(ctx.app);
      const body = expectError(res, 429, 'AI_RATE_LIMITED', ERROR_MESSAGE_KEYS.aiDevRateLimited);
      const seconds = (body.error.details as { retryAfterSeconds: number }).retryAfterSeconds;
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(60);
      expect(res.headers['retry-after']).toBe(String(seconds));
      expect(fake.callsTo('/responses')).toHaveLength(10);
      expect((await postDecision(ctx.app, decisionBody({ provider: 'mock' }))).status).toBe(200);
      expect((await getStatus(ctx.app)).status).toBe(200);
    });

    it('total limit covers status and mock; invalid bodies do not consume the quota', async () => {
      ctx = await startAiApp({ devRateLimit: { paidPerMinute: 10, totalPerMinute: 2 } });
      expectError(await postDecision(ctx.app, { nope: 1 }), 400, 'VALIDATION');
      expect((await getStatus(ctx.app)).status).toBe(200);
      expect((await postDecision(ctx.app)).status).toBe(200);
      const res = await getStatus(ctx.app);
      expectError(res, 429, 'AI_RATE_LIMITED', ERROR_MESSAGE_KEYS.aiDevRateLimited);
      expect(res.headers['retry-after']).toMatch(/^\d+$/);
    });

    it('unit: sliding window frees slots after 60 s', () => {
      let now = 1_000_000;
      const limiter = new DevRateLimiter({ paidPerMinute: 2, totalPerMinute: 3 }, () => now);
      expect(limiter.hit(true)).toEqual({ ok: true });
      now += 10_000;
      expect(limiter.hit(true)).toEqual({ ok: true });
      expect(limiter.hit(true)).toEqual({ ok: false, retryAfterSeconds: 50 });
      expect(limiter.hit(false)).toEqual({ ok: true });
      expect(limiter.hit(false)).toEqual({ ok: false, retryAfterSeconds: 50 });
      now += 50_000;
      expect(limiter.hit(true)).toEqual({ ok: true });
    });
  });

  describe('no secrets in logs and responses (AC-10)', () => {
    it('Nest logger output, test sink and every body: no key, no objective, no reason', async () => {
      const writes: string[] = [];
      const capture = (chunk: unknown) => {
        writes.push(typeof chunk === 'string' ? chunk : String(chunk));
        return true;
      };
      vi.spyOn(process.stdout, 'write').mockImplementation(capture as typeof process.stdout.write);
      vi.spyOn(process.stderr, 'write').mockImplementation(capture as typeof process.stderr.write);

      const fake = fakeOpenAI({
        responses: [
          okResponse({ text: decisionText('action-1', REASON_MARKER) }),
          okResponse({ text: decisionText('action-99', REASON_MARKER) }),
          errorReply(400),
          errorReply(401),
        ],
      });
      const { sleep } = instantSleep();
      // Earlier apps in this process ran with `logger: false`, which drops Nest's static logger instance.
      Logger.overrideLogger(new ConsoleLogger());
      // no logSink: lines go to Nest Logger('AI') → process.stdout
      ctx = await startAiApp({
        openai: enabledOpenAI(),
        fake,
        logger: ['log', 'error', 'warn'],
        ai: {
          openaiFetch: fake.fetch,
          sleep,
          random: () => 0.5,
          devRateLimit: { paidPerMinute: 100, totalPerMinute: 100 },
        },
      });
      const bodies: string[] = [];
      for (let i = 0; i < 4; i += 1)
        bodies.push(JSON.stringify((await postDecision(ctx.app)).body));
      bodies.push(JSON.stringify((await getStatus(ctx.app)).body));
      vi.restoreAllMocks();

      const out = writes.join('');
      expect(out).toContain('ai.attempt'); // the capture works
      expect(out).toContain('ai.decision');
      for (const text of [out, ...bodies]) {
        expect(text).not.toContain(SENTINEL_KEY);
        expect(text).not.toContain('sk-test');
        expect(text).not.toContain(OBJECTIVE_MARKER);
        expect(text).not.toContain('OBJECTIVE-MARKER');
      }
      expect(out).not.toContain('REASON-MARKER');
      // the successful body carries the reason (that is the product); the failed ones never do
      expect(bodies[0]).toContain('REASON-MARKER');
      for (const b of bodies.slice(1)) expect(b).not.toContain('REASON-MARKER');
    });
  });
});
