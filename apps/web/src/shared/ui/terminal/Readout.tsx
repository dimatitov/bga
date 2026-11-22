import Box, { type BoxProps } from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface ReadoutProps extends Omit<BoxProps, 'children'> {
  label: ReactNode;
  value: ReactNode;
  /** `metric` (22/28·700 phosphor) or `body` (14/22). Default `body`. */
  valueVariant?: 'metric' | 'body';
}

/** Meta label + value (status bar cells, display header readouts). */
export function Readout({ label, value, valueVariant = 'body', sx, ...rest }: ReadoutProps) {
  return (
    <Box
      {...rest}
      sx={[{ display: 'grid', gap: '2px', minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Typography variant="meta" component="span" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant={valueVariant === 'metric' ? 'metric' : 'body1'}
        component="span"
        sx={{ display: 'block', overflowWrap: 'anywhere' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
