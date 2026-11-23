/**
 * SWR-010 FIX-QA1 (D-1): zone-aware usage lines of a card. A catalog entry may list several usages (a probe card is
 * both an Empire refresh-draw card and the Rebels' base Location card); the UI shows the one that fits the zone the
 * card lies in first. Pure: only the public catalog + the zone kind, nothing hidden.
 */
import type { CardZoneKind } from './handModel';

/** Preferred usage key per card type and zone kind; zones not listed have no specific role (neutral). */
const ROLE_USAGE: Readonly<Record<string, Partial<Record<CardZoneKind, string>>>> = {
  probe: {
    hand: 'cards.usage.probe-refresh-draw',
    special: 'cards.usage.probe-base-location',
    revealed: 'cards.usage.probe-base-location',
  },
};

export interface ZoneUsage {
  /** The usage of the card's current role, `null` when the zone gives the card no specific role. */
  current: string | null;
  /** All catalog usages, the current one first, the rest in catalog order. */
  ordered: string[];
}

export function usageForZone(
  def: { typeId: string; usageKeys: readonly string[] },
  zoneKind: CardZoneKind | undefined,
): ZoneUsage {
  const preferred = zoneKind === undefined ? undefined : ROLE_USAGE[def.typeId]?.[zoneKind];
  const hasRoles = ROLE_USAGE[def.typeId] !== undefined;
  let current: string | null;
  if (preferred !== undefined && def.usageKeys.includes(preferred)) current = preferred;
  else if (hasRoles) current = null;
  else current = def.usageKeys[0] ?? null;
  const ordered =
    current === null
      ? [...def.usageKeys]
      : [current, ...def.usageKeys.filter((k) => k !== current)];
  return { current, ordered };
}
