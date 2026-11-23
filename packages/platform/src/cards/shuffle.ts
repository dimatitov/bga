/**
 * Deterministic shuffle (frozen by a test vector): FNV-1a 32 over the UTF-16 code units
 * of the seed, mulberry32, Fisher–Yates from the end with `j = floor(rng() * (i + 1))`. No global random source,
 * no clock. Changing the algorithm changes the replay of game creation: only together with a new catalog version.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit (unsigned) over the UTF-16 code units of `seed`. */
export function seedFromString(seed: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 generator; values in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new array: a seeded permutation of `items` (the input is not mutated). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rng = mulberry32(seedFromString(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
