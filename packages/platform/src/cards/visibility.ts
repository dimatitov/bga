import type { CardEngineContext, CardPile, CardRefView, CardZoneView } from './schema';

function byInstanceId(a: CardRefView, b: CardRefView): number {
  if (a.instanceId < b.instanceId) return -1;
  return a.instanceId > b.instanceId ? 1 : 0;
}

/**
 * Visibility projector. Every layout zone is listed, in layout order, with its count.
 * `cards` is:
 * - `null` for an ordered non-public zone — the order of a hidden deck is never projected, not even to its owner;
 * - the contents for a public zone, an `owner` zone seen by its owner, or a zone in `revealZoneIds`;
 * - `null` otherwise.
 * An ordered public zone lists cards in stored order; an unordered zone is sorted by instance id, so the stored
 * order (= the order of draws) never leaks. `viewer = null` is the public projection.
 * A layout zone absent from the pile (a broken pile, see `checkCardInvariants`) is skipped.
 */
export function projectZones(
  pile: CardPile,
  ctx: CardEngineContext,
  viewer: string | null,
  options?: { revealZoneIds?: readonly string[] },
): CardZoneView[] {
  const reveal = new Set(options?.revealZoneIds ?? []);
  const definitionOf = new Map(pile.instances.map((inst) => [inst.id, inst.definitionId]));
  const views: CardZoneView[] = [];
  for (const policy of ctx.layout) {
    const state = pile.zones.find((z) => z.id === policy.id);
    if (state === undefined) continue;
    const hiddenOrder = policy.ordered && policy.visibility !== 'public';
    const visible =
      !hiddenOrder &&
      (policy.visibility === 'public' ||
        (policy.visibility === 'owner' && viewer !== null && viewer === policy.owner) ||
        reveal.has(policy.id));
    let cards: CardRefView[] | null = null;
    if (visible) {
      cards = state.cards.map((instanceId) => ({
        instanceId,
        definitionId: definitionOf.get(instanceId) ?? '',
      }));
      if (!policy.ordered) cards.sort(byInstanceId);
    }
    views.push({
      id: policy.id,
      kind: policy.kind,
      owner: policy.owner,
      visibility: policy.visibility,
      ordered: policy.ordered,
      authority: state.authority,
      count: state.cards.length,
      cards,
    });
  }
  return views;
}
