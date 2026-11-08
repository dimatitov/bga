import type { Command, CommandEnvelope, PlayerView } from '@swr/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { CommandOutcome } from '@/features/game-board';
import {
  gameKeys,
  isApiError,
  NETWORK_MESSAGE_KEY,
  postCommand,
  UNKNOWN_MESSAGE_KEY,
} from '@/shared/api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Sends a command for `view.setup.humanFaction` with `expectedVersion = view.version` taken from the cache at send time
 * (plan-frontend §3.1). Never rejects. 200 → `setQueryData(view)` + list invalidation; 409/404 → refetch the view;
 * 422/400 → cache untouched. A second send while one is in flight is ignored (D-P-7).
 */
export function useSendCommand(gameId: string): {
  send(command: Command): Promise<CommandOutcome>;
  isPending: boolean;
  saveStatus: SaveStatus;
} {
  const qc = useQueryClient();
  const inFlight = useRef(false);
  const [isPending, setPending] = useState(false);
  const [saveStatus, setSaveStatusState] = useState<SaveStatus>('idle');
  // Mirror of `saveStatus` readable inside `send` without re-creating the callback.
  const statusRef = useRef<SaveStatus>('idle');
  const setSaveStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setSaveStatusState(next);
  }, []);

  const send = useCallback(
    async (command: Command): Promise<CommandOutcome> => {
      if (inFlight.current) return { ok: false, code: 'IGNORED', messageKey: UNKNOWN_MESSAGE_KEY };
      const view = qc.getQueryData<PlayerView>(gameKeys.view(gameId));
      if (!view) return { ok: false, code: 'NOT_READY', messageKey: UNKNOWN_MESSAGE_KEY };
      const envelope: CommandEnvelope = {
        actor: view.setup.humanFaction,
        expectedVersion: view.version,
        command,
      };
      inFlight.current = true;
      setPending(true);
      const statusBefore = statusRef.current;
      setSaveStatus('saving');
      try {
        const result = await postCommand(gameId, envelope);
        if (result.ok) {
          qc.setQueryData(gameKeys.view(gameId), result.view);
          void qc.invalidateQueries({ queryKey: gameKeys.list() });
          setSaveStatus('saved');
          return { ok: true, view: result.view, events: result.events };
        }
        const { code, messageKey, details } = result.error;
        if (code === 'VERSION_CONFLICT' || code === 'NOT_FOUND') {
          // A-19: refetch the authoritative view; selection is reconciled against it.
          await qc.invalidateQueries({ queryKey: gameKeys.view(gameId) });
        }
        // Rejected (4xx): nothing new was saved — restore the indicator to what it showed before this send
        // (`idle` stays `idle`, `saved`/`error` keep describing the last real save attempt).
        setSaveStatus(statusBefore);
        return { ok: false, code, messageKey, details };
      } catch (e) {
        setSaveStatus('error');
        return {
          ok: false,
          code: isApiError(e) && e.code ? e.code : 'NETWORK',
          messageKey: isApiError(e) && e.messageKey ? e.messageKey : NETWORK_MESSAGE_KEY,
        };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [gameId, qc, setSaveStatus],
  );

  return { send, isPending, saveStatus };
}
