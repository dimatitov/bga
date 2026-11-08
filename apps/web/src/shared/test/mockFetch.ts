import { vi } from 'vitest';

/** A mocked response: JSON `body` with `status`, or `'network'` to make fetch reject. */
export type MockReply = { status: number; body?: unknown } | 'network';
export type MockHandler = MockReply | ((req: MockRequest) => MockReply | Promise<MockReply>);

export interface MockRequest {
  method: string;
  /** Path without query, e.g. `/api/games`. */
  path: string;
  url: string;
  body: unknown;
}

/**
 * Replaces `globalThis.fetch` (plan-frontend §6.4: no MSW). Routes are `"METHOD /api/path"`;
 * an unmatched request fails the test loudly (404 + console error).
 * Returns the vi mock and the list of recorded requests.
 */
export function mockFetch(routes: Record<string, MockHandler>) {
  const requests: MockRequest[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url, 'http://localhost').pathname;
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as unknown;
      } catch {
        body = init.body;
      }
    }
    const req: MockRequest = { method, path, url, body };
    requests.push(req);
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      console.error(`mockFetch: no handler for ${method} ${path}`);
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' } }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const reply = typeof handler === 'function' ? await handler(req) : handler;
    if (reply === 'network') throw new TypeError('Failed to fetch');
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return { fetch: fn, requests };
}
