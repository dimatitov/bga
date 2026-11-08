/**
 * Deterministic choice of the rebel base system (R-10, D-4; plan-backend §2): FNV-1a 32-bit hash of the
 * session id over its UTF-16 code units → index into the eligible systems sorted by id. No randomness, no
 * clock: the same `sessionId` always gives the same base. Server-only (`./rules` never reaches the web bundle).
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit over the UTF-16 code units of `text` (unsigned result). */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The base system for `sessionId` among `eligibleSystemIds` (`eligibleRebelBaseSystemIds(data)`; re-sorted
 * here so the result never depends on the caller's order). Empty list = invalid data → throws.
 */
export function chooseRebelBase(sessionId: string, eligibleSystemIds: readonly string[]): string {
  const sorted = [...new Set(eligibleSystemIds)].sort();
  if (sorted.length === 0) throw new Error('chooseRebelBase: no eligible system');
  const chosen = sorted[fnv1a32(sessionId) % sorted.length];
  if (chosen === undefined) throw new Error('chooseRebelBase: index out of range');
  return chosen;
}
