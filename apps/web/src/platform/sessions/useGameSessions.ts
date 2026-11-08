import type { SessionSummary } from '@bga/platform';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { sessionsListQuery } from './queries';

/** Recent sessions shown on the game page (spec scenario 2). */
export const RECENT_SESSIONS_LIMIT = 5;

export type GameSessionsResult = UseQueryResult<SessionSummary[]> & {
  /** Target of "Continue" — the most recently updated session of this game. */
  latest: SessionSummary | null;
  /** At most `RECENT_SESSIONS_LIMIT`, `updatedAt` desc. */
  recent: SessionSummary[];
};

/**
 * Sessions of one game (`GET /api/sessions?gameId=`). `enabled: false` for `coming_soon` — no request (Q-16).
 * Defensive sort by `updatedAt` desc; the server filter is trusted (Q-18).
 */
export function useGameSessions(gameId: string, opts: { enabled: boolean }): GameSessionsResult {
  const query = useQuery({ ...sessionsListQuery(gameId), enabled: opts.enabled });
  const sorted = useMemo(
    () =>
      query.data
        ? [...query.data].sort((a, b) =>
            a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
          )
        : [],
    [query.data],
  );
  return Object.assign(query, {
    latest: sorted[0] ?? null,
    recent: sorted.slice(0, RECENT_SESSIONS_LIMIT),
  });
}
