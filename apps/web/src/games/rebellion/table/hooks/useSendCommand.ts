import { type Command, type CommandEnvelope, CommandOkSchema } from '@bga/game-rebellion/schema';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { postSessionCommand, type SessionEnvelope, sessionKeys } from '@/platform';
import { isApiError, NETWORK_MESSAGE_KEY, UNKNOWN_MESSAGE_KEY } from '@/shared/api/errors';
import type { CommandOutcome } from '../../board/model/boardContext';
import { endsGame } from '../../core-v1/model/announcements';
import { parseRebellionView } from './useRebellionView';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const INVALID_RESPONSE = 'INVALID_RESPONSE';

/**
 * Sends a command for `view.viewer` with `expectedVersion = view.version` taken from the session cache
 * (`sessionKeys.detail(sessionId)`) at send time (SWR-003 plan-frontend §3.1, §3.3). Never rejects.
 * 200 → `setQueryData(detail, { ...envelope, view })` + invalidate `lists()`; 409/404 → invalidate `detail`
 * (SessionHost refetches; 404 → `session-not-found`); 422/400 → cache untouched.
 * A second send while one is in flight is ignored (D-P-7).
 * SWR-005: the same sender serves both engines (`Command` is the union of mock-v1 and core-v1 commands; the actor
 * is always the viewer of the cached view). A response whose events contain `GAME_OVER` also invalidates the
 * session detail, so the platform status (`completed`) is refetched — the command response carries no status
 * (AM-FE-10 rejected; the table shows the result from `view.outcome` meanwhile).
 */
export function useSendCommand(sessionId: string): {
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
      const detailKey = sessionKeys.detail(sessionId);
      const view = parseRebellionView(qc.getQueryData<SessionEnvelope>(detailKey)?.view);
      if (!view) return { ok: false, code: 'NOT_READY', messageKey: UNKNOWN_MESSAGE_KEY };
      const envelope: CommandEnvelope = {
        actor: view.kind === 'player' ? view.viewer : view.activeSide,
        expectedVersion: view.version,
        command,
      };
      inFlight.current = true;
      setPending(true);
      const statusBefore = statusRef.current;
      setSaveStatus('saving');
      try {
        const result = await postSessionCommand(sessionId, envelope);
        if (result.ok) {
          const ok = CommandOkSchema.safeParse(result);
          if (!ok.success) {
            // The command was accepted but the view is not a Rebellion view: reload the authoritative state.
            await qc.invalidateQueries({ queryKey: detailKey });
            setSaveStatus('error');
            return { ok: false, code: INVALID_RESPONSE, messageKey: UNKNOWN_MESSAGE_KEY };
          }
          qc.setQueryData<SessionEnvelope>(detailKey, (prev) =>
            prev ? { ...prev, view: ok.data.view } : prev,
          );
          void qc.invalidateQueries({ queryKey: sessionKeys.lists() });
          if (endsGame(ok.data.events)) void qc.invalidateQueries({ queryKey: detailKey });
          setSaveStatus('saved');
          return { ok: true, view: ok.data.view, events: ok.data.events };
        }
        const { code, messageKey, details } = result.error;
        if (code === 'VERSION_CONFLICT' || code === 'NOT_FOUND') {
          // A-19: refetch the authoritative view; selection is reconciled against it.
          await qc.invalidateQueries({ queryKey: detailKey });
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
    [sessionId, qc, setSaveStatus],
  );

  return { send, isPending, saveStatus };
}
