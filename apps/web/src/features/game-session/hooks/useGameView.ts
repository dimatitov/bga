import type { PlayerView } from '@swr/contracts';
import { useQuery } from '@tanstack/react-query';
import { gameViewQuery, isNotFound } from '@/shared/api';

export type GameViewStatus = 'loading' | 'ready' | 'notFound' | 'error';

/** Server view of a game (`GET /api/games/:id`); the cache is changed only by server data (plan-frontend §0.4). */
export function useGameView(gameId: string): {
  view: PlayerView | undefined;
  status: GameViewStatus;
  error: unknown;
  isFetching: boolean;
  refetch: () => void;
} {
  const q = useQuery(gameViewQuery(gameId));
  let status: GameViewStatus;
  if (q.isError && isNotFound(q.error)) status = 'notFound';
  else if (q.data) status = 'ready';
  else if (q.isError) status = 'error';
  else status = 'loading';
  return {
    view: q.data,
    status,
    error: q.error,
    isFetching: q.isFetching,
    refetch: () => void q.refetch(),
  };
}
