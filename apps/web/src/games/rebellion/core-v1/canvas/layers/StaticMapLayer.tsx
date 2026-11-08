import { memo } from 'react';
import { Layer, Line } from 'react-konva';
import { rebellionPalette } from '../../../theme/palette';
import type { LinkScene, Scene } from '../../geometry/sceneModel';

/** Own region tints (decorative; regions are told apart by borders and captions, not by colour alone). */
const REGION_TINTS: Record<string, string> = {
  r1: '#3B82F6',
  r2: '#F59E0B',
  r3: '#EF4444',
  r4: '#10B981',
  r5: '#8B5CF6',
  r6: '#94A3B8',
  r7: '#22D3EE',
  r8: '#EC4899',
};

export interface StaticMapLayerProps {
  regions: Scene['regions'];
  links: LinkScene[];
}

/**
 * Static part of the map (plan-frontend §4): region polygons (6 % tint, dashed 1.5 px border) and adjacency lines.
 * Not interactive and memoised: it re-renders only when the map itself changes (not on zoom/pan or selection).
 * No bitmap cache: the layer is drawn under the stage transform, a cache would blur when zooming.
 */
function StaticMapLayerImpl({ regions, links }: StaticMapLayerProps) {
  return (
    <Layer listening={false}>
      {regions.map((r) => (
        <Line
          key={`region-${r.id}`}
          points={r.polygon.flatMap((p) => [p.x, p.y])}
          closed
          fill={REGION_TINTS[r.id] ?? rebellionPalette.board.systemStroke}
          opacity={0.07}
          perfectDrawEnabled={false}
        />
      ))}
      {regions.map((r) => (
        <Line
          key={`border-${r.id}`}
          points={r.polygon.flatMap((p) => [p.x, p.y])}
          closed
          stroke={rebellionPalette.board.systemStroke}
          strokeWidth={1.5}
          dash={[10, 8]}
          opacity={0.8}
          perfectDrawEnabled={false}
        />
      ))}
      {links.map((l) => (
        <Line
          key={`${l.a}|${l.b}`}
          points={[l.from.x, l.from.y, l.to.x, l.to.y]}
          stroke={rebellionPalette.board.link}
          strokeWidth={2}
          perfectDrawEnabled={false}
        />
      ))}
    </Layer>
  );
}

export const StaticMapLayer = memo(StaticMapLayerImpl);
