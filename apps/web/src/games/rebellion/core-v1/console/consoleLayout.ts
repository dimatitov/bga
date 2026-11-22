import { CONSOLE_FULL, CONSOLE_SPLIT, CONSOLE_WIDE, MOBILE_SHEET, mq } from '@/shared/theme';

/**
 * Game Console grid of the `core-v1` table (SWR-009 plan §4). DOM order = Tab order: header → status bar → map
 * housing → rail → footer; the grid areas only place them.
 *
 * | mode     | width      | grid                                           | height / scroll                       |
 * |----------|------------|------------------------------------------------|---------------------------------------|
 * | `wide`   | ≥ 1400     | padding 18, map + rail 530                     | `100dvh`, no page scroll              |
 * | `full`   | 1200–1399  | padding 18, map + rail 440                     | `100dvh`, no page scroll              |
 * | `split`  | 900–1199   | padding 10, map + rail 340 (status in 2 rows)  | `100dvh`, no page scroll              |
 * | `stack`  | 760–899    | padding 10, one column                         | vertical page scroll, no horizontal   |
 * | `mobile` | < 760      | padding 7, one column (manifest = bottom sheet) | vertical page scroll, no horizontal   |
 */
export type ConsoleMode = 'wide' | 'full' | 'split' | 'stack' | 'mobile';

export interface ConsoleLayout {
  mode: ConsoleMode;
  /** Lower bound of the mode (px, inclusive). */
  minWidth: number;
  padding: number;
  gap: number;
  /** `grid-template-areas` rows. */
  areas: readonly string[];
  rows: string;
  columns: string;
  /** Rail column width (px) or `null` in one column. */
  railWidth: number | null;
  /** `true` → the console is exactly one viewport high and the page does not scroll. */
  fitsViewport: boolean;
}

const GAP = 7;
const TWO_COLUMN_AREAS = ['header header', 'status status', 'board side', 'footer footer'] as const;
const ONE_COLUMN_AREAS = ['header', 'status', 'board', 'side', 'footer'] as const;
const TWO_COLUMN_ROWS = 'auto auto minmax(0, 1fr) auto';
const ONE_COLUMN_ROWS = 'auto auto auto auto auto';

function twoColumn(mode: ConsoleMode, minWidth: number, padding: number, rail: number) {
  return {
    mode,
    minWidth,
    padding,
    gap: GAP,
    areas: TWO_COLUMN_AREAS,
    rows: TWO_COLUMN_ROWS,
    columns: `minmax(0, 1fr) ${rail}px`,
    railWidth: rail,
    fitsViewport: true,
  } as const satisfies ConsoleLayout;
}

function oneColumn(mode: ConsoleMode, minWidth: number, padding: number) {
  return {
    mode,
    minWidth,
    padding,
    gap: GAP,
    areas: ONE_COLUMN_AREAS,
    rows: ONE_COLUMN_ROWS,
    columns: 'minmax(0, 1fr)',
    railWidth: null,
    fitsViewport: false,
  } as const satisfies ConsoleLayout;
}

/** From the widest mode down. */
export const CONSOLE_LAYOUTS: readonly ConsoleLayout[] = [
  twoColumn('wide', CONSOLE_WIDE, 18, 530),
  twoColumn('full', CONSOLE_FULL, 18, 440),
  twoColumn('split', CONSOLE_SPLIT, 10, 340),
  oneColumn('stack', MOBILE_SHEET, 10),
  oneColumn('mobile', 0, 7),
];

/** Layout for a viewport width (px). */
export function consoleLayout(width: number): ConsoleLayout {
  return CONSOLE_LAYOUTS.find((l) => width >= l.minWidth) ?? CONSOLE_LAYOUTS.at(-1)!;
}

function areasCss(areas: readonly string[]): string {
  return areas.map((row) => `"${row}"`).join(' ');
}

type CssObject = Record<string, string | number>;
/** Plain style object (base values + one nested object per `@media` key), spreadable into `sx`. */
export type ConsoleGridStyle = Record<string, string | number | CssObject>;

function gridStyle(l: ConsoleLayout): CssObject {
  return {
    padding: `${l.padding}px`,
    gap: `${l.gap}px`,
    gridTemplateAreas: areasCss(l.areas),
    gridTemplateRows: l.rows,
    gridTemplateColumns: l.columns,
    ...(l.fitsViewport
      ? { height: '100dvh', minHeight: 0, overflow: 'hidden' }
      : { height: 'auto', minHeight: '100dvh', overflow: 'visible' }),
  };
}

/** Upper bound (exclusive) of a mode: the next wider mode's `minWidth`, `null` for the widest. */
function upperBound(l: ConsoleLayout): number | null {
  const i = CONSOLE_LAYOUTS.indexOf(l);
  return i > 0 ? CONSOLE_LAYOUTS[i - 1]!.minWidth : null;
}

/** Media query key of a mode: a closed range `[minWidth, next)`, or `min-width` for the widest. */
export function consoleMediaKey(l: ConsoleLayout): string {
  const to = upperBound(l);
  return to === null ? mq.up(l.minWidth) : mq.between(l.minWidth, to);
}

/**
 * `sx` of the console root: the smallest mode as the base, then every wider mode under its OWN width RANGE, keys
 * inserted in ascending order (760 → 900 → 1200 → 1400).
 *
 * Fix round 2 (C2 defect, 1280×800 rendered one column): MUI's `sx` pre-creates the theme breakpoint media keys
 * (`min-width` 0/600/900/1200/1536) in its own order and merges ours into them, so plain `min-width` keys that
 * coincide with theme breakpoints (900, 1200) were emitted BEFORE the non-theme ones (760, 1400) — the 760 rule
 * then won at 1280. With disjoint ranges exactly one query matches any width, so the emitted order cannot matter.
 */
export function consoleGridSx(): ConsoleGridStyle {
  const [base, ...wider] = [...CONSOLE_LAYOUTS].reverse();
  const sx: ConsoleGridStyle = {
    display: 'grid',
    position: 'relative',
    ...gridStyle(base!),
  };
  for (const l of wider) sx[consoleMediaKey(l)] = gridStyle(l);
  return sx;
}

/** Grid area names used by the console parts. */
export const CONSOLE_AREA = {
  header: 'header',
  status: 'status',
  board: 'board',
  side: 'side',
  footer: 'footer',
} as const;
