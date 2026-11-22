import Box, { type BoxProps } from '@mui/material/Box';
import type { ReactNode } from 'react';
import { terminalTokens } from '@/shared/theme';

export interface LegendKeyProps extends Omit<BoxProps, 'children'> {
  /** The symbol (a `UnitGlyph`, a ring…); always hidden from assistive technology. */
  glyph: ReactNode;
  /** The caption (mandatory: the legend explains in text). */
  children: ReactNode;
}

/** Legend entry «glyph + caption», 11 px (UI Kit `.map-legend .key`, TC-TK-12). */
export function LegendKey({ glyph, children, sx, ...rest }: LegendKeyProps) {
  return (
    <Box
      component="span"
      {...rest}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: terminalTokens.type.meta.size,
          lineHeight: `${terminalTokens.type.meta.lineHeight}px`,
          color: terminalTokens.color.warm,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box component="span" aria-hidden="true" sx={{ display: 'inline-flex', flex: 'none' }}>
        {glyph}
      </Box>
      <span>{children}</span>
    </Box>
  );
}
