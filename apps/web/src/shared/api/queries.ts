import { queryOptions } from '@tanstack/react-query';
import { getGameView, listGames } from './games';

export const gameKeys = {
  all: ['games'] as const,
  list: () => ['games', 'list'] as const,
  view: (gameId: string) => ['games', gameId, 'view'] as const,
};

export function gamesListQuery() {
  return queryOptions({
    queryKey: gameKeys.list(),
    queryFn: ({ signal }) => listGames({ signal }),
  });
}

export function gameViewQuery(gameId: string) {
  return queryOptions({
    queryKey: gameKeys.view(gameId),
    queryFn: ({ signal }) => getGameView(gameId, { signal }),
  });
}
