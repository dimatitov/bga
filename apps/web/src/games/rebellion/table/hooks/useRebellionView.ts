import { type PlayerView, PlayerViewSchema } from '@bga/game-rebellion/schema';
import { useMemo } from 'react';

export type RebellionViewResult = { view: PlayerView } | { error: 'INVALID_VIEW' };

/** Narrows an `unknown` session view (envelope of the platform cache) to a Rebellion `PlayerView`, or `null`. */
export function parseRebellionView(view: unknown): PlayerView | null {
  const parsed = PlayerViewSchema.safeParse(view);
  return parsed.success ? parsed.data : null;
}

/**
 * `view` of `TableScreenProps` (from SessionHost, `sessionKeys.detail(id)`) parsed with the Rebellion schema
 * (SWR-003 plan-frontend §3.3, TR-5). Memoised by reference: the view changes only on `setQueryData`/refetch.
 */
export function useRebellionView(view: unknown): RebellionViewResult {
  return useMemo(() => {
    const parsed = parseRebellionView(view);
    return parsed ? { view: parsed } : { error: 'INVALID_VIEW' as const };
  }, [view]);
}
