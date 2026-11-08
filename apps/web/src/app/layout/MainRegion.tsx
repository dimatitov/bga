import Box from '@mui/material/Box';
import { type ReactNode, Suspense } from 'react';
import { PageFallback } from './PageFallback';

/** `<main id="main">` — skip-link target (D-A-1) and RouteFocus scope (D-A-8) — with Suspense for lazy pages. */
export function MainRegion({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <Box component="main" id="main" tabIndex={-1} sx={{ flex: 1, outline: 'none' }}>
      <Suspense fallback={fallback ?? <PageFallback />}>{children}</Suspense>
    </Box>
  );
}
