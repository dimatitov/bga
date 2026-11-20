/**
 * Weights of the Rebellion bot per side × difficulty (SWR-006 plan-backend §4.5). DATA only: the policies
 * (`./empire-policy`, `./rebel-policy`) read these numbers; W8 calibrates them within the table of §4.5.
 *
 * Shared conventions (both sides):
 * - scores live in [0, ~3]; the ranking is score desc, then key asc;
 * - `noise` > 0 (easy) adds `noise × rng()` to EVERY candidate (PASS / FINISH included) — the bot still takes
 *   `c1`, randomness only shapes the ranking;
 * - inside an own activation FINISH scores `finishDone` once `moves ≥ maxMoves` or no move is worth more than
 *   `usefulMove`, otherwise `finishEarly`;
 * - outside an activation an activation must beat PASS (`pass`) to be chosen; "empty" activations score 0.
 */
import type { Difficulty } from '../schema';
import type { MoveVariant } from './types';

/** Shared FINISH / usefulness constants. */
export const FINISH_DONE = 2.5;
export const FINISH_EARLY = 0.05;
/** A move must be worth more than this to keep an activation running. */
export const USEFUL_MOVE = 0.5;

export interface EmpireProfile {
  readonly noise: number;
  /** PASS outside an activation. */
  readonly pass: number;
  /** Extra PASS pressure once the Empire already activated this round (easy: early pass). */
  readonly passAfterActivation: number;
  readonly maxMoves: number;
  /** Knowledge (plan-backend §4.4): hints from Rebel moves (Q-BE-5), the first-game setup rule (Q-BE-4). */
  readonly useHints: boolean;
  readonly useStartRule: boolean;
  /** hard: activations of systems the Empire already searched are removed from the candidates. */
  readonly filterSearched: boolean;
  /** ACTIVATE X ∈ C (searchable): `base + weight · w(X)/max w + perGround · min(deliverable, 3)`. */
  readonly search: { readonly base: number; readonly weight: number; readonly perGround: number };
  /** ACTIVATE X ∈ C when the only searcher is already standing there (no move needed). */
  readonly searchInPlace: number;
  /** ACTIVATE a non-candidate X that brings ground closer to C ("pull forces"); 0 = not used. */
  readonly stage: { readonly base: number; readonly weight: number; readonly perJump: number };
  /** ACTIVATE the revealed base (no Imperial unit there yet, something can move in). */
  readonly assaultBase: number;
  /** ACTIVATE a system on the way to the revealed base: `base − perJump · dist(X, base)`. */
  readonly converge: { readonly base: number; readonly perJump: number };
  /**
   * W8 (post-reveal "cordon"): once the revealed base is held and nothing is left to converge, ACTIVATE an empty
   * neighbour of the base and MOVE the ships (`ships-only` — the ground stays and keeps holding the base) out to
   * it; the next round the reinforcement brings them back. Keeps the Empire acting every round instead of
   * passing out the game (TC-OUT-01: AI activations in ≥ 10 of 13 rounds). 0 = not used (easy).
   */
  readonly cordon: { readonly activate: number; readonly move: number };
  /** MOVE into X ∈ C with ground while X has no Imperial ground. */
  readonly moveSearch: {
    /** Preferred variants (score `preferred + perGround · ground`). */
    readonly variants: readonly MoveVariant[];
    readonly preferred: number;
    readonly other: number;
    readonly perGround: number;
  };
  /** MOVE with ground into X ∈ C that already has Imperial ground, as the first move (hard: "deliver max"). */
  readonly reinforceSearch: number;
  /** MOVE into the revealed base: `all-fit` / any other subset. */
  readonly moveBase: { readonly allFit: number; readonly other: number };
}

export interface RebelProfile {
  readonly noise: number;
  readonly pass: number;
  readonly maxMoves: number;
  /** Cargo variant of the fleet when it moves towards the base (Q-2). */
  readonly cargo: 'ships-only' | 'spare-load' | 'all-fit';
  /** ACTIVATE the next system on the fleet's shortest path to the base. */
  readonly consolidate: number;
  /** MOVE of the fleet towards the base: the cargo variant / any other subset. */
  readonly moveConsolidate: { readonly cargo: number; readonly other: number };
  /**
   * Evacuation / "expansion" (PO-1, Q-BE-3): `never` (hard), `threat` (normal: only under threat, Q-13),
   * `proactive` (easy); allowed when `gameCoin(view, coinSalt) < coinBelow`.
   */
  readonly evacuate: {
    readonly mode: 'never' | 'threat' | 'proactive';
    readonly coinSalt: string;
    readonly coinBelow: number;
    readonly activate: number;
    readonly move: number;
  };
  /** Raids with capacity-less ships (x-wing / y-wing); 0 = never. */
  readonly raid: { readonly activate: number; readonly move: number };
  /** hard (PO-1): moves leaving the base without a Rebel unit are removed from the candidates. */
  readonly guardBase: boolean;
}

export const EMPIRE_PROFILES: Readonly<Record<Difficulty, EmpireProfile>> = {
  easy: {
    noise: 0.6,
    pass: 0.15,
    passAfterActivation: 0.5,
    maxMoves: 1,
    useHints: false,
    useStartRule: false,
    filterSearched: false,
    search: { base: 0.6, weight: 0, perGround: 0 },
    searchInPlace: 0.6,
    stage: { base: 0, weight: 0, perJump: 0 },
    assaultBase: 1.5,
    converge: { base: 0.5, perJump: 0.05 },
    cordon: { activate: 0, move: 0 },
    moveSearch: { variants: [], preferred: 0.8, other: 0.8, perGround: 0 },
    reinforceSearch: 0,
    moveBase: { allFit: 1.0, other: 0.6 },
  },
  normal: {
    noise: 0,
    pass: 0.05,
    passAfterActivation: 0,
    maxMoves: 1,
    useHints: true,
    useStartRule: false,
    filterSearched: false,
    search: { base: 1, weight: 0.2, perGround: 0 },
    searchInPlace: 0.9,
    stage: { base: 0.25, weight: 0, perJump: 0.03 },
    assaultBase: 1.5,
    converge: { base: 0.5, perJump: 0.05 },
    cordon: { activate: 0.3, move: 0.8 },
    moveSearch: { variants: ['ground-strike'], preferred: 1.2, other: 0.8, perGround: 0 },
    reinforceSearch: 0,
    moveBase: { allFit: 1.0, other: 0.6 },
  },
  hard: {
    noise: 0,
    pass: 0.01,
    passAfterActivation: 0,
    maxMoves: 2,
    useHints: true,
    useStartRule: true,
    filterSearched: true,
    search: { base: 1, weight: 0.3, perGround: 0.1 },
    searchInPlace: 0.9,
    stage: { base: 0.4, weight: 0.1, perJump: 0.05 },
    assaultBase: 1.6,
    converge: { base: 0.6, perJump: 0.05 },
    cordon: { activate: 0.3, move: 0.8 },
    moveSearch: {
      variants: ['all-fit', 'ground-strike'],
      preferred: 1.2,
      other: 1.0,
      perGround: 0.05,
    },
    reinforceSearch: 0.7,
    moveBase: { allFit: 1.2, other: 0.6 },
  },
};

export const REBEL_PROFILES: Readonly<Record<Difficulty, RebelProfile>> = {
  easy: {
    noise: 0.5,
    pass: 0.1,
    maxMoves: 1,
    cargo: 'ships-only',
    consolidate: 1.0,
    moveConsolidate: { cargo: 1.2, other: 0.4 },
    evacuate: {
      mode: 'proactive',
      coinSalt: 'easy-expand',
      coinBelow: 0.8,
      activate: 1.2,
      move: 1.3,
    },
    raid: { activate: 0.3, move: 0.6 },
    guardBase: false,
  },
  normal: {
    noise: 0,
    pass: 0.05,
    maxMoves: 1,
    cargo: 'spare-load',
    consolidate: 1.0,
    moveConsolidate: { cargo: 1.2, other: 0.4 },
    evacuate: { mode: 'threat', coinSalt: 'normal-evac', coinBelow: 0.5, activate: 1.2, move: 1.3 },
    raid: { activate: 0, move: 0 },
    guardBase: false,
  },
  hard: {
    noise: 0,
    pass: 0.05,
    maxMoves: 1,
    cargo: 'all-fit',
    consolidate: 1.0,
    moveConsolidate: { cargo: 1.2, other: 0.4 },
    evacuate: { mode: 'never', coinSalt: 'hard-never', coinBelow: 0, activate: 0, move: 0 },
    raid: { activate: 0, move: 0 },
    guardBase: true,
  },
};

/** FINISH score inside an own activation (shared rule of §4.5). */
export function finishScore(moves: number, maxMoves: number, bestMove: number): number {
  return moves >= maxMoves || bestMove <= USEFUL_MOVE ? FINISH_DONE : FINISH_EARLY;
}
