/**
 * SWR-005B W1 (AC-13, plan-backend §2.5): the Vitest setup guard rejects any fetch to a non-loopback host
 * (no request leaves the machine) and records it; loopback stays allowed.
 */
import { describe, expect, it } from 'vitest';
import { isExternalRequest, takeBlockedRequests } from './setup/no-network';

describe('no-network guard', () => {
  it('fetch to api.openai.com throws before any network access and is recorded', async () => {
    await expect(fetch('https://api.openai.com/v1/models')).rejects.toThrow(
      'Network access is forbidden in tests: api.openai.com',
    );
    await expect(fetch(new URL('https://example.com/x'))).rejects.toThrow(/example\.com/);
    await expect(fetch(new Request('https://api.openai.com/v1/responses'))).rejects.toThrow(
      /api\.openai\.com/,
    );
    // Consumed here so the guard's afterAll does not fail this file on purpose-made requests.
    expect(takeBlockedRequests()).toEqual(['api.openai.com', 'example.com', 'api.openai.com']);
  });

  it('classifies hosts: loopback allowed, everything else external', () => {
    for (const url of [
      'http://localhost:3000/api/health',
      'http://127.0.0.1:1/x',
      'http://[::1]:8080/',
      'data:text/plain,hi',
    ]) {
      expect(isExternalRequest(url)).toBe(false);
    }
    for (const url of [
      'https://api.openai.com/v1/models',
      'https://10.0.0.1/',
      'http://localhost.evil.com/',
      '/relative',
      'not a url',
    ]) {
      expect(isExternalRequest(url)).toBe(true);
    }
  });

  it('the guard is installed globally (setupFiles)', () => {
    expect(
      (globalThis.fetch as unknown as Record<symbol, unknown>)[
        Symbol.for('bga.test.noNetworkGuard')
      ],
    ).toBe(true);
  });
});
