/**
 * SWR-006 W9: scripted HUMAN players of the HTTP full-game tests (test-cases.md Conventions, plan-backend §9.2 W9).
 * A re-implementation of the W8 engine scripts (`packages/games/rebellion/test/ai/sim/harness.ts`) — the api tests
 * and the package tests never import each other. The scripts read the FULL stored state (test oracle: only the
 * HUMAN script may know the true base, never the bot) and return the next command of the human side; the command is
 * always one of the human's own legal candidates (`enumerateCandidates` on the human side's view).
 *
 * - `huntingEmpire` (`E-HUNT`): one strike group (ground + transport) walks the shortest path to the base, one hop
 *   per round, activates the base, brings ground in and finishes (→ reveal); after the reveal it holds and passes.
 * - `activeRebels` (`R-ACTIVE`): every round one activation of a NON-base system with one move into it, then PASS.
 * - `passiveHuman` (`E-PASSIVE` / `R-PASSIVE`): always PASS.
 * Plus the oracles `emptyBase` / `threat` of the hard-difficulty guard invariant (TC-DIF-02, Q-13, Q-15).
 */
import { enumerateCandidates, type BotCandidate } from '@bga/game-rebellion/ai';
import { toSideView } from '@bga/game-rebellion/rules';
import type { CoreGameState, Faction } from '@bga/game-rebellion/schema';

export type HumanCommand = BotCandidate['command'];
/** The next command of the human side (called only when it is the human's turn). */
export type HumanScript = (state: CoreGameState) => HumanCommand;

const GROUND = /\.(stormtrooper|at-st|at-at|rebel-trooper|airspeeder)$/;

export function isGroundType(typeKey: string): boolean {
  return GROUND.test(typeKey);
}

export function adjacency(state: CoreGameState): Map<string, readonly string[]> {
  return new Map(state.map.systems.map((s) => [s.id, s.adjacentSystemIds]));
}

/** BFS jumps from `from` to every system. */
export function distancesFrom(state: CoreGameState, from: string): Map<string, number> {
  const adj = adjacency(state);
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head] as string;
    for (const next of adj.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, (dist.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** `emptyBase(s)`: no Rebel unit in the base system. */
export function emptyBase(state: CoreGameState): boolean {
  const base = state.rebelBase.systemId;
  return !state.units.some((u) => u.owner === 'rebels' && u.systemId === base);
}

/** `threat(s)` (Q-13): Imperial ground in the base or in a system adjacent to it. */
export function threat(state: CoreGameState): boolean {
  const base = state.rebelBase.systemId;
  if (base === null) return false;
  const around = new Set([base, ...(adjacency(state).get(base) ?? [])]);
  return state.units.some(
    (u) => u.owner === 'empire' && around.has(u.systemId) && isGroundType(u.typeKey),
  );
}

/** Activations of `side` in the current round (from the full log). */
function activatedThisRound(state: CoreGameState, side: Faction): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    const event = state.log[i];
    if (!event) continue;
    if (event.type === 'PHASE_STARTED' && event.payload.phase === 'command') break;
    if (event.type === 'SYSTEM_ACTIVATED' && event.actor === side) count += 1;
  }
  return count;
}

/** Own `PIECES_MOVED` since the current activation started. */
function movesInActivation(state: CoreGameState, side: Faction): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    const event = state.log[i];
    if (!event) continue;
    if (event.type === 'SYSTEM_ACTIVATED' && event.actor === side) break;
    if (event.type === 'PIECES_MOVED' && event.actor === side) count += 1;
  }
  return count;
}

function candidatesOf(state: CoreGameState): BotCandidate[] {
  return enumerateCandidates(toSideView(state, state.activeSide));
}

function terminating(candidates: readonly BotCandidate[]): HumanCommand {
  const c = candidates.find((x) => x.kind === 'pass' || x.kind === 'finish');
  if (!c) throw new Error('scripted human: no terminating action');
  return c.command;
}

/** `E-PASSIVE` / `R-PASSIVE`: always PASS (FINISH inside an activation). */
export const passiveHuman: HumanScript = (state) => terminating(candidatesOf(state));

function groundAndCapacity(state: CoreGameState, systemId: string, side: Faction) {
  let ground = 0;
  let capacity = 0;
  for (const u of state.units) {
    if (u.owner !== side || u.systemId !== systemId) continue;
    const type = state.unitTypes.find((t) => t.typeKey === u.typeKey);
    if (!type || type.mobility !== 'mobile') continue;
    if (type.arena === 'ground') ground += 1;
    else if (!type.requiresTransport) capacity += type.transportCapacity;
  }
  return { ground, capacity, deliverable: Math.min(ground, capacity) };
}

function fromOf(c: BotCandidate): string {
  return c.command.type === 'MOVE_PIECES' ? c.command.fromSystemId : '';
}

/** `E-HUNT` — the full-knowledge human Empire (see the file header). */
export const huntingEmpire: HumanScript = (state) => {
  const candidates = candidatesOf(state);
  const base = state.rebelBase.systemId;
  if (base === null) throw new Error('E-HUNT: no base');
  const toBase = distancesFrom(state, base);
  const d = (id: string) => toBase.get(id) ?? Infinity;

  if (state.activation !== null) {
    if (movesInActivation(state, 'empire') > 0) return terminating(candidates);
    const moves = candidates.filter(
      (c) =>
        c.kind === 'move' &&
        c.command.type === 'MOVE_PIECES' &&
        (c.variants ?? []).includes('all-fit') &&
        groundAndCapacity(state, c.command.fromSystemId, 'empire').deliverable > 0,
    );
    moves.sort((a, b) => {
      const fa = fromOf(a);
      const fb = fromOf(b);
      return d(fa) - d(fb) || (fa < fb ? -1 : fa > fb ? 1 : 0);
    });
    return moves[0]?.command ?? terminating(candidates);
  }

  if (state.rebelBase.revealed || activatedThisRound(state, 'empire') > 0) {
    return terminating(candidates);
  }
  const leaderHere = new Set(
    state.leaders.filter((l) => l.owner === 'empire' && l.systemId !== null).map((l) => l.systemId),
  );
  const groups = state.map.systems
    .map((s) => s.id)
    .filter(
      (id) =>
        !leaderHere.has(id) &&
        id !== base &&
        groundAndCapacity(state, id, 'empire').deliverable > 0 &&
        Number.isFinite(d(id)),
    )
    .sort((a, b) => d(a) - d(b) || (a < b ? -1 : 1));
  const group = groups[0];
  if (group === undefined) return terminating(candidates);
  const hop = [...(adjacency(state).get(group) ?? [])]
    .filter((x) => d(x) === d(group) - 1)
    .sort()[0];
  const activation = candidates.find((c) => c.kind === 'activate' && c.systemId === hop);
  return activation?.command ?? terminating(candidates);
};

/** `R-ACTIVE` — one activation of a non-base system per round with one move into it (never the base), then PASS. */
export const activeRebels: HumanScript = (state) => {
  const candidates = candidatesOf(state);
  const base = state.rebelBase.systemId;
  if (state.activation !== null) {
    if (movesInActivation(state, 'rebels') > 0) return terminating(candidates);
    const move = candidates.find(
      (c) => c.command.type === 'MOVE_PIECES' && c.command.fromSystemId !== base,
    );
    return move?.command ?? terminating(candidates);
  }
  if (activatedThisRound(state, 'rebels') > 0) return terminating(candidates);
  const pinned = new Set(
    state.leaders.filter((l) => l.owner === 'rebels' && l.systemId !== null).map((l) => l.systemId),
  );
  const adj = adjacency(state);
  const sources = new Set(
    state.units
      .filter((u) => {
        if (u.owner !== 'rebels' || u.systemId === base || pinned.has(u.systemId)) return false;
        const type = state.unitTypes.find((t) => t.typeKey === u.typeKey);
        return type?.mobility === 'mobile' && !type.requiresTransport;
      })
      .map((u) => u.systemId),
  );
  const activation = candidates.find(
    (c) =>
      c.kind === 'activate' &&
      c.systemId !== null &&
      c.systemId !== base &&
      (adj.get(c.systemId) ?? []).some((s) => sources.has(s)),
  );
  return activation?.command ?? terminating(candidates);
};
