/**
 * Seeded randomness of the bot (SWR-006 BD-4, A-3, AC-05). Own FNV-1a + mulberry32: no global random source, no
 * clock, no host entropy. The seed is a function of public view data only (`view.id`, `view.version`), so the same
 * session with the same commands always plays the same moves.
 */
import type { CorePlayerView } from '../schema';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit over the UTF-16 code units of `text` (unsigned). */
export function hash32(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 generator seeded with `hash32(seed)`; values in [0, 1). */
export function seededRandom(seed: string): () => number {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed of one decision: `${view.id}#${view.version}` (changes on every accepted command). */
export function botSeed(view: Pick<CorePlayerView, 'id' | 'version'>): string {
  return `${view.id}#${view.version}`;
}

/**
 * A "coin of the game" in [0, 1): constant for the whole session (only `view.id` + salt), so behaviour
 * decided by it ("sometimes", Q-BE-3) is consistent within a game and varies between games.
 */
export function gameCoin(view: Pick<CorePlayerView, 'id'>, salt: string): number {
  return seededRandom(`${view.id}#coin#${salt}`)();
}
