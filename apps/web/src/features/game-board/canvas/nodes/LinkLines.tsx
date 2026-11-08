import type { System } from '@swr/contracts';
import type { MapPoint } from '@swr/game-data/layout';
import { memo, useMemo } from 'react';
import { Group, Line } from 'react-konva';

export interface LinkLinesProps {
  systems: readonly Pick<System, 'id' | 'adjacentSystemIds'>[];
  centers: ReadonlyMap<string, MapPoint>;
  /** Source system of the selected/dragged piece and its server-provided targets (highlighted lines). */
  fromSystemId: string | null;
  targetIds: readonly string[];
  color: string;
  highlightColor: string;
}

/**
 * Adjacency lines. `adjacentSystemIds` is used ONLY to draw these lines (plan-frontend §0.2, TC-ARCH-05);
 * which lines are highlighted is decided by `targetIds` (from legalActions).
 */
function LinkLinesImpl({
  systems,
  centers,
  fromSystemId,
  targetIds,
  color,
  highlightColor,
}: LinkLinesProps) {
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; a: string; b: string }[] = [];
    for (const s of systems) {
      for (const n of s.adjacentSystemIds) {
        const key = s.id < n ? `${s.id}|${n}` : `${n}|${s.id}`;
        if (seen.has(key) || !centers.has(s.id) || !centers.has(n)) continue;
        seen.add(key);
        out.push({ key, a: s.id, b: n });
      }
    }
    return out;
  }, [systems, centers]);

  return (
    <Group listening={false}>
      {pairs.map(({ key, a, b }) => {
        const pa = centers.get(a)!;
        const pb = centers.get(b)!;
        const hot =
          fromSystemId !== null &&
          ((a === fromSystemId && targetIds.includes(b)) ||
            (b === fromSystemId && targetIds.includes(a)));
        return (
          <Line
            key={key}
            points={[pa.x, pa.y, pb.x, pb.y]}
            stroke={hot ? highlightColor : color}
            strokeWidth={hot ? 3 : 2}
            dash={hot ? [10, 6] : undefined}
            perfectDrawEnabled={false}
          />
        );
      })}
    </Group>
  );
}

export const LinkLines = memo(LinkLinesImpl);
