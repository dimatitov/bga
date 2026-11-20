import type { QueryClient } from '@tanstack/react-query';
import type { SessionCommandOk, SessionEnvelope } from '../sessions/api';
import { sessionKeys } from '../sessions/queries';
import { type AutomationSource, updateAutomation } from './automationStore';

/**
 * The single writer of a successful command / automation-run response (SWR-006 plan-frontend §4.2, §5):
 * `detail` ← `{ ...prev, view, automation: { pending, strategy } }`, `lists()` invalidated; `stopReason`
 * `gameOver` (status `completed`) or `conflict` (W-7: another executor advanced the session) → `detail` refetched.
 * `view`/`events` are not parsed here; only the platform frame (`ok`, `automation`) is validated by
 * `SessionCommandOkSchema`. Who validates `view`/`events` depends on `source` (review F-7):
 * - `'command'`: the game parsed the whole response with its own schema before calling;
 * - `'run'` (`runAutomation`): the platform does not know the game's schema, so they are written as received and the
 *   game validates them on read (its `TableScreen` parses `view` and `lastRun.events` before use, as it does for any
 *   `detail` envelope).
 *
 * Store (current SessionHost session only): `source: 'command'` arms one automatic run and clears
 * `error`/`stalled`; `source: 'run'` never arms (`pending` → `stalled`, Q-FE-1). `lastRun`: replaced when
 * `steps > 0`; cleared by a command with `steps === 0` (Q-FE-5); kept by a run with `steps === 0`.
 */
export function commitCommandResult(
  qc: QueryClient,
  sessionId: string,
  ok: SessionCommandOk,
  source: AutomationSource,
): void {
  const detailKey = sessionKeys.detail(sessionId);
  const { pending, strategy, steps, stopReason } = ok.automation;
  qc.setQueryData<SessionEnvelope>(detailKey, (prev) =>
    prev ? { ...prev, view: ok.view, automation: { pending, strategy } } : prev,
  );
  void qc.invalidateQueries({ queryKey: sessionKeys.lists() });
  if (stopReason === 'gameOver' || stopReason === 'conflict') {
    void qc.invalidateQueries({ queryKey: detailKey });
  }

  updateAutomation(sessionId, (s) => {
    const seq = steps > 0 ? s.seq + 1 : s.seq;
    const lastRun =
      steps > 0
        ? { source, summary: ok.automation, events: ok.events, seq }
        : source === 'command'
          ? null
          : s.lastRun;
    if (source === 'command') {
      return {
        seq,
        lastRun,
        autoRunArmed: true,
        ...(s.phase === 'error' || s.phase === 'stalled' ? { phase: 'idle', error: null } : {}),
      };
    }
    return { seq, lastRun, autoRunArmed: false, phase: pending ? 'stalled' : 'idle', error: null };
  });
}
