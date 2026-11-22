/**
 * Console breakpoints (SWR-009 K-1, plan §1.1, §4). MUI `theme.breakpoints` stay unchanged (they drive every page);
 * these widths only shape the game console. `mq.up(px)` / `mq.down(px)` give `@media` keys for `sx`.
 */
export const CONSOLE_WIDE = 1400;
/** = MUI `lg`. */
export const CONSOLE_FULL = 1200;
/** = MUI `md`. */
export const CONSOLE_SPLIT = 900;
/** Below: the Unit Manifest becomes a bottom sheet. */
export const MOBILE_SHEET = 760;

export const consoleBreakpoints = {
  wide: CONSOLE_WIDE,
  full: CONSOLE_FULL,
  split: CONSOLE_SPLIT,
  sheet: MOBILE_SHEET,
} as const;

/** Media-query keys (MUI convention: `down` excludes the boundary by 0.05 px). */
export const mq = {
  up: (px: number): string => `@media (min-width:${px}px)`,
  down: (px: number): string => `@media (max-width:${px - 0.05}px)`,
  between: (from: number, to: number): string =>
    `@media (min-width:${from}px) and (max-width:${to - 0.05}px)`,
} as const;
