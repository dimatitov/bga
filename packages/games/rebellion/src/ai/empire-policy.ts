/**
 * Empire scoring policy — the hunt for the hidden Rebel base (SWR-006 plan-backend §4.5, weights in
 * `./profiles`). Input: the Empire's own view only (`PolicyContext`); the base knowledge is `ctx.intel`
 * (`deriveBaseIntel`) narrowed per difficulty by `possibleBaseSystems` (easy: exclusions + searched; normal:
 * + hints Q-BE-5; hard: + the first-game setup rule Q-BE-4).
 *
 * Before the reveal:
 * - ACTIVATE X ∈ C that can be searched (Imperial ground can move in, or already stands there);
 * - normal / hard "pull forces": ACTIVATE a non-candidate X that brings ground closer to C;
 * - MOVE ground into the activated X (normal prefers `ground-strike`, hard the subset with most ground);
 * - FINISH reveals / marks X as searched (R-8).
 * After the reveal: ACTIVATE the base when something can move in (assault while no Imperial unit is there,
 * else reinforce) and converge on it hop by hop (every move strictly closer — finite); normal / hard, once nothing is
 * left to converge, keep a "cordon" (W8): ships of the held base go out to an empty neighbour and come back the
 * next round (the ground never leaves). hard never activates an already searched system (filter, TC-DIF-06).
 * easy: strong seeded noise on every candidate + early PASS after the first activation of the round.
 */
import type { CorePlayerView } from '../schema';
import { deriveBaseIntel, possibleBaseSystems, type BaseIntel } from './intel';
import { EMPIRE_PROFILES, finishScore, type EmpireProfile } from './profiles';
import type { BotCandidate, PolicyContext } from './types';
import type { ViewModel } from './view-model';

/** The Empire's working knowledge for one decision. */
export interface EmpireKnowledge {
  readonly intel: BaseIntel;
  /** Systems that may still hold the base with their weights (after the reveal: the base alone). */
  readonly candidates: ReadonlyMap<string, number>;
  readonly maxWeight: number;
  readonly knownBaseId: string | null;
}

export function empireKnowledge(ctx: PolicyContext): EmpireKnowledge {
  const profile = EMPIRE_PROFILES[ctx.difficulty];
  const intel = ctx.intel ?? deriveBaseIntel(ctx.view);
  const candidates = possibleBaseSystems(ctx.view, intel, {
    useHints: profile.useHints,
    useStartRule: profile.useStartRule,
  });
  let maxWeight = 1;
  for (const w of candidates.values()) maxWeight = Math.max(maxWeight, w);
  return { intel, candidates, maxWeight, knownBaseId: intel.knownBaseId };
}

/** Own mobile units of `systemId` that can actually move (ships without transport + carried riders). */
function movableUnits(model: ViewModel, systemId: string): number {
  if (model.pinnedSystems.has(systemId)) return 0;
  let free = 0;
  let riders = 0;
  let capacity = 0;
  for (const unit of model.ownUnitsBySystem.get(systemId) ?? []) {
    const type = model.typeOf(unit.typeKey);
    if (!type || type.mobility !== 'mobile') continue;
    if (type.requiresTransport) riders += 1;
    else {
      free += 1;
      capacity += type.transportCapacity;
    }
  }
  return free + Math.min(riders, capacity);
}

/** Own ground (any ground unit reveals the base, R-8) standing in `systemId`. */
function ownGround(model: ViewModel, systemId: string): number {
  return model.forcesOf('own', systemId).ground;
}

/** Ground pieces of a MOVE candidate (from the actor's own unit types). */
export function movedGround(model: ViewModel, candidate: BotCandidate): number {
  if (candidate.command.type !== 'MOVE_PIECES') return 0;
  const ids = new Set(candidate.command.pieceIds);
  let ground = 0;
  for (const unit of model.view.units) {
    if (!ids.has(unit.id)) continue;
    if (model.typeOf(unit.typeKey)?.arena === 'ground') ground += 1;
  }
  return ground;
}

/** Jumps from `systemId` to the nearest system of `targets` (`Infinity` when none). */
function distanceToSet(model: ViewModel, systemId: string, targets: Iterable<string>): number {
  let best = Infinity;
  for (const target of targets) best = Math.min(best, model.distance(systemId, target));
  return best;
}

/** Sources adjacent to X (not pinned) that hold deliverable ground. */
function groundSources(model: ViewModel, systemId: string): string[] {
  return (model.adjacency.get(systemId) ?? []).filter((source) => {
    if (model.pinnedSystems.has(source)) return false;
    const forces = model.forcesOf('own', source);
    return Math.min(forces.mobileGround, forces.capacity) > 0;
  });
}

/**
 * Post-reveal cordon (W8): an empty neighbour X of a held, unpinned base whose own ground stays there, while the
 * base still has ships that can move out (`profile.cordon.activate`, else 0).
 */
function cordonActivate(x: string, base: string, model: ViewModel, profile: EmpireProfile): number {
  if (profile.cordon.activate <= 0 || model.pinnedSystems.has(base)) return 0;
  if (!(model.adjacency.get(base) ?? []).includes(x) || model.forcesOf('own', x).units > 0)
    return 0;
  const held = model.forcesOf('own', base);
  if (held.ground === 0) return 0;
  const ships = (model.ownUnitsBySystem.get(base) ?? []).some((unit) => {
    const type = model.typeOf(unit.typeKey);
    return type?.mobility === 'mobile' && !type.requiresTransport && type.arena !== 'ground';
  });
  return ships ? profile.cordon.activate : 0;
}

function scoreActivate(
  x: string,
  ctx: PolicyContext,
  profile: EmpireProfile,
  k: EmpireKnowledge,
): number {
  const { model } = ctx;
  const base = k.knownBaseId;
  if (base !== null) {
    const holding = model.forcesOf('own', base).units > 0;
    if (x === base) {
      const reach = (model.adjacency.get(base) ?? []).reduce(
        (sum, s) => sum + movableUnits(model, s),
        0,
      );
      // Assault an empty-of-Imperials base; otherwise reinforce it (more units there when Rebels leave).
      if (reach === 0) return 0;
      return holding ? profile.converge.base : profile.assaultBase;
    }
    // Converge: a source next to X moves strictly closer to the base.
    const dx = model.distance(x, base);
    const progress = (model.adjacency.get(x) ?? []).some(
      (s) => movableUnits(model, s) > 0 && model.distance(s, base) > dx,
    );
    const converge = progress
      ? Math.max(0, profile.converge.base - profile.converge.perJump * dx)
      : 0;
    return Math.max(converge, cordonActivate(x, base, model, profile));
  }

  if (k.candidates.has(x)) {
    const w = (k.candidates.get(x) ?? 1) / k.maxWeight;
    const deliver = model.deliverableGround(x);
    if (deliver > 0) {
      return (
        profile.search.base +
        profile.search.weight * w +
        profile.search.perGround * Math.min(deliver, 3)
      );
    }
    return ownGround(model, x) > 0 ? profile.searchInPlace + profile.search.weight * w : 0;
  }

  // "Pull forces": bring ground into X when X is strictly closer to C than every source that can feed it.
  if (profile.stage.base <= 0 || ownGround(model, x) > 0) return 0;
  const sources = groundSources(model, x);
  if (sources.length === 0) return 0;
  const dx = distanceToSet(model, x, k.candidates.keys());
  const d0 = Math.min(...sources.map((s) => distanceToSet(model, s, k.candidates.keys())));
  if (!(dx < d0) || !Number.isFinite(dx)) return 0;
  let nearWeight = 0;
  for (const [id, weight] of k.candidates) {
    if (model.distance(x, id) === dx) nearWeight = Math.max(nearWeight, weight);
  }
  return Math.max(
    0,
    profile.stage.base +
      (profile.stage.weight * nearWeight) / k.maxWeight -
      profile.stage.perJump * dx,
  );
}

function scoreMove(
  candidate: BotCandidate,
  ctx: PolicyContext,
  profile: EmpireProfile,
  k: EmpireKnowledge,
): number {
  const { model } = ctx;
  const activation = model.activation;
  if (!activation || candidate.command.type !== 'MOVE_PIECES') return 0;
  const target = activation.systemId;
  const from = candidate.command.fromSystemId;
  const variants = candidate.variants ?? [];
  const ground = movedGround(model, candidate);
  const base = k.knownBaseId;

  if (base !== null) {
    if (target === base) {
      return variants.includes('all-fit') ? profile.moveBase.allFit : profile.moveBase.other;
    }
    if (from === base) {
      // Cordon: only the ships leave; the ground keeps holding the base.
      return profile.cordon.move > 0 &&
        activation.moves === 0 &&
        ground === 0 &&
        variants.includes('ships-only')
        ? profile.cordon.move
        : 0;
    }
    if (activation.moves === 0 && model.distance(from, base) > model.distance(target, base)) {
      return variants.includes('all-fit') ? 0.9 : 0.6;
    }
    return 0.1;
  }

  if (k.candidates.has(target)) {
    if (ground === 0) return 0.1;
    if (ownGround(model, target) === 0) {
      const preferred =
        profile.moveSearch.variants.length === 0 ||
        variants.some((v) => profile.moveSearch.variants.includes(v));
      return (
        (preferred ? profile.moveSearch.preferred : profile.moveSearch.other) +
        profile.moveSearch.perGround * ground
      );
    }
    return activation.moves === 0 && profile.reinforceSearch > 0 ? profile.reinforceSearch : 0.2;
  }

  // Staging (pull forces): the first ground move into a non-candidate system.
  if (ground > 0 && activation.moves === 0 && profile.stage.base > 0) return 0.9 + 0.05 * ground;
  return 0.1;
}

/** Hard filter (TC-DIF-06): before the reveal never activate a system the Empire has already searched. */
export function allowEmpire(candidate: BotCandidate, ctx: PolicyContext): boolean {
  const profile = EMPIRE_PROFILES[ctx.difficulty];
  if (!profile.filterSearched || candidate.kind !== 'activate' || candidate.systemId === null) {
    return true;
  }
  const intel = ctx.intel ?? deriveBaseIntel(ctx.view);
  return intel.knownBaseId !== null || !intel.searched.has(candidate.systemId);
}

/** Scores of the Empire's candidates (order of `candidates`). */
export function scoreEmpire(candidates: readonly BotCandidate[], ctx: PolicyContext): number[] {
  const profile = EMPIRE_PROFILES[ctx.difficulty];
  const k = empireKnowledge(ctx);
  const raw = candidates.map((c) => {
    switch (c.kind) {
      case 'activate':
        return c.systemId === null ? 0 : scoreActivate(c.systemId, ctx, profile, k);
      case 'move':
        return scoreMove(c, ctx, profile, k);
      case 'pass':
        return (
          profile.pass + (ctx.model.activationsThisRound > 0 ? profile.passAfterActivation : 0)
        );
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

/** Exposed for tests: the Empire's candidate systems for a view and difficulty. */
export function empireCandidateSystems(
  view: CorePlayerView,
  difficulty: PolicyContext['difficulty'],
): ReadonlyMap<string, number> {
  const profile = EMPIRE_PROFILES[difficulty];
  return possibleBaseSystems(view, deriveBaseIntel(view), {
    useHints: profile.useHints,
    useStartRule: profile.useStartRule,
  });
}
