import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDevAiStatus, postDevAiTestDecision } from './api';

export const devAiKeys = {
  all: ['dev-ai'] as const,
  status: () => [...devAiKeys.all, 'status'] as const,
};

/** Status of the AI connection (free request; no refetch on focus, plan-frontend §4). */
export function useDevAiStatus() {
  return useQuery({
    queryKey: devAiKeys.status(),
    queryFn: ({ signal }) => fetchDevAiStatus(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Test decision: possibly a paid request, so never retried (§0.3). After every attempt (success or error) the status
 * is refetched — spent/remaining budget is always the server's.
 */
export function useTestDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDevAiTestDecision,
    retry: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: devAiKeys.status() }),
  });
}
