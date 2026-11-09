/**
 * SWR-005B (AC-13, plan-backend §2.5): Vitest `setupFiles` guard — no api test may reach the network.
 * `globalThis.fetch` is wrapped: any request to a non-loopback host (e.g. api.openai.com) is recorded and
 * rejected with an error; `afterAll` fails the file if anything was blocked, so swallowed errors are caught too.
 * Loopback (localhost, 127.0.0.1, ::1) stays allowed for supertest-like local calls.
 */
import { afterAll } from 'vitest';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const LOCAL_SCHEMES = new Set(['data:', 'blob:']);
const GUARD = Symbol.for('bga.test.noNetworkGuard');

type GuardedFetch = typeof fetch & { [GUARD]?: true };

const blocked: string[] = [];

function targetUrl(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return null;
  }
}

/** True when the request would leave the machine. Relative / unparsable URLs are treated as external. */
export function isExternalRequest(input: Parameters<typeof fetch>[0]): boolean {
  const url = targetUrl(input);
  if (!url) return true;
  if (LOCAL_SCHEMES.has(url.protocol)) return false;
  return !LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

/** Returns and clears the hosts blocked so far in this file (for the guard's own test). */
export function takeBlockedRequests(): string[] {
  return blocked.splice(0, blocked.length);
}

function install(): void {
  const current = globalThis.fetch as GuardedFetch;
  if (current[GUARD]) return;
  const original = current;
  const guarded: GuardedFetch = async (input, init) => {
    if (isExternalRequest(input)) {
      const host = targetUrl(input)?.host ?? '<unparsable url>';
      blocked.push(host);
      throw new Error(`Network access is forbidden in tests: ${host}`);
    }
    return original(input, init);
  };
  guarded[GUARD] = true;
  globalThis.fetch = guarded;
}

install();

afterAll(() => {
  const hosts = takeBlockedRequests();
  if (hosts.length > 0) {
    throw new Error(`Network access was attempted in tests: ${hosts.join(', ')}`);
  }
});
