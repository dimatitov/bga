/**
 * Frozen seed sets of SWR-006 `test-cases.md` (Conventions → «Наборы seed»). Changing them requires an Analyst
 * Clarification (Q-3) — never edit to make a threshold pass.
 */
const range = (prefix: string, count: number): readonly string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

/** 20 session ids `swr006-d01 … swr006-d20` — difficulty metrics (TC-DIF-*, TC-OUT-04/05/07). */
export const DIFF_SEEDS = range('swr006-d', 20);

/** 30 session ids `swr006-p01 … swr006-p30` — property / termination tests (TC-BOT-01, TC-BOT-10). */
export const PROP_SEEDS = range('swr006-p', 30);
