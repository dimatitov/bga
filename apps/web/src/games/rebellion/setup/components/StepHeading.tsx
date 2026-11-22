import Typography from '@mui/material/Typography';
import { type ReactNode } from 'react';

/**
 * Numbered block heading of the form («1. Ваша сторона» …): the visible label of its radiogroup. SWR-009: the
 * terminal `meta` label (11/16 uppercase, muted).
 */
export function StepHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Typography id={id} variant="meta" component="h2" sx={{ display: 'block', mt: 0, mb: 1 }}>
      {children}
    </Typography>
  );
}
