import Box, { type BoxProps } from '@mui/material/Box';
import { forwardRef } from 'react';
import { terminalTokens } from '@/shared/theme';

const T = terminalTokens;

export interface TerminalPanelProps extends BoxProps {
  /** Colour of a 4 px stripe along the top bezel (game accent / faction colour); default — plain bezel. */
  accent?: string;
  /** `case` = the darker console case surface (page frames); default `module`. */
  surface?: 'module' | 'case';
}

/**
 * Platform panel in the Galactic Vector Terminal look (SWR-009 N): 2 px bezel, module surface, 1 px inset line —
 * the same frame as the UI Kit `TerminalModule`, but without its labelled header, so a page keeps its own `<h1>`
 * (TerminalModule's label is an `h2`/`h3`). Extra props (`component`, `data-testid`, `sx`…) go to the box.
 */
export const TerminalPanel = forwardRef<HTMLDivElement, TerminalPanelProps>(function TerminalPanel(
  { accent, surface = 'module', sx, ...rest },
  ref,
) {
  return (
    <Box
      ref={ref}
      {...rest}
      sx={[
        {
          position: 'relative',
          minWidth: 0,
          border: `${T.bezel.module}px solid ${T.color.bezel}`,
          borderRadius: `${T.radius}px`,
          backgroundColor: surface === 'case' ? T.color.case : T.color.module,
          boxShadow: `inset 0 0 0 1px ${T.module.inset}`,
          ...(accent ? { borderTop: `${T.bezel.housing}px solid ${accent}` } : {}),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
});
