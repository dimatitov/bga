/**
 * Design tokens (docs/product/ux-decisions.md §7). Names are FROZEN (plan-frontend §8):
 * FE-TABLE reads them for Konva colours via `useTheme().palette.*` or directly from here.
 */
export const tokens = {
  background: { default: '#0B0F17', paper: '#131A26' },
  text: { primary: '#E6EAF2', secondary: '#9AA4B5' },
  primary: { main: '#2DD4BF' },
  faction: { empire: '#7C9CFF', rebellion: '#F5A524' },
  board: {
    background: '#070A10',
    star: 'rgba(230,234,242,0.25)',
    link: 'rgba(154,164,181,0.45)',
    systemFill: '#1C2536',
    systemStroke: '#5B6B85',
    label: '#C9D1DE',
    selected: '#FFFFFF',
    legalTarget: '#2DD4BF',
    invalidTarget: '#F87171',
  },
  mock: { main: '#C084FC' },
  focus: '#FFD166',
  shapeRadius: 6,
  fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
} as const;

export type FactionPalette = { empire: string; rebellion: string };
export type BoardPalette = { [K in keyof typeof tokens.board]: string };
