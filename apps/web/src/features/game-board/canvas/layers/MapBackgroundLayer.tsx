import { memo, useMemo } from 'react';
import { Layer, Rect, Shape } from 'react-konva';
import type { Bounds } from '../../model/geometry';

const STAR_COUNT = 260;
const GRID_STEP = 200;

/** Deterministic PRNG (mulberry32) so the star field is identical on every render. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MapBackgroundLayerProps {
  bounds: Bounds;
  background: string;
  star: string;
}

/** Decorative only: `listening={false}`, so clicks on the background reach the Stage (A-10). */
function MapBackgroundLayerImpl({ bounds, background, star }: MapBackgroundLayerProps) {
  const pad = 600;
  const area = {
    x: bounds.minX - pad,
    y: bounds.minY - pad,
    w: bounds.maxX - bounds.minX + pad * 2,
    h: bounds.maxY - bounds.minY + pad * 2,
  };
  const stars = useMemo(() => {
    const r = rng(1977);
    return Array.from({ length: STAR_COUNT }, () => ({
      x: area.x + r() * area.w,
      y: area.y + r() * area.h,
      s: 0.6 + r() * 1.4,
    }));
  }, [area.x, area.y, area.w, area.h]);

  return (
    <Layer listening={false}>
      <Rect x={area.x} y={area.y} width={area.w} height={area.h} fill={background} />
      <Shape
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          ctx.beginPath();
          for (
            let gx = Math.ceil(area.x / GRID_STEP) * GRID_STEP;
            gx < area.x + area.w;
            gx += GRID_STEP
          ) {
            ctx.moveTo(gx, area.y);
            ctx.lineTo(gx, area.y + area.h);
          }
          for (
            let gy = Math.ceil(area.y / GRID_STEP) * GRID_STEP;
            gy < area.y + area.h;
            gy += GRID_STEP
          ) {
            ctx.moveTo(area.x, gy);
            ctx.lineTo(area.x + area.w, gy);
          }
          ctx.strokeStyle = 'rgba(154,164,181,0.06)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = star;
          for (const s of stars) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
            ctx.fill();
          }
        }}
      />
    </Layer>
  );
}

export const MapBackgroundLayer = memo(MapBackgroundLayerImpl);
