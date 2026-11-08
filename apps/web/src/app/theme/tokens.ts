/**
 * Design tokens (docs/product/ux-decisions.md §7). Names are FROZEN (plan-frontend §8):
 * Platform tokens only (SWR-003 §6, D-V-5): game colours live in the game folder (`games/<id>/theme`).
 */
export const tokens = {
  background: { default: '#0B0F17', paper: '#131A26' },
  text: { primary: '#E6EAF2', secondary: '#9AA4B5' },
  primary: { main: '#2DD4BF' },
  mock: { main: '#C084FC' },
  focus: '#FFD166',
  shapeRadius: 6,
  fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
} as const;
