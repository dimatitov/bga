/**
 * `Idempotency-Key` generator for `POST /api/sessions` (SWR-004 plan-frontend §4.2, TR-2). A separate module so
 * tests replace it with `vi.mock('@/shared/api/idempotency')`. The server accepts any UUID (Q-2); we send v4.
 */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** UUID v4 from `crypto.getRandomValues` (RFC 9562 §5.4) — for non-secure contexts without `randomUUID`. */
export function uuidV4FromRandomValues(getRandomValues: (bytes: Uint8Array) => Uint8Array): string {
  const b = getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // version 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => HEX[x] ?? '00');
  return [
    h.slice(0, 4).join(''),
    h.slice(4, 6).join(''),
    h.slice(6, 8).join(''),
    h.slice(8, 10).join(''),
    h.slice(10, 16).join(''),
  ].join('-');
}

/**
 * A fresh UUID v4: `crypto.randomUUID()` (secure contexts) or the `getRandomValues` fallback (dev by LAN IP over
 * plain HTTP, where `randomUUID` is undefined).
 */
export function createIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return uuidV4FromRandomValues((bytes) => c.getRandomValues(bytes));
}
