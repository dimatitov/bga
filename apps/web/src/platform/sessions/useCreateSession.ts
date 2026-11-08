import { canonicalJson } from '@bga/platform';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { StartSession } from '@/games/registry';
import { CLIENT_ERROR_CODES, isApiError, isNetworkError } from '@/shared/api/errors';
import { createIdempotencyKey } from '@/shared/api/idempotency';
import { paths } from '../paths';
import { createSession, type SessionEnvelope } from './api';
import { sessionKeys } from './queries';

interface Attempt {
  setup: unknown;
  key: string;
}

/**
 * Key kept for the next submit of the same setup: after a network failure without a response (refined Q-5),
 * or after a 2xx whose body could not be parsed (review #2) — the server may have created the session,
 * so the retry with the same key gets the replay (200) instead of creating a second session (AC-10).
 */
interface PendingKey {
  body: string;
  key: string;
}

/**
 * Creates a session of `gameId` for the game's setup screen (plan-frontend §2.2, SWR-004 §4.2):
 * `POST /api/sessions` with `Idempotency-Key` → seed `detail(id)` (the table opens without a second request) →
 * invalidate lists → `navigate(/sessions/:id, { replace: true })` (D-NS-3). 201 and 200 (replay) are the same.
 *
 * Idempotency-Key policy (spec Decisions, refined Q-5): one `createIdempotencyKey()` call per submit attempt;
 * double submit while pending → ignored (one request); a retry after a *network* failure with no server
 * response, or after a 2xx with an unparseable body (`INVALID_RESPONSE`, review #2), with the same setup
 * reuses the key; after a 4xx/5xx response or with a changed setup → a new key. Bodies are compared with
 * `canonicalJson` of `@bga/platform` (the same function the API hashes, review #3). The mutation never retries by itself.
 */
/** No response, or a 2xx we could not read: the session may exist → keep the key for the retry. */
function keepsKey(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  return (
    isApiError(error) &&
    error.code === CLIENT_ERROR_CODES.invalidResponse &&
    error.status !== null &&
    error.status >= 200 &&
    error.status < 300
  );
}

export function useCreateSession(gameId: string): StartSession {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inFlight = useRef(false);
  const pendingKey = useRef<PendingKey | null>(null);

  const mutation = useMutation({
    mutationFn: ({ setup, key }: Attempt) =>
      createSession({ gameId, setup }, { idempotencyKey: key }),
    retry: false,
    onSuccess: async (envelope: SessionEnvelope) => {
      queryClient.setQueryData(sessionKeys.detail(envelope.sessionId), envelope);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      await navigate(paths.session(envelope.sessionId), { replace: true });
    },
    onError: (error: unknown, { setup, key }: Attempt) => {
      pendingKey.current = keepsKey(error) ? { body: canonicalJson(setup), key } : null;
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const { mutate, reset: resetMutation, isPending, error } = mutation;

  const submit = useCallback(
    (setup: unknown) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const kept = pendingKey.current;
      pendingKey.current = null;
      const key =
        kept !== null && kept.body === canonicalJson(setup) ? kept.key : createIdempotencyKey();
      mutate({ setup, key });
    },
    [mutate],
  );
  const reset = useCallback(() => resetMutation(), [resetMutation]);

  return useMemo(
    () => ({ submit, isPending, error: error ?? null, reset }),
    [submit, isPending, error, reset],
  );
}
