import { lazy } from 'react';

/** `/games/:id` — Konva lives in a separate chunk (plan-frontend §2, route → page contract). */
export const LazyGameTablePage = lazy(() =>
  import('@/features/game-session').then((m) => ({ default: m.GameTablePage })),
);
