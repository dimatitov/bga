import type { PlayerViewCore } from '@bga/game-rebellion/schema';

export interface MapStats {
  systems: number;
  /** Undirected routes (pairs of `adjacentSystemIds`, each counted once). */
  routes: number;
  regions: number;
}

/** Real map counters for the display header and the footer (SWR-009 K-5, plan §3.3; base game: 32 / 69 / 8). */
export function mapStats(map: PlayerViewCore['map']): MapStats {
  const known = new Set(map.systems.map((s) => s.id));
  const pairs = new Set<string>();
  for (const s of map.systems) {
    for (const other of s.adjacentSystemIds) {
      if (other === s.id || !known.has(other)) continue;
      pairs.add(s.id < other ? `${s.id}|${other}` : `${other}|${s.id}`);
    }
  }
  return { systems: map.systems.length, routes: pairs.size, regions: map.regions.length };
}
