/**
 * SWR-005B W4 (plan-backend §5.5; AC-02; Q-26): GET /v1/models/{id} via the real SDK + fake fetch — 200 cached
 * (one fetch), 404 → not_found, 401/403 → key_rejected, network → unknown (not cached), concurrent dedupe.
 */
import { describe, expect, it } from 'vitest';
import { AiFailure } from '../../src/ai/ai.errors';
import {
  availabilityFlag,
  AVAILABLE_TTL_MS,
  ModelAvailabilityService,
  UNAVAILABLE_TTL_MS,
} from '../../src/ai/model-availability.service';
import { lazyOpenAIClient } from '../../src/ai/providers/openai-client';
import {
  createFakeFetch,
  enabledOpenAI,
  errorReply,
  modelReply,
  SENTINEL_KEY,
  type FakeHandler,
} from '../support/openai-fake-fetch';

function setup(handler: FakeHandler) {
  const fake = createFakeFetch(handler);
  const openai = enabledOpenAI();
  let now = 0;
  const svc = new ModelAvailabilityService({
    client: lazyOpenAIClient({ openai, nodeEnv: 'test', fetch: fake.fetch }),
    monotonicNow: () => now,
  });
  return { fake, svc, advance: (ms: number) => (now += ms) };
}

describe('ModelAvailabilityService', () => {
  it('200 → available, cached for 10 min (one fetch), then re-checked', async () => {
    const { fake, svc, advance } = setup((req) =>
      modelReply(new URL(req.url).pathname.split('/').pop()!),
    );
    expect(await svc.check('gpt-6-luna')).toBe('available');
    expect(await svc.check('gpt-6-luna')).toBe('available');
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/models/gpt-6-luna');
    expect(call.method).toBe('GET');
    expect(call.headers.get('authorization')).toBe(`Bearer ${SENTINEL_KEY}`);
    expect(svc.peek('gpt-6-luna')).toBe('available');
    advance(AVAILABLE_TTL_MS);
    expect(svc.peek('gpt-6-luna')).toBeUndefined();
    await svc.check('gpt-6-luna');
    expect(fake.calls).toHaveLength(2);
  });

  it('404 → not_found (cached 60 s); requireAvailable → 503 aiModelUnavailable', async () => {
    const { fake, svc, advance } = setup(() => errorReply(404, { code: 'model_not_found' }));
    expect(await svc.check('gpt-x')).toBe('not_found');
    const f = (await svc
      .requireAvailable('gpt-x', 'strategy')
      .catch((e: unknown) => e)) as AiFailure;
    expect(f).toBeInstanceOf(AiFailure);
    expect(f.code).toBe('AI_NOT_CONFIGURED');
    expect(f.messageKey).toBe('errors.aiModelUnavailable');
    expect(f.attempts).toBe(0);
    expect(fake.calls).toHaveLength(1);
    advance(UNAVAILABLE_TTL_MS);
    await svc.check('gpt-x');
    expect(fake.calls).toHaveLength(2);
  });

  it('401 / 403 → key_rejected; requireAvailable → aiKeyRejected', async () => {
    for (const status of [401, 403]) {
      const { svc } = setup(() => errorReply(status));
      expect(await svc.check('gpt-6-luna')).toBe('key_rejected');
      const f = (await svc
        .requireAvailable('gpt-6-luna', 'tactical')
        .catch((e: unknown) => e)) as AiFailure;
      expect(f.messageKey).toBe('errors.aiKeyRejected');
    }
  });

  it('network / 5xx → unknown, not cached; requireAvailable → 502 AI_PROVIDER_ERROR network', async () => {
    for (const reply of [{ kind: 'network-error' } as const, errorReply(500)]) {
      const { fake, svc } = setup(() => reply);
      expect(await svc.check('gpt-6-luna')).toBe('unknown');
      expect(svc.peek('gpt-6-luna')).toBeUndefined();
      const f = (await svc
        .requireAvailable('gpt-6-luna', 'tactical')
        .catch((e: unknown) => e)) as AiFailure;
      expect(f.code).toBe('AI_PROVIDER_ERROR');
      expect(f.reason).toBe('network');
      expect(fake.calls).toHaveLength(2);
    }
  });

  it('concurrent checks of one model share one request', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const { fake, svc } = setup(async () => {
      await gate;
      return modelReply('gpt-6-luna');
    });
    const all = Promise.all([
      svc.check('gpt-6-luna'),
      svc.check('gpt-6-luna'),
      svc.check('gpt-6-luna'),
    ]);
    release();
    expect(await all).toEqual(['available', 'available', 'available']);
    expect(fake.calls).toHaveLength(1);
  });

  it('invalidate drops the cache entry', async () => {
    const { fake, svc } = setup(() => modelReply('gpt-6-luna'));
    await svc.check('gpt-6-luna');
    svc.invalidate('gpt-6-luna');
    await svc.check('gpt-6-luna');
    expect(fake.calls).toHaveLength(2);
  });

  it('availabilityFlag for the status endpoint', () => {
    expect(availabilityFlag('available')).toBe(true);
    expect(availabilityFlag('not_found')).toBe(false);
    expect(availabilityFlag('key_rejected')).toBe(false);
    expect(availabilityFlag('unknown')).toBeNull();
    expect(availabilityFlag(undefined)).toBeNull();
  });
});
