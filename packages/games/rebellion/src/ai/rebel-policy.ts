/**
 * Rebel scoring policy — wait, guard the base, sometimes leave it (SWR-006 plan-backend §4.5, PO-1, Q-2,
 * Q-BE-3, Q-13; weights in `./profiles`). Input: the Rebels' own view only (they always see their base).
 *
 * - Consolidation: the fleet (own carriers outside the base B) walks to B along a shortest path — ACTIVATE the
 *   next hop, MOVE the fleet with the difficulty's cargo (easy `ships-only`, normal `spare-load`, hard
 *   `all-fit`). Base units have no own capacity (Q-2), so the base can only be emptied after the fleet arrived.
 * - Evacuation / "expansion" from B into a neighbour (`all-fit` = every unit of B): easy proactively, normal
 *   only under threat (Imperial ground in B or adjacent, Q-13), each only when the game coin allows it
 *   (`gameCoin`, Q-BE-3 — consistent within one game); hard never.
 * - easy raids with capacity-less ships (x-wing / y-wing) + strong seeded noise.
 * - hard (PO-1): a MOVE leaving B without any Rebel unit is removed from the candidates (`allowRebels`).
 */
import { gameCoin } from './random';
import { REBEL_PROFILES, finishScore, type RebelProfile } from './profiles';
import type { BotCandidate, PolicyContext } from './types';
import type { ViewModel } from './view-model';

/** Rebel situation around the base for one decision. */
export interface RebelSituation {
  readonly baseId: string;
  /** Rebel units (all, structures included) in the base. */
  readonly baseUnits: number;
  /** Q-13: Imperial ground in the base or in a system adjacent to it (as the Rebels see it). */
  readonly threat: boolean;
  /** No Rebel leader in the base and the carriers there can lift every mobile ground unit of it. */
  readonly evacuable: boolean;
  /** The difficulty (and the game coin) allows leaving the base now. */
  readonly evacuationAllowed: boolean;
}

export function rebelSituation(ctx: PolicyContext): RebelSituation | null {
  const baseId = ctx.view.rebelBase.systemId;
  if (baseId === null) return null;
  const { model } = ctx;
  const profile = REBEL_PROFILES[ctx.difficulty];
  const forces = model.forcesOf('own', baseId);
  const threat = [baseId, ...(model.adjacency.get(baseId) ?? [])].some(
    (id) => model.forcesOf('enemy', id).ground > 0,
  );
  const evacuable =
    !model.pinnedSystems.has(baseId) &&
    forces.capacity > 0 &&
    forces.capacity >= forces.mobileGround;
  const { mode, coinSalt, coinBelow } = profile.evacuate;
  const coinOk = mode !== 'never' && gameCoin(ctx.view, coinSalt) < coinBelow;
  const evacuationAllowed = coinOk && (mode === 'proactive' || threat);
  return { baseId, baseUnits: forces.units, threat, evacuable, evacuationAllowed };
}

/** Own capacity-less ships (x-wing / y-wing) that can move from `systemId`. */
function freeShips0(model: ViewModel, systemId: string): number {
  if (model.pinnedSystems.has(systemId)) return 0;
  let count = 0;
  for (const unit of model.ownUnitsBySystem.get(systemId) ?? []) {
    const type = model.typeOf(unit.typeKey);
    if (
      type &&
      type.mobility === 'mobile' &&
      !type.requiresTransport &&
      type.transportCapacity === 0
    ) {
      count += 1;
    }
  }
  return count;
}

/** Systems with own carriers outside the base that can still move (the "fleet"). */
function fleetSources(model: ViewModel, baseId: string): string[] {
  return model.systemIds.filter(
    (id) =>
      id !== baseId &&
      !model.pinnedSystems.has(id) &&
      model.forcesOf('own', id).capacity > 0 &&
      Number.isFinite(model.distance(id, baseId)),
  );
}

/** Does this MOVE leave the base without any Rebel unit? */
export function emptiesBase(candidate: BotCandidate, model: ViewModel, baseId: string): boolean {
  if (candidate.command.type !== 'MOVE_PIECES' || candidate.command.fromSystemId !== baseId) {
    return false;
  }
  return model.forcesOf('own', baseId).units - candidate.command.pieceIds.length <= 0;
}

function movesGround(model: ViewModel, candidate: BotCandidate): boolean {
  if (candidate.command.type !== 'MOVE_PIECES') return false;
  const ids = new Set(candidate.command.pieceIds);
  return model.view.units.some((u) => ids.has(u.id) && model.typeOf(u.typeKey)?.arena === 'ground');
}

function scoreActivate(
  x: string,
  ctx: PolicyContext,
  profile: RebelProfile,
  s: RebelSituation,
): number {
  const { model } = ctx;
  const enemy = Math.min(model.forcesOf('enemy', x).units, 4);
  let best = 0;
  // Consolidation: the next hop of a fleet group towards the base (only while there is a base to guard).
  if (s.baseUnits > 0) {
    const dx = model.distance(x, s.baseId);
    const nextHop = fleetSources(model, s.baseId).some(
      (f) => (model.adjacency.get(f) ?? []).includes(x) && dx === model.distance(f, s.baseId) - 1,
    );
    if (nextHop) {
      best = Math.max(best, profile.consolidate + (x === s.baseId ? 0.1 : 0) - 0.05 * enemy);
    }
  }
  // Evacuation / expansion into a neighbour of the base.
  if (
    s.evacuationAllowed &&
    s.evacuable &&
    s.baseUnits > 0 &&
    (model.adjacency.get(s.baseId) ?? []).includes(x)
  ) {
    const hostileGround = model.forcesOf('enemy', x).ground > 0 ? 0.3 : 0;
    best = Math.max(best, profile.evacuate.activate - 0.1 * enemy - hostileGround);
  }
  // Raids: capacity-less ships from a group without carriers.
  if (profile.raid.activate > 0 && x !== s.baseId) {
    const raid = (model.adjacency.get(x) ?? []).some(
      (src) => freeShips0(model, src) > 0 && model.forcesOf('own', src).capacity === 0,
    );
    if (raid) best = Math.max(best, profile.raid.activate);
  }
  return best;
}

function scoreMove(
  candidate: BotCandidate,
  ctx: PolicyContext,
  profile: RebelProfile,
  s: RebelSituation,
): number {
  const { model } = ctx;
  const activation = model.activation;
  if (!activation || candidate.command.type !== 'MOVE_PIECES') return 0;
  const target = activation.systemId;
  const from = candidate.command.fromSystemId;
  const variants = candidate.variants ?? [];
  const ground = movesGround(model, candidate);

  if (from === s.baseId) {
    if (emptiesBase(candidate, model, s.baseId)) {
      return s.evacuationAllowed ? profile.evacuate.move : 0;
    }
    return profile.raid.move > 0 && !ground ? profile.raid.move : 0;
  }
  const towardsBase = model.distance(target, s.baseId) < model.distance(from, s.baseId);
  if (s.baseUnits > 0 && towardsBase && model.forcesOf('own', from).capacity > 0) {
    return variants.includes(profile.cargo)
      ? profile.moveConsolidate.cargo
      : profile.moveConsolidate.other;
  }
  if (profile.raid.move > 0 && !ground) return profile.raid.move;
  return 0.1;
}

/** hard (PO-1): never leave the base without a Rebel unit — such moves are not candidates at all. */
export function allowRebels(candidate: BotCandidate, ctx: PolicyContext): boolean {
  if (!REBEL_PROFILES[ctx.difficulty].guardBase || candidate.kind !== 'move') return true;
  const baseId = ctx.view.rebelBase.systemId;
  return baseId === null || !emptiesBase(candidate, ctx.model, baseId);
}

/** Scores of the Rebels' candidates (order of `candidates`). */
export function scoreRebels(candidates: readonly BotCandidate[], ctx: PolicyContext): number[] {
  const profile = REBEL_PROFILES[ctx.difficulty];
  const s = rebelSituation(ctx);
  if (s === null) return candidates.map((c) => (c.kind === 'finish' || c.kind === 'pass' ? 1 : 0));
  const raw = candidates.map((c) => {
    switch (c.kind) {
      case 'activate':
        return c.systemId === null ? 0 : scoreActivate(c.systemId, ctx, profile, s);
      case 'move':
        return scoreMove(c, ctx, profile, s);
      case 'pass':
        return profile.pass;
      case 'finish':
        return 0; // below
    }
  });
  const bestMove = Math.max(0, ...raw.filter((_, i) => candidates[i]?.kind === 'move'));
  const moves = ctx.model.activation?.moves ?? 0;
  return raw.map((score, i) => {
    const value =
      candidates[i]?.kind === 'finish' ? finishScore(moves, profile.maxMoves, bestMove) : score;
    return profile.noise > 0 ? value + profile.noise * ctx.rng() : value;
  });
}
