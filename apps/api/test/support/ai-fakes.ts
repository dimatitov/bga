/**
 * SWR-005B W6: helpers of the dev AI HTTP tests. Apps are real (`createApp` via `startApp`), OpenAI is the REAL SDK
 * wired to a fake fetch (openai-fake-fetch.ts) — never the network; keys are sentinels only.
 */
import type { INestApplication, LogLevel } from '@nestjs/common';
import type { AiUsage } from '@prisma/client';
import type { AiTestOverrides, MockStep } from '../../src/ai/ai.types';
import type { OpenAIConfig } from '../../src/config/env';
import { PrismaService } from '../../src/persistence/prisma.service';
import {
  createFakeFetch,
  decisionText,
  enabledOpenAI,
  modelReply,
  okResponse,
  type FakeFetch,
  type FakeReply,
  type FakeRequest,
} from './openai-fake-fetch';
import { api, createTestDb, startApp, stopApp, type TestDb } from './test-app';

export const STATUS_PATH = '/api/dev/ai/status';
export const DECISION_PATH = '/api/dev/ai/test-decision';

/** Objective / reason markers that must never appear in logs. */
export const OBJECTIVE_MARKER = 'Strengthen imperial control OBJECTIVE-MARKER-7f3a';
export const REASON_MARKER = 'REASON-MARKER-91bc improves strategic positioning';

/** The PO test scenario (test data, not game rules), with a marker objective. */
export function scenario(overrides: Record<string, unknown> = {}) {
  return {
    faction: 'empire',
    phase: 'command',
    objective: OBJECTIVE_MARKER,
    availableActions: [
      { id: 'action-1', type: 'MOVE_FLEET', target: 'corellia' },
      { id: 'action-2', type: 'RECRUIT', target: 'coruscant' },
      { id: 'action-3', type: 'PASS' },
    ],
    ...overrides,
  };
}

export function decisionBody(extra: Record<string, unknown> = {}) {
  return { scenario: scenario(), ...extra };
}

/** No real waiting in tests (backoff sleeps resolve immediately; the requested delays are recorded). */
export function instantSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

export interface AiApp {
  app: INestApplication;
  db: TestDb;
  logs: string[];
  delays: number[];
  stop(): Promise<void>;
}

export interface StartAiAppOptions {
  openai?: OpenAIConfig;
  fake?: FakeFetch;
  mockScript?: readonly MockStep[];
  devRateLimit?: AiTestOverrides['devRateLimit'];
  nodeEnv?: 'development' | 'test' | 'production';
  /** Replace the default test overrides entirely (e.g. to exercise the Nest logger). */
  ai?: AiTestOverrides;
  logger?: LogLevel[] | false;
}

export async function startAiApp(options: StartAiAppOptions = {}): Promise<AiApp> {
  const db = createTestDb();
  const logs: string[] = [];
  const { sleep, delays } = instantSleep();
  const ai: AiTestOverrides = options.ai ?? {
    openaiFetch: options.fake?.fetch,
    mockScript: options.mockScript,
    sleep,
    random: () => 0.5,
    logSink: (line) => logs.push(line),
    devRateLimit: options.devRateLimit ?? { paidPerMinute: 1000, totalPerMinute: 1000 },
  };
  const app = await startApp(db.url, {
    logger: options.logger ?? false,
    config: { nodeEnv: options.nodeEnv ?? 'test', openai: options.openai },
    ai,
  });
  return { app, db, logs, delays, stop: () => stopApp(app, db) };
}

export function rowsOf(app: INestApplication): Promise<AiUsage[]> {
  return app.get(PrismaService).aiUsage.findMany({ orderBy: { createdAt: 'asc' } });
}

export function postDecision(app: INestApplication, body: unknown = decisionBody()) {
  return api(app)
    .post(DECISION_PATH)
    .send(body as object);
}

export function getStatus(app: INestApplication) {
  return api(app).get(STATUS_PATH);
}

/**
 * Fake OpenAI: `GET /models/{id}` answers from `models` (default: both available), `POST /responses` from the
 * queue (the last reply repeats; default: a valid decision for `action-2`).
 */
export function fakeOpenAI(
  options: {
    models?: Record<string, FakeReply>;
    responses?: FakeReply[];
    onResponse?: (req: FakeRequest, index: number) => FakeReply | Promise<FakeReply>;
  } = {},
): FakeFetch {
  let responseIndex = 0;
  return createFakeFetch((req) => {
    const path = new URL(req.url).pathname;
    const modelMatch = /\/models\/([^/]+)$/.exec(path);
    if (modelMatch) {
      const id = decodeURIComponent(modelMatch[1] ?? '');
      return options.models?.[id] ?? modelReply(id);
    }
    if (path.endsWith('/responses')) {
      const i = responseIndex++;
      if (options.onResponse) return options.onResponse(req, i);
      const queue = options.responses ?? [okResponse({ text: decisionText('action-2') })];
      return queue[Math.min(i, queue.length - 1)] ?? okResponse();
    }
    return { kind: 'json', status: 404, body: { error: { message: 'unexpected path' } } };
  });
}

export { enabledOpenAI };
