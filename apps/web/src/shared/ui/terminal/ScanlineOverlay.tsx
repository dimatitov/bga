import Box, { type BoxProps } from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { terminalTokens } from '@/shared/theme';

/**
 * Decorative CRT scanlines over a display (SWR-009 R-4): `aria-hidden`, `pointer-events: none`, no animation.
 * The parent must be `position: relative`.
 */
export function ScanlineOverlay({ sx, ...rest }: Omit<BoxProps, 'children'>) {
  const line = alpha(terminalTokens.color.map, terminalTokens.alpha.scanline);
  return (
    <Box
      aria-hidden="true"
      data-decorative="scanlines"
      {...rest}
      sx={[
        {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 2px, ${line} 2px, ${line} 3px)`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
