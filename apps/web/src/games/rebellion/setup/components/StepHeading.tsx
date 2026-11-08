import Typography from '@mui/material/Typography';
import { type ReactNode } from 'react';

/** Numbered block heading of the form («1. Ваша сторона» …): the visible label of its radiogroup. */
export function StepHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Typography
      id={id}
      variant="overline"
      component="h2"
      color="text.secondary"
      sx={{ display: 'block', mb: 1, lineHeight: 1.6 }}
    >
      {children}
    </Typography>
  );
}
