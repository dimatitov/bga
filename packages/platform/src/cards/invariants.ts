import type { CardEngineContext, CardInvariantIssue, CardPile } from './schema';

/**
 * Invariants of a stored pile against the game's layout. Each violation is its own issue:
 * - `missingZone` / `extraZone`: a layout zone has no state / a state zone is not in the layout (or appears twice);
 * - `duplicateInstance`: an instance id is declared twice (no zoneId) or placed twice (with the zoneId);
 * - `unknownCard`: a zone holds an undeclared instance (zoneId) or an instance's definition is unknown (no zoneId);
 * - `cardLost`: a declared instance is in no zone;
 * - `typeNotAccepted`: the zone policy does not accept the instance's type;
 * - `zoneFull`: a zone holds more than its `maxCards`.
 * Issues are listed in a stable order (layout order, then storage order).
 */
export function checkCardInvariants(pile: CardPile, ctx: CardEngineContext): CardInvariantIssue[] {
  const issues: CardInvariantIssue[] = [];
  const layoutIds = new Set(ctx.layout.map((p) => p.id));
  const stateIds = new Set<string>();
  for (const zone of pile.zones) {
    if (!layoutIds.has(zone.id) || stateIds.has(zone.id))
      issues.push({ code: 'extraZone', zoneId: zone.id });
    stateIds.add(zone.id);
  }
  for (const policy of ctx.layout) {
    if (!stateIds.has(policy.id)) issues.push({ code: 'missingZone', zoneId: policy.id });
  }

  const definitionOf = new Map<string, string>();
  for (const inst of pile.instances) {
    if (definitionOf.has(inst.id)) issues.push({ code: 'duplicateInstance', instanceId: inst.id });
    else definitionOf.set(inst.id, inst.definitionId);
    if (ctx.typeOfDefinition(inst.definitionId) === undefined)
      issues.push({ code: 'unknownCard', instanceId: inst.id });
  }

  const placed = new Set<string>();
  for (const zone of pile.zones) {
    const policy = ctx.layout.find((p) => p.id === zone.id);
    for (const id of zone.cards) {
      if (placed.has(id))
        issues.push({ code: 'duplicateInstance', zoneId: zone.id, instanceId: id });
      placed.add(id);
      const definitionId = definitionOf.get(id);
      if (definitionId === undefined) {
        issues.push({ code: 'unknownCard', zoneId: zone.id, instanceId: id });
        continue;
      }
      const typeId = ctx.typeOfDefinition(definitionId);
      if (policy !== undefined && typeId !== undefined && !policy.acceptsTypeIds.includes(typeId))
        issues.push({ code: 'typeNotAccepted', zoneId: zone.id, instanceId: id });
    }
    if (policy !== undefined && policy.maxCards !== null && zone.cards.length > policy.maxCards)
      issues.push({ code: 'zoneFull', zoneId: zone.id });
  }
  for (const id of definitionOf.keys()) {
    if (!placed.has(id)) issues.push({ code: 'cardLost', instanceId: id });
  }
  return issues;
}
