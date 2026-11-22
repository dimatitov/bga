import Box, { type BoxProps } from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { terminalTokens } from '@/shared/theme';

export type StatusCardTone = 'green' | 'amber' | 'red';

export interface StatusCardProps extends Omit<BoxProps, 'title'> {
  tone: StatusCardTone;
  title: ReactNode;
  children?: ReactNode;
  /** Optional element before the title (e.g. a `Led`). */
  icon?: ReactNode;
}

const T = terminalTokens;
const EDGE: Readonly<Record<StatusCardTone, string>> = {
  green: T.color.phosphor,
  amber: T.color.amber,
  red: T.color.red,
};

/** Status card with a 3 px tone edge (UI Kit `.status`: AI ready / thinking / failed). */
export function StatusCard({ tone, title, children, icon, sx, ...rest }: StatusCardProps) {
  return (
    <Box
      data-tone={tone}
      {...rest}
      sx={[
        {
          border: `1px solid ${T.statusCard.border}`,
          borderLeft: `3px solid ${EDGE[tone]}`,
          backgroundColor: T.statusCard.bg,
          padding: '11px 12px',
          minWidth: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon}
        <Typography
          component="strong"
          sx={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.color.paper }}
        >
          {title}
        </Typography>
      </Box>
      {children !== undefined && children !== null && (
        <Box sx={{ mt: '3px', fontSize: T.type.meta.size, color: T.statusCard.text }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
