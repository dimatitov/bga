/**
 * Screen-constant nodes (labels, captions, compact chips; SWR-005 plan-frontend §4 «Подписи»). They live in the
 * world-scaled stage and are counter-scaled imperatively on every viewport change (no React re-render on zoom).
 */
import type Konva from 'konva';
import { screenFixedScale } from '../geometry/lod';

/** Konva `name` of every screen-constant node. */
export const SCREEN_FIXED = 'screen-fixed';

export function applyScreenScale(stage: Konva.Stage | null, scale: number): void {
  if (!stage) return;
  const s = screenFixedScale(scale);
  stage.find(`.${SCREEN_FIXED}`).forEach((n) => n.scale({ x: s, y: s }));
}
