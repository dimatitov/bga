/**
 * Visual layout of the MOCK map (world units). Kept apart from GameState and from the scenario:
 * `./board` must not import `../scenario` or any other subpath (ESLint-enforced), so the web bundle
 * never receives scenario data such as the rebel base location.
 */
export interface MapPoint {
  x: number;
  y: number;
}

export type MapLayout = Record<string, MapPoint>;

export const MAP_BOUNDS = { width: 1600, height: 1000 } as const;

export const mapLayout: MapLayout = {
  'sys-aurelis': { x: 300, y: 250 },
  'sys-brevora': { x: 550, y: 180 },
  'sys-cindral': { x: 450, y: 450 },
  'sys-dovmaren': { x: 800, y: 300 },
  'sys-eskara': { x: 750, y: 550 },
  'sys-fennix': { x: 1000, y: 150 },
  'sys-galdor': { x: 1100, y: 450 },
  'sys-hollin': { x: 1050, y: 750 },
  'sys-iskra': { x: 1350, y: 300 },
  'sys-jorvan': { x: 1350, y: 650 },
};
