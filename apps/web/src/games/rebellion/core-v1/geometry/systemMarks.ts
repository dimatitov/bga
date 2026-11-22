/**
 * State marks of a system on the vector map (SWR-009 AC-5, R-2/R-3, plan §2 M item 3). A pure function of the scene
 * system → the list of marks to draw. Every mark differs from every other one by GEOMETRY — ring radius, dash
 * pattern, stroke width or an extra glyph — so no state is told by colour alone; the colour is only a `tone`, resolved
 * by the Konva node through `mapStyle`. Sizes are screen px (the node is screen-constant).
 */
import type { SystemScene } from './sceneModel';

export type MarkKind =
  | 'remote'
  | 'target'
  | 'source'
  | 'activated'
  | 'selected'
  | 'contested'
  | 'base'
  | 'aiRecent'
  | 'dropLegal'
  | 'dropIllegal';

/** Extra glyph of a mark (drawn next to / across the node). */
export type MarkGlyph =
  'none' | 'notch' | 'chevron' | 'flag' | 'crosshair' | 'cross' | 'home' | 'dot' | 'xmark';

/** Colour role of a mark, resolved by the renderer (`mapStyle`). `side` = colour of the activating side. */
export type MarkTone =
  | 'remote'
  | 'target'
  | 'source'
  | 'side'
  | 'selected'
  | 'contested'
  | 'base'
  | 'ai'
  | 'dropLegal'
  | 'dropIllegal';

export interface MarkRing {
  radius: number;
  /** `null` = solid. */
  dash: readonly number[] | null;
  width: number;
}

export interface Mark {
  kind: MarkKind;
  /** Main ring around the node (`null` = no ring). */
  ring: MarkRing | null;
  /** Second ring (selection: solid + dashed outer ring). */
  outer: MarkRing | null;
  glyph: MarkGlyph;
  /** Dash of the node outline itself (remote systems). */
  nodeDash: readonly number[] | null;
  tone: MarkTone;
  /** «AI · 01» — order of first appearance in the last AI run (1-based), only for `aiRecent`. */
  order?: number;
}

const ring = (radius: number, width: number, dash: readonly number[] | null = null): MarkRing => ({
  radius,
  width,
  dash,
});

/** One descriptor per kind (radii follow the Console prototype: selection r 17 + r 23, AI r 14). */
export const MARK_SPECS: Readonly<Record<MarkKind, Omit<Mark, 'order'>>> = {
  remote: {
    kind: 'remote',
    ring: null,
    outer: null,
    glyph: 'notch',
    nodeDash: [2, 2],
    tone: 'remote',
  },
  activated: {
    kind: 'activated',
    ring: ring(10, 2.5),
    outer: null,
    glyph: 'flag',
    nodeDash: null,
    tone: 'side',
  },
  target: {
    kind: 'target',
    ring: ring(12, 1.5, [3, 4]),
    outer: null,
    glyph: 'none',
    nodeDash: null,
    tone: 'target',
  },
  aiRecent: {
    kind: 'aiRecent',
    ring: ring(14, 1.5, [4, 4]),
    outer: null,
    glyph: 'dot',
    nodeDash: null,
    tone: 'ai',
  },
  selected: {
    kind: 'selected',
    ring: ring(17, 2),
    outer: ring(23, 1.5, [3, 4]),
    glyph: 'crosshair',
    nodeDash: null,
    tone: 'selected',
  },
  source: {
    kind: 'source',
    ring: ring(27, 1.5, [2, 3]),
    outer: null,
    glyph: 'chevron',
    nodeDash: null,
    tone: 'source',
  },
  dropLegal: {
    kind: 'dropLegal',
    ring: ring(31, 4),
    outer: null,
    glyph: 'none',
    nodeDash: null,
    tone: 'dropLegal',
  },
  dropIllegal: {
    kind: 'dropIllegal',
    ring: ring(31, 3, [2, 2]),
    outer: null,
    glyph: 'xmark',
    nodeDash: null,
    tone: 'dropIllegal',
  },
  contested: {
    kind: 'contested',
    ring: null,
    outer: null,
    glyph: 'cross',
    nodeDash: null,
    tone: 'contested',
  },
  base: {
    kind: 'base',
    ring: null,
    outer: null,
    glyph: 'home',
    nodeDash: null,
    tone: 'base',
  },
};

/** Drawing order: inner rings first, glyph-only marks last. */
const ORDER: readonly MarkKind[] = [
  'remote',
  'activated',
  'target',
  'aiRecent',
  'selected',
  'source',
  'dropLegal',
  'dropIllegal',
  'contested',
  'base',
];

/** The marks of one system, in drawing order. */
export function systemMarks(s: SystemScene): Mark[] {
  const on: Record<MarkKind, boolean> = {
    remote: s.remote,
    activated: s.activatedBy !== null,
    target: s.target,
    aiRecent: s.aiRecent !== null,
    selected: s.selected,
    source: s.source,
    dropLegal: s.dropTarget,
    dropIllegal: s.dropIllegal,
    contested: s.contested,
    base: s.isBase,
  };
  return ORDER.filter((k) => on[k]).map((k) =>
    k === 'aiRecent' ? { ...MARK_SPECS[k], order: s.aiRecent ?? undefined } : { ...MARK_SPECS[k] },
  );
}

/** Colour-free signature of a mark (what must differ between any two kinds). */
export function markShapeSignature(m: Omit<Mark, 'order'>): string {
  const r = (x: MarkRing | null) =>
    x ? `${x.radius}/${x.width}/${x.dash?.join('-') ?? 'solid'}` : '-';
  return `${r(m.ring)}|${r(m.outer)}|${m.glyph}|${m.nodeDash?.join('-') ?? '-'}`;
}
