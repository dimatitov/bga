import { memo } from 'react';
import { Layer, Line } from 'react-konva';
import { mapStyle } from '../../../theme/mapStyle';
import type { LinkScene, Scene } from '../../geometry/sceneModel';

export interface StaticMapLayerProps {
  regions: Scene['regions'];
  links: LinkScene[];
}

/**
 * Static part of the vector map (SWR-009 R-4): region outlines — ONLY a dashed border, no fill (regions are told
 * apart by the outline and the caption) — and the routes (adjacency lines). Not interactive and memoised: it
 * re-renders only when the map itself changes. No bitmap cache: a cache would blur when zooming.
 */
function StaticMapLayerImpl({ regions, links }: StaticMapLayerProps) {
  const { region, route } = mapStyle;
  return (
    <Layer listening={false}>
      {regions.map((r) => (
        <Line
          key={`border-${r.id}`}
          name="region"
          points={r.polygon.flatMap((p) => [p.x, p.y])}
          closed
          stroke={region.stroke}
          strokeWidth={region.width}
          strokeScaleEnabled={false}
          dash={[...region.dash]}
          perfectDrawEnabled={false}
        />
      ))}
      {links.map((l) => (
        <Line
          key={`${l.a}|${l.b}`}
          name="route"
          points={[l.from.x, l.from.y, l.to.x, l.to.y]}
          stroke={route.stroke}
          strokeWidth={route.width}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      ))}
    </Layer>
  );
}

export const StaticMapLayer = memo(StaticMapLayerImpl);
