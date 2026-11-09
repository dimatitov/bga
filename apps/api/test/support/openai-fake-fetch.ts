/**
 * SWR-005B (plan-backend §5.9, BD-5): a fake `fetch` handed to the REAL OpenAI SDK (via `createOpenAIClient({ fetch })`)
 * so request serialisation, usage parsing and SDK error classes are exercised without any network. Every call is
 * recorded (url, method, headers, parsed JSON body). Keys used with it are sentinels only.
 */
import { createOpenAIClient, type EnabledOpenAIConfig } from '../../src/ai/providers/openai-client';
import { Secret } from '../../src/config/env';

/** Sentinel key: must never appear in logs, errors, responses or anything but the Authorization header. */
export const SENTINEL_KEY = 'sk-test-SENTINEL-do-not-leak-0123456789';

export interface FakeRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | undefined;
}

export type FakeReply =
  | { kind: 'json'; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: 'network-error' }
  | { kind: 'hang' };

export type FakeHandler = (req: FakeRequest, callIndex: number) => FakeReply | Promise<FakeReply>;

export interface FakeFetch {
  fetch: typeof fetch;
  calls: FakeRequest[];
  /** Calls whose URL path ends with the suffix (e.g. '/responses', '/models/gpt-6-luna'). */
  callsTo(pathSuffix: string): FakeRequest[];
}

function toUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error && signal.reason.name === 'AbortError'
    ? signal.reason
    : new DOMException('This operation was aborted', 'AbortError');
}

export function createFakeFetch(handler: FakeHandler): FakeFetch {
  const calls: FakeRequest[] = [];
  const fakeFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const rawBody = init?.body;
    let body: unknown = undefined;
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    const req: FakeRequest = {
      url: toUrl(input),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(init?.headers),
      body,
      signal: init?.signal ?? undefined,
    };
    const index = calls.length;
    calls.push(req);
    const reply = await handler(req, index);
    if (reply.kind === 'network-error') {
      throw new TypeError('fetch failed');
    }
    if (reply.kind === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        const signal = req.signal;
        if (!signal) return;
        if (signal.aborted) reject(abortError(signal));
        signal.addEventListener('abort', () => reject(abortError(signal)), { once: true });
      });
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    });
  };
  return {
    fetch: fakeFetch as typeof fetch,
    calls,
    callsTo: (suffix) => calls.filter((c) => new URL(c.url).pathname.endsWith(suffix)),
  };
}

// ---- reply builders ----

export interface ResponseUsageInit {
  input?: number;
  cached?: number;
  output?: number;
  reasoning?: number;
  total?: number;
}

export function usageBlock(u: ResponseUsageInit = {}) {
  const input = u.input ?? 420;
  const output = u.output ?? 37;
  return {
    input_tokens: input,
    input_tokens_details: { cached_tokens: u.cached ?? 0, cache_write_tokens: 0 },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: u.reasoning ?? 0 },
    total_tokens: u.total ?? input + output,
  };
}

export interface ResponseInit {
  model?: string;
  status?: 'completed' | 'incomplete' | 'failed';
  /** Text of the output message (JSON string normally). */
  text?: string;
  refusal?: string;
  usage?: ResponseUsageInit | null;
  requestId?: string;
}

/** A Responses API body. */
export function responseBody(init: ResponseInit = {}) {
  const content: unknown[] = [];
  if (init.refusal !== undefined) content.push({ type: 'refusal', refusal: init.refusal });
  if (init.text !== undefined) {
    content.push({ type: 'output_text', text: init.text, annotations: [], logprobs: [] });
  }
  const body: Record<string, unknown> = {
    id: 'resp_test_1',
    object: 'response',
    created_at: 1_762_560_000,
    model: init.model ?? 'gpt-6-luna-2026-10-01',
    status: init.status ?? 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content },
    ],
  };
  if (init.usage !== null) body.usage = usageBlock(init.usage ?? {});
  return body;
}

export function okResponse(init: ResponseInit = {}): FakeReply {
  return {
    kind: 'json',
    status: 200,
    body: responseBody(init),
    headers: { 'x-request-id': init.requestId ?? 'req_test_123' },
  };
}

/** A decision JSON string. */
export function decisionText(
  selectedActionId: string,
  reason = 'Improves strategic positioning',
): string {
  return JSON.stringify({ selectedActionId, reason });
}

export function modelReply(id: string): FakeReply {
  return {
    kind: 'json',
    status: 200,
    body: { id, object: 'model', created: 1_762_560_000, owned_by: 'openai' },
  };
}

/** An API error reply; the body message deliberately echoes the sentinel to prove it is never surfaced. */
export function errorReply(
  status: number,
  error: { code?: string | null; type?: string; message?: string } = {},
  headers: Record<string, string> = {},
): FakeReply {
  return {
    kind: 'json',
    status,
    body: {
      error: {
        message: error.message ?? `upstream said something with ${SENTINEL_KEY}`,
        type: error.type ?? 'invalid_request_error',
        param: null,
        code: error.code ?? null,
      },
    },
    headers: { 'x-request-id': 'req_err_1', ...headers },
  };
}

// ---- config / client ----

export function enabledOpenAI(
  overrides: Partial<Omit<EnabledOpenAIConfig, 'enabled'>> = {},
): EnabledOpenAIConfig {
  return Object.freeze({
    enabled: true,
    apiKey: overrides.apiKey ?? new Secret(SENTINEL_KEY),
    strategyModel: overrides.strategyModel ?? 'gpt-6.1-sol',
    tacticalModel: overrides.tacticalModel ?? 'gpt-6-luna',
    maxCostPerSessionUsd: overrides.maxCostPerSessionUsd ?? 0.25,
    timeoutMs: overrides.timeoutMs ?? 30_000,
    maxRetries: overrides.maxRetries ?? 2,
  });
}

/** Real SDK client wired to the fake fetch (the only way tests talk to "OpenAI"). */
export function fakeClient(fake: FakeFetch, openai: EnabledOpenAIConfig = enabledOpenAI()) {
  return createOpenAIClient({ openai, nodeEnv: 'test', fetch: fake.fetch });
}
