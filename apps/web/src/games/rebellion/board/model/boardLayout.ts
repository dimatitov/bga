import type { Faction, PlayerViewMock } from '@bga/game-rebellion/schema';
import { type MapLayout, type MapPoint, mapLayout } from '@bga/game-rebellion/board';
import { computeBounds, type Bounds } from './geometry';
import { layoutAllPieces } from './pieceLayout';

export interface BoardLayout {
  centers: Map<string, MapPoint>;
  slots: Map<string, MapPoint>;
  overflow: Map<string, Record<Faction, number>>;
  bounds: Bounds | null;
}

const warned = new Set<string>();

/** World positions of systems (from `mapLayout`) and pieces (deterministic UI layout) for a view. */
export function computeBoardLayout(
  view: Pick<PlayerViewMock, 'systems' | 'pieces'>,
  layout: MapLayout = mapLayout,
): BoardLayout {
  const centers = new Map<string, MapPoint>();
  for (const s of view.systems) {
    const p = layout[s.id];
    if (p) centers.set(s.id, p);
    else if (import.meta.env.DEV && !warned.has(s.id)) {
      warned.add(s.id);
      console.warn(`[board] no mapLayout entry for system ${s.id}; it is not drawn`);
    }
  }
  const { slots, overflow } = layoutAllPieces(centers, view.pieces);
  return { centers, slots, overflow, bounds: computeBounds(layout, [...centers.keys()]) };
}
