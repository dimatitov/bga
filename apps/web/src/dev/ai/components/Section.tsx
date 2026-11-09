import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { type ReactNode, useId } from 'react';

/** `section` + `h2` (`aria-labelledby`) card of the diagnostics page (plan-frontend §8). */
export function Section({
  title,
  children,
  testId,
  busy,
  dataState,
  area,
}: {
  title: string;
  children: ReactNode;
  testId: string;
  busy?: boolean;
  dataState?: string;
  area?: string;
}) {
  const headingId = useId();
  return (
    <Paper
      component="section"
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      data-testid={testId}
      data-state={dataState}
      sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, gridArea: area }}
    >
      <Typography id={headingId} variant="h6" component="h2" sx={{ mb: 2, fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
