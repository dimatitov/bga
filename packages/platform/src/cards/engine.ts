import { checkCardInvariants } from './invariants';
import {
  CardPileSchema,
  type CardAuthority,
  type CardEngineContext,
  type CardError,
  type CardInstance,
  type CardInvariantIssue,
  type CardPile,
  type CardResult,
  type CardZoneKind,
  type CardZonePolicy,
  type CardZoneState,
} from './schema';
import { seededShuffle } from './shuffle';

/**
 * Deck engine. Pure: inputs are never mutated, every result is a new value; an illegal
 * transition is a typed error result, never an exception. The engine checks only zone mechanics (zones exist, the
 * source holds the card, the destination accepts its type and has room); a game's rules decide which transitions
 * are legal moves.
 */

export interface MoveCardArgs {
  instanceId: string;
  from: string;
  to: string;
  position?: 'top' | 'bottom';
}

type Failure = { ok: false; error: CardError };

function fail(error: CardError): Failure {
  return { ok: false, error };
}

function clonePile(pile: CardPile): CardPile {
  return {
    instances: pile.instances.map((inst) => ({ id: inst.id, definitionId: inst.definitionId })),
    zones: pile.zones.map((zone) => ({
      id: zone.id,
      authority: zone.authority,
      cards: [...zone.cards],
    })),
  };
}

interface ResolvedZone {
  policy: CardZonePolicy;
  index: number;
  state: CardZoneState;
}

/** A zone exists only when it is both in the layout and in the stored pile. */
function resolveZone(
  pile: CardPile,
  ctx: CardEngineContext,
  zoneId: string,
): ResolvedZone | Failure {
  const policy = ctx.layout.find((p) => p.id === zoneId);
  const index = pile.zones.findIndex((z) => z.id === zoneId);
  const state = pile.zones[index];
  if (policy === undefined || state === undefined) return fail({ code: 'unknownZone', zoneId });
  return { policy, index, state };
}

function isFailure(x: ResolvedZone | Failure): x is Failure {
  return 'ok' in x;
}

/** Destination policy checks for cards entering a zone that already holds `current` cards. */
function checkAccepts(
  policy: CardZonePolicy,
  ctx: CardEngineContext,
  entering: readonly CardInstance[],
  current: number,
): Failure | null {
  for (const inst of entering) {
    const typeId = ctx.typeOfDefinition(inst.definitionId);
    if (typeId === undefined)
      return fail({ code: 'unknownCard', instanceId: inst.id, definitionId: inst.definitionId });
    if (!policy.acceptsTypeIds.includes(typeId))
      return fail({
        code: 'typeNotAccepted',
        zoneId: policy.id,
        instanceId: inst.id,
        definitionId: inst.definitionId,
      });
  }
  if (policy.maxCards !== null && current + entering.length > policy.maxCards)
    return fail({ code: 'zoneFull', zoneId: policy.id });
  return null;
}

export function createPile(
  ctx: CardEngineContext,
  input: {
    instances: readonly CardInstance[];
    placement: Readonly<Record<string, readonly string[]>>;
    authority: Readonly<Record<string, CardAuthority>>;
  },
): CardResult {
  const layoutIds = new Set(ctx.layout.map((p) => p.id));
  for (const zoneId of [...Object.keys(input.placement), ...Object.keys(input.authority)]) {
    if (!layoutIds.has(zoneId)) return fail({ code: 'unknownZone', zoneId });
  }
  for (const policy of ctx.layout) {
    if (input.authority[policy.id] === undefined)
      return fail({ code: 'unknownZone', zoneId: policy.id });
  }
  const byId = new Map<string, CardInstance>();
  for (const inst of input.instances) {
    if (byId.has(inst.id)) return fail({ code: 'duplicateInstance', instanceId: inst.id });
    if (ctx.typeOfDefinition(inst.definitionId) === undefined)
      return fail({ code: 'unknownCard', instanceId: inst.id, definitionId: inst.definitionId });
    byId.set(inst.id, inst);
  }
  const placed = new Set<string>();
  const zones: CardZoneState[] = [];
  for (const policy of ctx.layout) {
    const ids = Object.hasOwn(input.placement, policy.id) ? (input.placement[policy.id] ?? []) : [];
    const entering: CardInstance[] = [];
    for (const id of ids) {
      const inst = byId.get(id);
      if (inst === undefined)
        return fail({ code: 'unknownCard', zoneId: policy.id, instanceId: id });
      if (placed.has(id))
        return fail({ code: 'duplicateInstance', zoneId: policy.id, instanceId: id });
      placed.add(id);
      entering.push(inst);
    }
    const rejected = checkAccepts(policy, ctx, entering, 0);
    if (rejected !== null) return rejected;
    zones.push({
      id: policy.id,
      authority: input.authority[policy.id] as CardAuthority,
      cards: [...ids],
    });
  }
  for (const inst of input.instances) {
    if (!placed.has(inst.id)) return fail({ code: 'cardLost', instanceId: inst.id });
  }
  return {
    ok: true,
    pile: {
      instances: input.instances.map((inst) => ({ id: inst.id, definitionId: inst.definitionId })),
      zones,
    },
    moved: [],
  };
}

export function shuffleZone(
  pile: CardPile,
  ctx: CardEngineContext,
  zoneId: string,
  seed: string,
): CardResult {
  const zone = resolveZone(pile, ctx, zoneId);
  if (isFailure(zone)) return zone;
  if (!zone.policy.ordered) return fail({ code: 'zoneNotOrdered', zoneId });
  const next = clonePile(pile);
  (next.zones[zone.index] as CardZoneState).cards = seededShuffle(zone.state.cards, seed);
  return { ok: true, pile: next, moved: [] };
}

/** Takes `count` cards from the top (`cards[0..]`) of an ordered zone and appends them to `to`, in order. */
export function drawCards(
  pile: CardPile,
  ctx: CardEngineContext,
  a: { from: string; to: string; count: number; allowShort: boolean },
): CardResult {
  const from = resolveZone(pile, ctx, a.from);
  if (isFailure(from)) return from;
  const to = resolveZone(pile, ctx, a.to);
  if (isFailure(to)) return to;
  if (a.from === a.to) return fail({ code: 'sameZone', zoneId: a.to });
  if (!from.policy.ordered) return fail({ code: 'zoneNotOrdered', zoneId: a.from });
  if (!Number.isInteger(a.count) || a.count < 0)
    return fail({ code: 'invalidCount', zoneId: a.from });
  if (from.state.cards.length < a.count && !a.allowShort)
    return fail({ code: 'insufficientCards', zoneId: a.from });
  const taken = from.state.cards.slice(0, a.count);
  const entering = taken.map((id) => pile.instances.find((inst) => inst.id === id));
  for (let i = 0; i < entering.length; i += 1) {
    if (entering[i] === undefined)
      return fail({ code: 'unknownCard', zoneId: a.from, instanceId: taken[i] });
  }
  const rejected = checkAccepts(to.policy, ctx, entering as CardInstance[], to.state.cards.length);
  if (rejected !== null) return rejected;
  const next = clonePile(pile);
  (next.zones[from.index] as CardZoneState).cards = from.state.cards.slice(taken.length);
  (next.zones[to.index] as CardZoneState).cards = [...to.state.cards, ...taken];
  return { ok: true, pile: next, moved: [...taken] };
}

/**
 * Moves one instance. `position` ('bottom' by default) matters only for an ordered destination: 'top' puts the card
 * at `cards[0]`; an unordered destination always appends.
 */
export function moveCard(pile: CardPile, ctx: CardEngineContext, a: MoveCardArgs): CardResult {
  return moveChecked(pile, ctx, a, null);
}

function moveChecked(
  pile: CardPile,
  ctx: CardEngineContext,
  a: MoveCardArgs,
  requiredKind: CardZoneKind | null,
): CardResult {
  const from = resolveZone(pile, ctx, a.from);
  if (isFailure(from)) return from;
  const to = resolveZone(pile, ctx, a.to);
  if (isFailure(to)) return to;
  if (requiredKind !== null && to.policy.kind !== requiredKind)
    return fail({ code: 'wrongZoneKind', zoneId: a.to });
  if (a.from === a.to) return fail({ code: 'sameZone', zoneId: a.to });
  const inst = pile.instances.find((i) => i.id === a.instanceId);
  if (inst === undefined) return fail({ code: 'unknownCard', instanceId: a.instanceId });
  const at = from.state.cards.indexOf(a.instanceId);
  if (at < 0) return fail({ code: 'cardNotInZone', zoneId: a.from, instanceId: a.instanceId });
  const rejected = checkAccepts(to.policy, ctx, [inst], to.state.cards.length);
  if (rejected !== null) return rejected;
  const next = clonePile(pile);
  (next.zones[from.index] as CardZoneState).cards = from.state.cards.filter((_, i) => i !== at);
  const top = to.policy.ordered && a.position === 'top';
  (next.zones[to.index] as CardZoneState).cards = top
    ? [a.instanceId, ...to.state.cards]
    : [...to.state.cards, a.instanceId];
  return { ok: true, pile: next, moved: [a.instanceId] };
}

/** `moveCard` into an `inPlay` zone. */
export function playCard(pile: CardPile, ctx: CardEngineContext, a: MoveCardArgs): CardResult {
  return moveChecked(pile, ctx, a, 'inPlay');
}

/** `moveCard` into a `discard` zone. */
export function discardCard(pile: CardPile, ctx: CardEngineContext, a: MoveCardArgs): CardResult {
  return moveChecked(pile, ctx, a, 'discard');
}

/** `moveCard` into a `revealed` zone. */
export function revealCard(pile: CardPile, ctx: CardEngineContext, a: MoveCardArgs): CardResult {
  return moveChecked(pile, ctx, a, 'revealed');
}

/** `moveCard` into a `deck` zone (top or bottom). */
export function returnCard(pile: CardPile, ctx: CardEngineContext, a: MoveCardArgs): CardResult {
  return moveChecked(pile, ctx, a, 'deck');
}

/**
 * Registration by identity (a card held physically): takes the first instance of `definitionId` found at any
 * position of `from` and appends it to `to`, which must be a zone with `physical` authority.
 */
export function registerCard(
  pile: CardPile,
  ctx: CardEngineContext,
  a: { definitionId: string; from: string; to: string },
): CardResult {
  const from = resolveZone(pile, ctx, a.from);
  if (isFailure(from)) return from;
  const to = resolveZone(pile, ctx, a.to);
  if (isFailure(to)) return to;
  if (to.state.authority !== 'physical') return fail({ code: 'notPhysicalZone', zoneId: a.to });
  if (a.from === a.to) return fail({ code: 'sameZone', zoneId: a.to });
  const instanceId = from.state.cards.find(
    (id) => pile.instances.find((inst) => inst.id === id)?.definitionId === a.definitionId,
  );
  if (instanceId === undefined)
    return fail({ code: 'cardNotInZone', zoneId: a.from, definitionId: a.definitionId });
  return moveChecked(pile, ctx, { instanceId, from: a.from, to: a.to }, null);
}

/**
 * Restore after a restart: schema + invariants. A schema failure is reported as issues too (the frozen issue codes
 * have no "schema" code): a problem under `zones` → `unknownZone`, under `instances` → `unknownCard`, anything else
 * (not an object, missing lists) → `missingZone`.
 */
export function restorePile(
  raw: unknown,
  ctx: CardEngineContext,
): { ok: true; pile: CardPile } | { ok: false; issues: CardInvariantIssue[] } {
  const parsed = CardPileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue): CardInvariantIssue => {
      const [head] = issue.path;
      if (head === 'zones') return { code: 'unknownZone' };
      if (head === 'instances') return { code: 'unknownCard' };
      return { code: 'missingZone' };
    });
    return { ok: false, issues };
  }
  const issues = checkCardInvariants(parsed.data, ctx);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, pile: parsed.data };
}
