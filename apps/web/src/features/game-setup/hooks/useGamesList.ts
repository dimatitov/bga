import { type GameSummary } from '@swr/contracts';
import { useQuery } from '@tanstack/react-query';
import { gamesListQuery } from '@/shared/api';

export const RECENT_GAMES_LIMIT = 5;

/** Newest first (server already sorts by `updatedAt` desc — re-sorted defensively, stable). */
export function sortByUpdatedDesc(games: GameSummary[]): GameSummary[] {
  return [...games].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function useGamesList() {
  const query = useQuery({ ...gamesListQuery(), select: sortByUpdatedDesc });
  const games = query.data ?? [];
  return {
    ...query,
    games,
    /** «Продолжить» target (A-1). */
    latest: games[0] ?? null,
    /** «Недавние партии» (≤ 5). */
    recent: games.slice(0, RECENT_GAMES_LIMIT),
  };
}
