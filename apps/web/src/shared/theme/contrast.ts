/**
 * WCAG 2.x relative luminance and contrast ratio of `#RRGGBB` colours (SWR-009 TC-TK-04/05). Pure helpers: the token
 * test checks `textPairs` with them, and any caller may check a pair it composes.
 */

function channel(hex: string, i: number): number {
  const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Relative luminance (0…1) of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  if (!HEX.test(hex)) throw new RangeError(`not a #RRGGBB colour: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio (1…21) of two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs below `min` (default 4.5:1, normal text). */
export function failingPairs<P extends { fg: string; bg: string }>(
  pairs: readonly P[],
  min = 4.5,
): Array<P & { ratio: number }> {
  return pairs
    .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
    .filter((p) => p.ratio < min);
}
