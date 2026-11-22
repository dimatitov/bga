import '@mui/material/styles';
import '@mui/material/Typography';
import type { CSSProperties } from 'react';
import type { TerminalTokens } from '@/shared/theme';

/** Custom palette entries (plan-frontend §8, names frozen; `terminal` — SWR-009 K-2). */
declare module '@mui/material/styles' {
  interface Palette {
    mock: { main: string };
    focus: string;
    /** Galactic Vector Terminal colour roles (= `terminalTokens.color`) for `sx`. */
    terminal: TerminalTokens['color'];
  }
  interface PaletteOptions {
    mock?: { main: string };
    focus?: string;
    terminal?: TerminalTokens['color'];
  }
  /** SWR-009 K-2: typography variants `metric` (22/28·700, phosphor) and `meta` (11/16 uppercase). */
  interface TypographyVariants {
    metric: CSSProperties;
    meta: CSSProperties;
  }
  interface TypographyVariantsOptions {
    metric?: CSSProperties;
    meta?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    metric: true;
    meta: true;
  }
}
