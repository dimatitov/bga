/**
 * Bot-vs-bot games on `PROP_SEEDS` × the 9 difficulty pairs (test-cases.md TC-BOT-01, TC-BOT-10): the AI seat is
 * driven by the server automation (`./harness`), the other seat by the same bot through `botHuman` (its own
 * view, its own difficulty). The AI seat alternates by seed so both sides are exercised as the automated side.
 */
import type { Difficulty, Faction } from '../../../src/schema';
import { botHuman, simulate, type SimResult } from './harness';
import { PROP_SEEDS } from './seeds';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface Pair {
  readonly empire: Difficulty;
  readonly rebels: Difficulty;
}

export const PAIRS: readonly Pair[] = DIFFICULTIES.flatMap((empire) =>
  DIFFICULTIES.map((rebels) => ({ empire, rebels })),
);

/** The automated side for the seed at `index` of `PROP_SEEDS` (alternating). */
export function aiSideFor(index: number): Faction {
  return index % 2 === 0 ? 'rebels' : 'empire';
}

export function botVsBot(sessionId: string, index: number, pair: Pair): SimResult {
  const aiSide = aiSideFor(index);
  const humanSide: Faction = aiSide === 'rebels' ? 'empire' : 'rebels';
  return simulate({
    sessionId,
    aiSide,
    difficulty: pair[aiSide],
    human: botHuman(pair[humanSide]),
  });
}

export const pairName = (p: Pair) => `E:${p.empire}/R:${p.rebels}`;

export { PROP_SEEDS };
