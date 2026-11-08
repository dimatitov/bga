/**
 * Visual layout of the base-game map used by the `core-v1` table (SWR-005 plan-frontend §1, §4). World units.
 *
 * - Own schematic geometry: the RELATIVE placement of systems and regions follows the real board (regions in a
 *   3-2-3 arrangement, remote systems on the rims), but no coordinates were traced from rights-holder art.
 * - Web-safe: `./board` must not import `../scenario` or `../schema` (ESLint B-3), so keys are plain strings.
 *   `test/board/core-layout.test.ts` asserts that the keys are exactly `CORE_SYSTEM_IDS` / `CORE_REGION_IDS`
 *   (and type-checks them against `CoreSystemId` / `CoreRegionId`) and that every centre lies inside the polygon
 *   of its region (membership from the scenario data, read only by the test).
 * - Region labels are unofficial («<system> region», reference §1.2); the text comes from i18n, not from here.
 */
import type { MapPoint } from './layout';

/** World rectangle of the galaxy (all region polygons tile it). */
export const CORE_MAP_BOUNDS = { width: 1600, height: 1200 } as const;

/** System centres, keyed by `CoreSystemId`. Grouped by region (r1…r8). */
export const coreMapLayout: Readonly<Record<string, MapPoint>> = Object.freeze({
  // r1 — Mon Calamari region (top left)
  'mon-calamari': { x: 300, y: 90 },
  saleucami: { x: 470, y: 210 },
  yavin: { x: 110, y: 250 },
  felucia: { x: 330, y: 370 },
  // r2 — Nal Hutta region (top centre)
  kessel: { x: 660, y: 90 },
  'nal-hutta': { x: 910, y: 110 },
  toydaria: { x: 690, y: 340 },
  bothawui: { x: 930, y: 330 },
  // r3 — Rodia region (top right)
  tatooine: { x: 1180, y: 100 },
  ryloth: { x: 1460, y: 120 },
  rodia: { x: 1170, y: 320 },
  geonosis: { x: 1430, y: 330 },
  // r7 — Kashyyyk region (centre left)
  dathomir: { x: 110, y: 560 },
  mandalore: { x: 350, y: 550 },
  kashyyyk: { x: 600, y: 540 },
  malastare: { x: 850, y: 550 },
  // r4 — Utapau region (centre right)
  naboo: { x: 1150, y: 530 },
  utapau: { x: 1450, y: 540 },
  sullust: { x: 1130, y: 720 },
  dagobah: { x: 1400, y: 700 },
  // r8 — Mygeeto region (bottom left)
  dantooine: { x: 100, y: 850 },
  mygeeto: { x: 330, y: 860 },
  'ord-mantell': { x: 420, y: 1080 },
  ilum: { x: 150, y: 1080 },
  // r6 — Coruscant region (bottom centre)
  alderaan: { x: 640, y: 850 },
  'cato-neimoidia': { x: 930, y: 970 },
  coruscant: { x: 690, y: 1090 },
  corellia: { x: 990, y: 1150 },
  // r5 — Mustafar region (bottom right)
  bespin: { x: 1190, y: 900 },
  mustafar: { x: 1450, y: 880 },
  endor: { x: 1230, y: 1150 },
  hoth: { x: 1470, y: 1090 },
});

export interface CoreRegionShape {
  /** Closed polygon (world units, clockwise). Polygons of different regions share edges and never overlap. */
  readonly polygon: readonly MapPoint[];
  /** Top-left anchor of the region label. */
  readonly label: MapPoint;
}

/** Region outlines, keyed by `CoreRegionId`. Together they tile `CORE_MAP_BOUNDS`. */
export const coreRegionShapes: Readonly<Record<string, CoreRegionShape>> = Object.freeze({
  r1: {
    polygon: [
      { x: 0, y: 0 },
      { x: 560, y: 0 },
      { x: 560, y: 430 },
      { x: 0, y: 450 },
    ],
    label: { x: 16, y: 14 },
  },
  r2: {
    polygon: [
      { x: 560, y: 0 },
      { x: 1040, y: 0 },
      { x: 1040, y: 410 },
      { x: 560, y: 430 },
    ],
    label: { x: 750, y: 14 },
  },
  r3: {
    polygon: [
      { x: 1040, y: 0 },
      { x: 1600, y: 0 },
      { x: 1600, y: 420 },
      { x: 1040, y: 410 },
    ],
    label: { x: 1260, y: 14 },
  },
  r7: {
    polygon: [
      { x: 0, y: 450 },
      { x: 560, y: 430 },
      { x: 1040, y: 410 },
      { x: 1000, y: 780 },
      { x: 520, y: 770 },
      { x: 0, y: 740 },
    ],
    label: { x: 16, y: 462 },
  },
  r4: {
    polygon: [
      { x: 1040, y: 410 },
      { x: 1600, y: 420 },
      { x: 1600, y: 800 },
      { x: 1060, y: 820 },
      { x: 1000, y: 780 },
    ],
    label: { x: 1250, y: 432 },
  },
  r8: {
    polygon: [
      { x: 0, y: 740 },
      { x: 520, y: 770 },
      { x: 520, y: 1200 },
      { x: 0, y: 1200 },
    ],
    label: { x: 16, y: 752 },
  },
  r6: {
    polygon: [
      { x: 520, y: 770 },
      { x: 1000, y: 780 },
      { x: 1060, y: 820 },
      { x: 1060, y: 1200 },
      { x: 520, y: 1200 },
    ],
    label: { x: 540, y: 790 },
  },
  r5: {
    polygon: [
      { x: 1060, y: 820 },
      { x: 1600, y: 800 },
      { x: 1600, y: 1200 },
      { x: 1060, y: 1200 },
    ],
    label: { x: 1250, y: 830 },
  },
});

/**
 * Where the Empire sees the Rebel units/leaders of the hidden base («Rebel base — location unknown», AM-BE-7):
 * a frame OUTSIDE the galaxy (below it, on the right), never at a system. Drawn only when the server hides the base.
 */
export const HIDDEN_BASE_ZONE_RECT = Object.freeze({ x: 1000, y: 1250, width: 600, height: 190 });
