import { createHash } from 'node:crypto';
import { canonicalJson } from '@bga/platform';

/**
 * SHA-256 (hex) of the canonical `{ gameId, setup }` of a `POST /api/sessions` (stored as `idempotencyHash`).
 * `canonicalJson` is the shared implementation of `@bga/platform` (also used by the web client, review #3).
 */
export function idempotencyHash(request: { gameId: string; setup: unknown }): string {
  return createHash('sha256')
    .update(canonicalJson({ gameId: request.gameId, setup: request.setup }))
    .digest('hex');
}
