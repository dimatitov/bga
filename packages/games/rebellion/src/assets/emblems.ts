import { rebellionVisualTokens, type AssetFactionId } from './tokens';

/**
 * Original abstract faction emblems (SWR-004, ux-decisions §13.3 / D-SW4-5, plan-frontend §2.2).
 * Square SVG strings, viewBox `0 0 48 48`, geometry only: no text, scripts, external refs, fonts or raster
 * images (same rules as the cover). The map code "outlined vs filled" is kept:
 * - rebels: OUTLINED — a ring with two stacked rising chevrons (stroke only, `fill="none"`);
 * - empire: FILLED — a solid pointy-top hexagon cut by a horizontal slit (even-odd hole).
 * Deliberately unlike the rights holder's symbols (no bird/"starbird" silhouette, no cog/spoked wheel).
 * The consumer renders them as `<img src="data:image/svg+xml,…">`, so colours are baked in.
 */
const rebelsColor = rebellionVisualTokens.faction.rebels;
const empireColor = rebellionVisualTokens.faction.empire;

export const rebelsEmblemSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">',
  `<g fill="none" stroke="${rebelsColor}" stroke-linecap="round" stroke-linejoin="round">`,
  '<circle cx="24" cy="24" r="20" stroke-width="3"/>',
  '<path d="M14 26 L24 15 L34 26" stroke-width="3.5"/>',
  '<path d="M17 34 L24 26.5 L31 34" stroke-width="3.5"/>',
  '</g>',
  '</svg>',
].join('');

export const empireEmblemSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">',
  `<path fill="${empireColor}" fill-rule="evenodd" `,
  'd="M24 3 L42.2 13.5 L42.2 34.5 L24 45 L5.8 34.5 L5.8 13.5 Z M12 21.5 L36 21.5 L36 26.5 L12 26.5 Z"/>',
  '</svg>',
].join('');

/** Emblem SVG string per faction. */
export const factionEmblems: Readonly<Record<AssetFactionId, string>> = {
  rebels: rebelsEmblemSvg,
  empire: empireEmblemSvg,
};
