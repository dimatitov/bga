import { type GameSetupInput } from '@swr/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { createGame, gameKeys } from '@/shared/api';

/** POST /api/games → seed the view cache → refresh list → go to the table (D-N-6). */
export function useCreateGame() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (setup: GameSetupInput) => createGame(setup),
    onSuccess: async ({ gameId, view }) => {
      queryClient.setQueryData(gameKeys.view(gameId), view);
      void queryClient.invalidateQueries({ queryKey: gameKeys.list() });
      await navigate(`/games/${encodeURIComponent(gameId)}`);
    },
  });
}
