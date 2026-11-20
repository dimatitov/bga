/**
 * Ranking of the bot's candidates (SWR-006 plan-backend §4.1, §4.5).
 * W6: `policyFor` returns the real side × difficulty policy (`scoreEmpire` / `scoreRebels`, weights in
 * `./profiles`); `basePolicy` (terminating action first, then by key) stays as a test / legacy policy.
 * Before scoring, `rankCandidates`:
 * 1. drops candidates the side's policy forbids (`allowEmpire` — hard never re-activates a searched system;
 *    `allowRebels` — hard never leaves the base without a Rebel unit, PO-1). The terminating action is never
 *    dropped, so a forbidden move can neither be chosen by the bot nor offered to the model;
 * 2. keeps ONE activation per system (leaders are rules-equivalent in core-v1, §4.2): the first leader of the
 *    template, or for easy a seeded pick — so the top-10 is not filled with duplicates.
 *
 * Order: score descending, then key ascending (stable, deterministic). Randomness only through `ctx.rng`
 * (seeded by `botSeed(view)`); the bot's own choice is always the first candidate.
 */
import type { CorePlayerView, Difficulty } from '../schema';
import { enumerateCandidates, isTerminating } from './candidates';
import { allowEmpire, scoreEmpire } from './empire-policy';
import { deriveBaseIntel } from './intel';
import { seededRandom } from './random';
import { allowRebels, scoreRebels } from './rebel-policy';
import type { BotCandidate, PolicyContext, ScoredCandidate, ScorePolicy } from './types';
import { buildViewModel } from './view-model';

/** BASE policy: 1 for FINISH / PASS, 0 for everything else (ties broken by key). */
export const basePolicy: ScorePolicy = (candidates) =>
  candidates.map((c) => (isTerminating(c) ? 1 : 0));

/** The scoring policy for a side (the difficulty is read from the context's profile). */
export function policyFor(view: CorePlayerView, _difficulty: Difficulty): ScorePolicy {
  return view.viewer === 'empire' ? scoreEmpire : scoreRebels;
}

/** Candidates the policy of this side × difficulty may rank (terminating actions always pass). */
export function allowedCandidates(
  candidates: readonly BotCandidate[],
  ctx: PolicyContext,
): BotCandidate[] {
  const allow = ctx.view.viewer === 'empire' ? allowEmpire : allowRebels;
  return candidates.filter((c) => isTerminating(c) || allow(c, ctx));
}

/**
 * One activation per system: the leader at `leaderPick` of each system's leader list (template order;
 * clamped). Non-activation candidates are kept in place.
 */
export function onePerSystem(
  candidates: readonly BotCandidate[],
  leaderPick: number,
): BotCandidate[] {
  const bySystem = new Map<string, BotCandidate[]>();
  for (const c of candidates) {
    if (c.kind !== 'activate' || c.systemId === null) continue;
    const list = bySystem.get(c.systemId);
    if (list) list.push(c);
    else bySystem.set(c.systemId, [c]);
  }
  const keep = new Set<BotCandidate>();
  for (const list of bySystem.values()) {
    const chosen = list[Math.min(Math.max(0, leaderPick), list.length - 1)];
    if (chosen) keep.add(chosen);
  }
  return candidates.filter((c) => c.kind !== 'activate' || c.systemId === null || keep.has(c));
}

/** Everything a policy may use, built from the actor's own view only. */
export function policyContext(
  view: CorePlayerView,
  difficulty: Difficulty,
  seed: string,
): PolicyContext {
  return {
    view,
    model: buildViewModel(view),
    difficulty,
    rng: seededRandom(seed),
    intel: view.viewer === 'empire' ? deriveBaseIntel(view) : null,
  };
}

/** Apply a policy and sort: score desc, then key asc. Non-finite scores count as `-Infinity`. */
export function rankWith(
  policy: ScorePolicy,
  candidates: readonly BotCandidate[],
  ctx: PolicyContext,
): ScoredCandidate[] {
  const scores = policy(candidates, ctx);
  if (scores.length !== candidates.length) {
    throw new Error('rankWith: the policy must score every candidate');
  }
  return candidates
    .map((c, i) => {
      const score = scores[i] ?? Number.NEGATIVE_INFINITY;
      return { ...c, score: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY };
    })
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Ordered candidates of the view for `difficulty`; `seed` drives the seeded randomness (`botSeed(view)` in
 * production). Accepts only a `CorePlayerView` — never a game state (TC-BOT-05).
 */
export function rankCandidates(
  view: CorePlayerView,
  difficulty: Difficulty,
  seed: string,
): ScoredCandidate[] {
  const all = enumerateCandidates(view);
  if (all.length === 0) return [];
  const ctx = policyContext(view, difficulty, seed);
  const leaders = new Set(all.filter((c) => c.kind === 'activate').map((c) => c.key.split('|')[1]));
  const leaderPick =
    difficulty === 'easy' ? Math.floor(seededRandom(`${seed}#leader`)() * leaders.size) : 0;
  const candidates = onePerSystem(allowedCandidates(all, ctx), leaderPick);
  return rankWith(policyFor(view, difficulty), candidates, ctx);
}
