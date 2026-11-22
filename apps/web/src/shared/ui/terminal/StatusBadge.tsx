import Box, { type BoxProps } from '@mui/material/Box';
import type { ReactNode } from 'react';
import { terminalTokens } from '@/shared/theme';

export type StatusTone = 'green' | 'amber' | 'red' | 'neutral';

export interface StatusBadgeProps extends Omit<BoxProps, 'children'> {
  tone: StatusTone;
  /** The text is mandatory: a badge never carries meaning by colour alone. */
  children: ReactNode;
}

const T = terminalTokens;

/** Bordered uppercase badge (UI Kit `.badge`, TC-TK-09): green / amber / red / neutral. Empty → nothing. */
export function StatusBadge({ tone, children, sx, ...rest }: StatusBadgeProps) {
  if (children === null || children === undefined || children === false || children === '') {
    return null;
  }
  const colors = T.badge[tone];
  return (
    <Box
      component="span"
      data-tone={tone}
      {...rest}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          border: `1px solid ${colors.border}`,
          color: colors.text,
          padding: '3px 7px',
          fontSize: T.type.meta.size,
          lineHeight: `${T.type.meta.lineHeight - 2}px`,
          letterSpacing: T.letterSpacing.badge,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          borderRadius: `${T.radius}px`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
