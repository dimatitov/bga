/**
 * URL builders of the platform (plan-frontend §2). Used by the platform and by games; `app/router.tsx`
 * declares the same patterns (`routePatterns`). Adding a game never changes this file.
 */
export const paths = {
  catalog: '/',
  game: (gameId: string) => `/games/${encodeURIComponent(gameId)}`,
  newSession: (gameId: string) => `/games/${encodeURIComponent(gameId)}/new`,
  session: (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}`,
  settings: '/settings',
} as const;

/** Route patterns for `app/router.tsx` (params: `gameId`, `sessionId`). */
export const routePatterns = {
  catalog: '/',
  game: '/games/:gameId',
  newSession: '/games/:gameId/new',
  session: '/sessions/:sessionId',
  settings: '/settings',
  notFound: '*',
} as const;
