import { IdempotencyKeySchema } from '@bga/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey, uuidV4FromRandomValues } from './idempotency';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('shared/api/idempotency (TC-C-10, TR-2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('createIdempotencyKey → a UUID v4 accepted by the server schema; every call is new', () => {
    const a = createIdempotencyKey();
    const b = createIdempotencyKey();
    expect(a).toMatch(UUID_V4);
    expect(IdempotencyKeySchema.safeParse(a).success).toBe(true);
    expect(a).not.toBe(b);
  });

  it('falls back to getRandomValues when randomUUID is missing (non-secure context)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => real.getRandomValues(bytes),
    });
    const key = createIdempotencyKey();
    expect(key).toMatch(UUID_V4);
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(true);
  });

  it('uuidV4FromRandomValues sets version and variant bits', () => {
    expect(uuidV4FromRandomValues((b) => b.fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
    expect(uuidV4FromRandomValues((b) => b.fill(0))).toBe('00000000-0000-4000-8000-000000000000');
  });
});
