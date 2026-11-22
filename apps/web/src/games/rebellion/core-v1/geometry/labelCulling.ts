/**
 * Collision culling of the map captions below the detail threshold (SWR-009 fix round 1, AC-13): at fit zoom on small
 * screens system labels, region captions and counter plates pile up. Counter markers are data and always stay; a
 * caption is drawn only when it does not overlap an obstacle (counter plates and nodes of other systems) or an
 * already kept caption. Priority: selected → activated → legal target → move source → recent AI → base → the rest
 * in map order; region captions last. On narrow consoles a caption that would leave the canvas is culled as well. Hidden names stay available in the «Objects» list and the inspector. Pure; in the detail LOD nothing is culled.
 */
import type { Viewport } from '../../board/model/geometry';
import {
  type LabelBox,
  type Rect,
  rectInside,
  rectsOverlap,
  regionLabelRect,
  systemLabelRect,
} from './labelLayout';
import { NODE_RADIUS_PX } from './constants';
import { type Lod, labelScreenFactor, lodFor } from './lod';
import { markerScreenRect } from './markerLayout';
import type { Scene, SystemScene } from './sceneModel';

/** Tolerance (px) of a caption touching another caption or a plate. */
export const CULL_TOLERANCE_PX = 2;
/** Margin (px) inside the canvas edge for the edge check (half the 16 px translation step of the caller). */
export const CULL_EDGE_MARGIN_PX = 8;

export interface CulledLabels {
  /** System ids whose label is drawn. */
  systems: ReadonlySet<string>;
  /** Region ids whose caption is drawn. */
  regions: ReadonlySet<string>;
}

function priority(s: SystemScene): number {
  if (s.selected) return 0;
  if (s.activatedBy !== null) return 1;
  if (s.target) return 2;
  if (s.source) return 3;
  if (s.aiRecent !== null) return 4;
  if (s.isBase) return 5;
  return 6;
}

export interface CullInput {
  scene: Pick<Scene, 'systems' | 'regions' | 'markers' | 'zone'>;
  labelBoxes: ReadonlyMap<string, LabelBox>;
  regionLabels: ReadonlyMap<string, LabelBox>;
  /** World scale of the viewport (translation does not matter: everything moves together). */
  scale: number;
  /** Override of the LOD (defaults to `lodFor(scale)`). */
  lod?: Lod;
  /**
   * Narrow consoles (fix round 3): the canvas and the viewport translation — a caption that does not fit inside the
   * canvas is culled too. Absent = no edge check (translation-free).
   */
  stage?: { x: number; y: number; width: number; height: number } | null;
}

export function cullLabels({
  scene,
  labelBoxes,
  regionLabels,
  scale,
  lod = lodFor(scale),
  stage = null,
}: CullInput): CulledLabels {
  const all = {
    systems: new Set(scene.systems.filter((s) => labelBoxes.has(s.id)).map((s) => s.id)),
    regions: new Set(scene.regions.filter((r) => regionLabels.has(r.id)).map((r) => r.id)),
  };
  if (lod === 'detail') return all;

  const vp: Viewport = { scale, x: stage?.x ?? 0, y: stage?.y ?? 0 };
  // the translation is quantised by the caller (16 px): keep a half-step margin so a kept caption is really inside
  const edge = CULL_EDGE_MARGIN_PX;
  const canvas: Rect | null = stage
    ? { x: edge, y: edge, width: stage.width - 2 * edge, height: stage.height - 2 * edge }
    : null;
  const k = labelScreenFactor(scale);
  const node = NODE_RADIUS_PX + 1;
  const markers = [
    ...[...scene.markers, ...(scene.zone?.markers ?? [])].map((m) => ({
      systemId: m.systemId,
      rect: markerScreenRect(m.anchor, m.box, vp),
    })),
    // the screen-constant nodes are obstacles too (a caption must not cover another system)
    ...scene.systems.map((s) => ({
      systemId: s.id as string | null,
      rect: {
        x: s.center.x * scale + vp.x - node * k,
        y: s.center.y * scale + vp.y - node * k,
        width: node * 2 * k,
        height: node * 2 * k,
      },
    })),
  ];
  const kept: Rect[] = [];
  const free = (r: Rect, ownSystem: string | null) =>
    (canvas === null || rectInside(r, canvas)) &&
    !kept.some((other) => rectsOverlap(r, other, CULL_TOLERANCE_PX)) &&
    !markers.some(
      (m) =>
        (ownSystem === null || m.systemId !== ownSystem) &&
        rectsOverlap(r, m.rect, CULL_TOLERANCE_PX),
    );

  const systems = new Set<string>();
  const ordered = scene.systems
    .map((s, i) => ({ s, i }))
    .sort((a, b) => priority(a.s) - priority(b.s) || a.i - b.i);
  for (const { s } of ordered) {
    const box = labelBoxes.get(s.id);
    if (!box) continue;
    const r = systemLabelRect(s.center, box, vp);
    // a system with a mark (selected / activated / target) keeps its label unless it is off the canvas
    if ((priority(s) <= 2 && (canvas === null || rectInside(r, canvas))) || free(r, s.id)) {
      systems.add(s.id);
      kept.push(r);
    }
  }
  const regions = new Set<string>();
  for (const reg of scene.regions) {
    const box = regionLabels.get(reg.id);
    if (!box) continue;
    const r = regionLabelRect(reg.label, box, vp);
    if (free(r, null)) {
      regions.add(reg.id);
      kept.push(r);
    }
  }
  return { systems, regions };
}
