import { QueryClient } from '@tanstack/react-query';
import { isClientError } from '@/shared/api/errors';

/**
 * plan-frontend §2: one tab, one user — no focus refetch (it would disturb drag), 4xx are not retried.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => failureCount < 1 && !isClientError(error),
      },
      mutations: { retry: 0 },
    },
  });
}
