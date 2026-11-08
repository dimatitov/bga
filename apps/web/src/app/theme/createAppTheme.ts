import { createTheme, type Theme } from '@mui/material/styles';
import { tokens } from './tokens';

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
      faction: { ...tokens.faction },
      board: { ...tokens.board },
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
      MuiButtonBase: { defaultProps: { disableRipple: reduceMotion } },
      MuiCssBaseline: {
        styleOverrides: {
          // D-A-5: visible focus ring, contrasting with both background and panels.
          ':focus-visible': { outline: `2px solid ${tokens.focus}`, outlineOffset: 2 },
          body: { fontVariantNumeric: 'tabular-nums' },
        },
      },
    },
  });
}
