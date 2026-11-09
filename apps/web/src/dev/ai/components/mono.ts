/**
 * Monospace stack for data slots (ids, types, providers). Every named face covers Cyrillic, so a mixed string never
 * falls back to the browser's serif default (D-3). Bare generic `monospace` is only the last resort.
 */
export const MONO_FONT_FAMILY =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace';

export const monoSx = { fontFamily: MONO_FONT_FAMILY, overflowWrap: 'anywhere' } as const;
