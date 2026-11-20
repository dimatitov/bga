import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchSessionDecisions } from './api';

export const sessionDecisionsKey = (sessionId: string) =>
  ['dev-ai', 'session', sessionId, 'decisions'] as const;

/**
 * Decisions of the session (plan-frontend §2.3). Fetched once on mount and then only on demand: the panel invalidates
 * the key on a new AI turn (`lastRun.seq`) or when a run ends, and on «Refresh». Never retried, never refetched on
 * focus. The key carries no `seq`: a human command with 0 AI steps clears `lastRun`, and a `seq`-keyed cache would
 * then fall back to the stale first answer.
 */
export function useSessionDecisions(sessionId: string) {
  return useQuery({
    queryKey: sessionDecisionsKey(sessionId),
    queryFn: ({ signal }) => fetchSessionDecisions(sessionId, signal),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}
