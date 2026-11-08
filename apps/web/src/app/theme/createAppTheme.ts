import { createTheme, type Theme } from '@mui/material/styles';
import { tokens } from './tokens';

/**
 * D-A-5 focus ring. `outlineOffset` puts it on the surface around the control, so `tokens.focus` must contrast
 * ≥ 3:1 with the page backgrounds (`background.default` / `background.paper`) — unit-tested.
 */
export const FOCUS_RING = { outline: `2px solid ${tokens.focus}`, outlineOffset: 2 } as const;

export interface AppThemeOptions {
  reduceMotion: boolean;
}

/** Dark "tactical" theme (D-V-1..D-V-3); with `reduceMotion` all MUI transitions and ripples are off (D-A-9). */
export function createAppTheme({ reduceMotion }: AppThemeOptions): Theme {
  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: tokens.primary.main },
      background: { ...tokens.background },
      text: { ...tokens.text },
      mock: { ...tokens.mock },
      focus: tokens.focus,
    },
    shape: { borderRadius: tokens.shapeRadius },
    typography: {
      fontFamily: tokens.fontFamily,
      overline: { fontSize: 12, letterSpacing: '0.08em', fontWeight: 600 },
    },
    transitions: reduceMotion
      ? {
          create: () => 'none',
          duration: {
            shortest: 0,
            shorter: 0,
            short: 0,
            standard: 0,
            complex: 0,
            enteringScreen: 0,
            leavingScreen: 0,
          },
        }
      : undefined,
    components: {
      MuiButtonBase: {
        defaultProps: { disableRipple: reduceMotion },
        // ButtonBase resets `outline: 0` with class specificity, which beats the global `:focus-visible` rule below;
        // re-apply the D-A-5 ring to EVERY ButtonBase — radio cards, list rows and all buttons, contained included
        // (Analyst decision, SWR-004): same colour and offset everywhere, on top of MUI's own focus styles.
        // Two separate rules: a selector list containing an unsupported pseudo-class would drop both.
        styleOverrides: {
          root: { '&.Mui-focusVisible': FOCUS_RING, '&:focus-visible': FOCUS_RING },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          // D-A-5: visible focus ring, contrasting with both background and panels.
          ':focus-visible': FOCUS_RING,
          body: { fontVariantNumeric: 'tabular-nums' },
        },
      },
    },
  });
}
