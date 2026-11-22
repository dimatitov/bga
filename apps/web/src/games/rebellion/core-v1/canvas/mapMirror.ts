import type { ForceSet } from '../model/forces';

/**
 * `"empire:space:2,rebels:ground:1"` — the `data-markers` mirror of a system's / the zone's group counters in
 * `core-map-state` (SWR-009 plan §5.4); empty string when there are none.
 */
export function markersAttr(set: ForceSet | null | undefined): string {
  return (set?.groups ?? []).map((g) => `${g.owner}:${g.arena}:${g.count}`).join(',');
}
