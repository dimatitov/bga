import { alpha, createTheme, type Theme } from '@mui/material/styles';
import { terminalTokens } from '@/shared/theme';
import { tokens } from './tokens';

/**
 * D-A-5 focus ring. `outlineOffset` puts it on the surface around the control, so `tokens.focus` (amber since SWR-009)
 * must contrast ≥ 3:1 with the surfaces it is drawn on (page / module / case / crt) — unit-tested.
 */
export const FOCUS_RING = { outline: `2px solid ${tokens.focus}`, outlineOffset: 2 } as const;

export interface AppThemeOptions {
  reduceMotion: boolean;
}

const T = terminalTokens;
const C = T.color;
const K = T.key;

const px = (n: number) => `${n}px`;
const typo = (s: { size: number; lineHeight: number; weight: number }) => ({
  fontSize: px(s.size),
  lineHeight: px(s.lineHeight),
  fontWeight: s.weight,
});

/** Kills animations and transitions (LED blink, MUI transitions) — `prefers-reduced-motion` or the app setting. */
const NO_MOTION = {
  '*, *::before, *::after': {
    animation: 'none !important',
    transition: 'none !important',
    scrollBehavior: 'auto !important',
  },
} as const;

/** Uppercase key label (UI Kit `.button`: 700 11px, .03em). */
const KEY_LABEL = {
  ...typo(T.type.key),
  letterSpacing: T.letterSpacing.key,
  textTransform: 'uppercase',
  fontFamily: T.font.family,
} as const;

/** The default hardware key (bg, border, bevel, hover, pressed). `pressShift` — 1px shift unless reduced motion. */
function defaultKey(pressShift: boolean) {
  return {
    backgroundColor: K.default.bg,
    border: `1px solid ${K.default.border}`,
    color: K.default.text,
    boxShadow: `inset 0 1px ${K.default.bevel}`,
    '&:hover': { backgroundColor: K.hover.bg, borderColor: K.hover.border },
    '&:active': {
      backgroundColor: K.pressed.bg,
      boxShadow: K.pressed.shadow,
      transform: pressShift ? 'translateY(1px)' : 'none',
    },
  } as const;
}

/** A coloured key variant (primary / warning / danger). */
function toneKey(tone: { bg: string; border: string; text: string; hoverBg: string }) {
  return {
    backgroundColor: tone.bg,
    border: `1px solid ${tone.border}`,
    color: tone.text,
    boxShadow: 'none',
    '&:hover': { backgroundColor: tone.hoverBg, borderColor: tone.border, boxShadow: 'none' },
  } as const;
}

/** Selected key: `aria-pressed` / `aria-checked` / `.Mui-selected` → amber 2px. */
const SELECTED_KEY = {
  backgroundColor: K.selected.bg,
  border: `2px solid ${K.selected.border}`,
  color: K.selected.text,
  '&:hover': { backgroundColor: K.selected.bg, borderColor: K.selected.border },
} as const;

const DISABLED_KEY = {
  backgroundColor: K.disabled.bg,
  borderColor: K.disabled.border,
  color: K.disabled.text,
  boxShadow: 'none',
  opacity: K.disabled.opacity,
  transform: 'none',
} as const;

const SELECTED_STATES = '&[aria-pressed="true"], &[aria-checked="true"], &.Mui-selected';

/**
 * Galactic Vector Terminal theme (SWR-009 K-2, plan §1.2): palette, PT Mono, type scale 28/19/14/22/11, radius 1, and
 * overrides of every MUI control the app uses — all values from `terminalTokens`. With `reduceMotion` all MUI
 * transitions/ripples and CSS animations are off (D-A-9); `prefers-reduced-motion: reduce` turns CSS motion off too.
 */
export function createAppTheme({ reduceMotion }: AppThemeOptions): Theme {
  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: tokens.primary.main },
      success: { main: C.phosphor },
      warning: { main: C.amber },
      error: { main: C.red, light: C.redText },
      info: { main: C.signal, light: C.phosphorText },
      background: { ...tokens.background },
      text: { ...tokens.text, disabled: C.disabledText },
      divider: C.bezel,
      mock: { ...tokens.mock },
      focus: tokens.focus,
      terminal: C,
    },
    shape: { borderRadius: tokens.shapeRadius },
    typography: {
      fontFamily: tokens.fontFamily,
      h1: typo(T.type.display),
      h2: typo(T.type.title),
      h3: typo(T.type.subtitle),
      body1: typo(T.type.body),
      body2: typo(T.type.small),
      overline: {
        ...typo(T.type.meta),
        letterSpacing: T.letterSpacing.meta,
        textTransform: 'uppercase',
      },
      metric: { ...typo(T.type.metric), color: C.phosphor, fontFamily: tokens.fontFamily },
      meta: {
        ...typo(T.type.meta),
        letterSpacing: T.letterSpacing.meta,
        textTransform: 'uppercase',
        color: C.muted,
        fontFamily: tokens.fontFamily,
      },
      button: KEY_LABEL,
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
          html: { colorScheme: 'dark' },
          body: {
            fontVariantNumeric: 'tabular-nums',
            backgroundColor: C.page,
            color: C.paper,
            scrollbarColor: `${C.bezelLight} ${C.case}`,
          },
          '::selection': { backgroundColor: K.selected.bg, color: C.amberText },
          '@media (prefers-reduced-motion: reduce)': NO_MOTION,
          ...(reduceMotion ? NO_MOTION : {}),
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none', borderRadius: T.radius },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          // Variant looks go through `variants` (one-class specificity), so a caller's `sx` still wins; selected and
          // disabled states are stronger on purpose.
          root: {
            ...KEY_LABEL,
            borderRadius: T.radius,
            whiteSpace: 'normal',
            '@media (pointer: coarse)': { minHeight: K.touchMinHeight },
            variants: [
              {
                props: { variant: 'outlined' },
                style: {
                  minHeight: K.minHeight,
                  padding: '8px 12px',
                  ...defaultKey(!reduceMotion),
                },
              },
              {
                props: { variant: 'contained' },
                style: {
                  minHeight: K.minHeight,
                  padding: '8px 12px',
                  ...defaultKey(!reduceMotion),
                },
              },
              { props: { variant: 'contained', color: 'primary' }, style: toneKey(K.primary) },
              { props: { variant: 'contained', color: 'success' }, style: toneKey(K.primary) },
              { props: { variant: 'contained', color: 'warning' }, style: toneKey(K.warning) },
              { props: { variant: 'contained', color: 'error' }, style: toneKey(K.danger) },
              {
                props: { variant: 'text' },
                style: {
                  color: C.phosphor,
                  '&:hover': { backgroundColor: alpha(C.phosphor, 0.08) },
                  '&.Mui-disabled': { backgroundColor: 'transparent', borderColor: 'transparent' },
                },
              },
            ],
            [SELECTED_STATES]: SELECTED_KEY,
            '&.Mui-disabled:not(.MuiButton-text)': DISABLED_KEY,
            '&.Mui-disabled.MuiButton-text': { color: K.disabled.text },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: T.radius,
            width: K.minHeight,
            height: K.minHeight,
            '@media (pointer: coarse)': { width: K.touchMinHeight, height: K.touchMinHeight },
            ...defaultKey(!reduceMotion),
            [SELECTED_STATES]: SELECTED_KEY,
            '&.Mui-disabled': DISABLED_KEY,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            ...KEY_LABEL,
            borderRadius: T.radius,
            minHeight: K.minHeight,
            ...defaultKey(!reduceMotion),
            [SELECTED_STATES]: SELECTED_KEY,
            '&.Mui-disabled': DISABLED_KEY,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: C.input,
            borderRadius: T.radius,
            fontSize: px(T.type.small.size),
            color: C.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: T.field.border },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.field.hoverBorder },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: C.amber,
              borderWidth: 2,
            },
            '&.Mui-disabled': { backgroundColor: T.field.disabledBg },
            '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
              borderColor: T.field.disabledBorder,
            },
          },
          input: { padding: '9.5px 10px', lineHeight: '23px', height: 23 },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { color: C.warm, '&.Mui-focused': { color: C.amber } },
        },
      },
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiSelect: {
        styleOverrides: {
          icon: { color: C.warm },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: { backgroundColor: C.module, border: `${T.bezel.module}px solid ${C.bezel}` },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { backgroundColor: C.module, border: `${T.bezel.module}px solid ${C.bezel}` },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            width: T.switch.width + 16,
            height: T.switch.height + 16,
            padding: 8,
          },
          switchBase: {
            padding: 12,
            '&.Mui-checked': {
              transform: 'translateX(17px)',
              '& .MuiSwitch-thumb': { backgroundColor: C.phosphor },
              '& + .MuiSwitch-track': {
                backgroundColor: T.switch.trackChecked,
                borderColor: C.phosphor,
                opacity: 1,
              },
            },
          },
          thumb: { width: 13, height: 13, backgroundColor: T.switch.thumb, boxShadow: 'none' },
          track: {
            borderRadius: 12,
            border: `1px solid ${T.switch.trackBorder}`,
            backgroundColor: T.switch.track,
            opacity: 1,
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: { color: C.warm, borderRadius: T.radius, '&.Mui-checked': { color: C.phosphor } },
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: { color: C.warm, '&.Mui-checked': { color: C.phosphor } },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { backgroundColor: T.tabs.bg, borderBottom: `1px solid ${T.tabs.border}` },
          indicator: { backgroundColor: C.phosphor, height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            ...typo(T.type.meta),
            letterSpacing: T.letterSpacing.key,
            textTransform: 'uppercase',
            color: T.tabs.text,
            '&.Mui-selected': { color: C.phosphor, fontWeight: 700 },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            maxWidth: 540,
            backgroundColor: C.dialog,
            border: `${T.bezel.module}px solid ${T.dialog.border}`,
            boxShadow: T.dialog.shadow,
            borderRadius: T.radius,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            ...typo(T.type.subtitle),
            color: C.paper,
            borderBottom: `1px solid ${T.dialog.headBorder}`,
            marginBottom: 12,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            '&:not(.MuiBackdrop-invisible)': {
              backgroundColor: alpha(C.map, T.alpha.backdrop),
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: T.radius,
            border: `1px solid ${T.alert.border}`,
            borderLeft: `4px solid ${T.alert.info.edge}`,
            backgroundColor: T.alert.info.bg,
            color: C.paper,
            '& .MuiAlert-icon': { color: T.alert.info.icon },
            '&.MuiAlert-colorWarning': {
              borderLeftColor: T.alert.warning.edge,
              backgroundColor: T.alert.warning.bg,
              color: C.paper,
              '& .MuiAlert-icon': { color: T.alert.warning.icon },
            },
            '&.MuiAlert-colorError': {
              borderLeftColor: T.alert.error.edge,
              backgroundColor: T.alert.error.bg,
              color: C.paper,
              '& .MuiAlert-icon': { color: T.alert.error.icon },
            },
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            borderRadius: T.radius,
            border: `1px solid ${T.alert.border}`,
            borderLeft: `4px solid ${T.alert.info.edge}`,
            backgroundColor: T.alert.info.bg,
            color: C.paper,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: T.radius,
            fontSize: px(T.type.meta.size),
            letterSpacing: T.letterSpacing.badge,
            textTransform: 'uppercase',
            variants: [
              {
                props: { variant: 'outlined', color: 'default' },
                style: { borderColor: T.badge.neutral.border, color: T.badge.neutral.text },
              },
              {
                props: { color: 'success' },
                style: {
                  backgroundColor: 'transparent',
                  border: `1px solid ${T.badge.green.border}`,
                  color: T.badge.green.text,
                },
              },
              {
                props: { color: 'primary' },
                style: {
                  backgroundColor: 'transparent',
                  border: `1px solid ${T.badge.green.border}`,
                  color: T.badge.green.text,
                },
              },
              {
                props: { color: 'warning' },
                style: {
                  backgroundColor: 'transparent',
                  border: `1px solid ${T.badge.amber.border}`,
                  color: T.badge.amber.text,
                },
              },
              {
                props: { color: 'error' },
                style: {
                  backgroundColor: 'transparent',
                  border: `1px solid ${T.badge.red.border}`,
                  color: T.badge.red.text,
                },
              },
            ],
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: C.plate,
            border: `1px solid ${C.bezel}`,
            borderRadius: T.radius,
            color: C.paper,
            fontSize: px(T.type.meta.size),
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: C.bezel } },
      },
      MuiLink: {
        styleOverrides: { root: { color: C.phosphor } },
      },
    },
  });
}
