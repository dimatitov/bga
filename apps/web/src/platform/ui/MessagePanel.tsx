import Box, { type BoxProps } from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Led, type LedState } from '@/shared/ui';
import { TerminalPanel } from './TerminalPanel';

export interface MessagePanelProps extends Omit<BoxProps, 'title'> {
  /** Short status line above the title (meta, uppercase) — a real status, never decoration-only text. */
  status: string;
  /** LED next to the status (decorative, the status says it in words). */
  led: LedState;
  title: ReactNode;
  text?: ReactNode;
  /** Keys at the bottom (the way out). */
  actions?: ReactNode;
  /** Minimum height of the centring area (default `60vh`). */
  minHeight?: string;
}

/**
 * Full-page message (404, route error, session not found / unsupported / load error) as one terminal panel:
 * LED + status line, `<h1>` title, text and keys. The outer box takes the caller's props (`data-testid`,
 * `component="main"`…), so the testids and landmarks of the screens stay where they were.
 */
export function MessagePanel({
  status,
  led,
  title,
  text,
  actions,
  minHeight = '60vh',
  sx,
  ...rest
}: MessagePanelProps) {
  return (
    <Box
      {...rest}
      sx={[
        { display: 'grid', placeItems: 'center', alignContent: 'center', minHeight, px: 2, py: 4 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <TerminalPanel sx={{ width: '100%', maxWidth: 560, p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Led state={led} />
          <Typography variant="meta" component="p" sx={{ m: 0 }}>
            {status}
          </Typography>
        </Box>
        <Typography variant="h2" component="h1" sx={{ color: 'primary.main' }}>
          {title}
        </Typography>
        {text ? (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {text}
          </Typography>
        ) : null}
        {actions ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3 }}>{actions}</Box>
        ) : null}
      </TerminalPanel>
    </Box>
  );
}
