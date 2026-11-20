import { queryOptions } from '@tanstack/react-query';
import { noteSessionLoaded } from '../automation/automationStore';
import { getSession, listSessions } from './api';

/**
 * Query keys of sessions (plan-frontend §3, §3.1 cache rules):
 * create → `setQueryData(detail(id))` + `invalidate(lists())`; command ok → `setQueryData(detail(id))` +
 * `invalidate(lists())`; 409/404 → `invalidate(detail(id))`. No optimistic writes.
 * SWR-006 (plan-frontend §5): command / automation-run 200 → `commitCommandResult` (`setQueryData(detail)` with the
 * new `view` and `automation: { pending, strategy }` + `invalidate(lists())`; `stopReason` `gameOver` | `conflict` →
 * also `invalidate(detail)`); run 404 / 422 → `invalidate(detail)`; run network / 5xx → cache untouched.
 */
export const sessionKeys = {
  all: ['sessions'] as const,
  /** Prefix of every list (all games and per game) — for invalidation. */
  lists: () => ['sessions', 'list'] as const,
  list: (gameId?: string) => ['sessions', 'list', gameId ?? '*'] as const,
  detail: (sessionId: string) => ['sessions', 'detail', sessionId] as const,
};

/**
 * Freshness of a seeded/updated session detail (= app default `staleTime`), explicit so that the table opened
 * right after creation never loads the session a second time, whatever the client defaults (plan §2.2, AC-3).
 * Commands write the cache; 409/404 invalidate it (forces a refetch regardless of this value).
 */
export const SESSION_DETAIL_STALE_TIME = 30_000;

/** `GET /api/sessions/:id` → `SessionEnvelope` (the only loader of a session: SessionHost). */
export function sessionQuery(sessionId: string) {
  return queryOptions({
    queryKey: sessionKeys.detail(sessionId),
    staleTime: SESSION_DETAIL_STALE_TIME,
    queryFn: async ({ signal }) => {
      const envelope = await getSession(sessionId, { signal });
      // Every load allows one automatic run of the automated participant (Q-FE-1; no-op without SessionHost).
      noteSessionLoaded(sessionId);
      return envelope;
    },
  });
}

/** `GET /api/sessions[?gameId]` → `SessionSummary[]`. */
export function sessionsListQuery(gameId?: string) {
  return queryOptions({
    queryKey: sessionKeys.list(gameId),
    queryFn: ({ signal }) => listSessions(gameId === undefined ? {} : { gameId }, { signal }),
  });
}
