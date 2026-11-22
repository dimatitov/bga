import { alpha } from '@mui/material/styles';
import { terminalTokens } from '@/shared/theme';
import { rebellionPalette } from './palette';

const C = terminalTokens.color;
const B = rebellionPalette.board;
const F = rebellionPalette.faction;

/**
 * Styles of the vector map (SWR-009 plan §1.4, R-4): every colour of the map, derived ONLY from `terminalTokens` and
 * `rebellionVisualTokens` — Konva components and the map housing carry no hex literals. Created by F; owned by M
 * (Vector Map). Geometry (radii, dashes of the state marks) lives in `core-v1/geometry/systemMarks.ts`; here only the
 * colour of each mark tone and the plain stroke styles.
 */
export const mapStyle = {
  font: { family: terminalTokens.font.family, face: terminalTokens.font.face },
  /** CRT screen: map background, display frame, inner shadow, grid and scanlines (DOM layers). */
  screen: {
    background: B.background,
    crt: C.crt,
    border: C.route,
    shadow: alpha(C.page, 1),
  },
  grid: { color: alpha(C.grid, terminalTokens.alpha.grid), step: 78, width: 1 },
  /** Map housing (DOM): frame 4 px, display header, bottom bar. */
  housing: {
    frame: C.bezel,
    frameInset: C.bezelLight,
    background: C.case,
    header: C.panel,
    headerBorder: C.line,
    headerText: C.warm,
    metaText: C.muted,
    accentText: C.amberText,
    bar: C.panel,
  },
  region: {
    stroke: C.region,
    dash: [5, 5],
    width: 1.5,
    fill: null,
    label: C.warm,
    labelOpacity: 0.8,
  },
  route: { stroke: B.link, width: 1.2 },
  node: { fill: C.node, stroke: B.systemStroke, strokeWidth: 1.7, hit: 'transparent' },
  label: { color: B.label, target: B.legalTarget, selected: C.amber, halo: B.background },
  /** Colour of every state-mark tone (`systemMarks`); `side` is resolved to the activating faction. */
  tone: {
    remote: C.warm,
    target: B.legalTarget,
    source: C.phosphor,
    selected: B.selected,
    contested: C.amber,
    base: F.rebels,
    ai: F.empire,
    aiText: C.redText,
    dropLegal: B.legalTarget,
    dropIllegal: B.invalidTarget,
  },
  /** «source → activated» arrow and the pending-move ring. */
  move: { stroke: C.phosphor, dash: [8, 6], width: 2 },
  ghost: { stroke: C.warm, dash: [4, 3] },
  marker: {
    background: terminalTokens.marker.bg,
    border: { empire: F.empire, rebels: F.rebels },
    selected: B.selected,
    text: C.paper,
    fontWeight: 'bold',
  },
  /** Single-unit move handle: glyph without a number, phosphor dashed ring. */
  handle: { ring: C.phosphor, dash: [3, 3], plate: C.plate },
  leader: { stroke: C.amber, activating: C.amber, selected: B.selected },
  zone: {
    stroke: C.region,
    activated: F.rebels,
    selected: B.selected,
    dash: [14, 10],
    fill: alpha(C.plate, 0.6),
    title: C.warm,
  },
  faction: F,
} as const;

export type MapStyle = typeof mapStyle;
