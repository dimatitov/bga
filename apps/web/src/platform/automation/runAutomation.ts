import type { QueryClient } from '@tanstack/react-query';
import { isApiError, isNotFound } from '@/shared/api/errors';
import { runSessionAutomation } from '../sessions/api';
import { sessionKeys } from '../sessions/queries';
import { commitCommandResult } from './commitCommandResult';
import { updateAutomation } from './automationStore';

const GAME_UNAVAILABLE = 'GAME_UNAVAILABLE';

/** Sessions with a run in flight (module-level: survives StrictMode double effects and double clicks). */
const inFlight = new Set<string>();

/**
 * One `POST /api/sessions/:id/automation/run` (SWR-006 plan-frontend §3.3). A second call for the same session while
 * one is in flight is ignored. Never rejects:
 * 200 → `commitCommandResult(..., 'run')` (game `view`/`events` are not validated here — the game parses them on
 * read); 404 / 422 `GAME_UNAVAILABLE` → `detail` invalidated (SessionHost shows not-found / unsupported);
 * network / 5xx / invalid body → `phase: 'error'`, the cache is not touched.
 * The request is not cancelled when the user leaves (that would not cancel the move on the server); a late response
 * still updates the cache, the store ignores it when another session is shown.
 */
export async function runAutomation(qc: QueryClient, sessionId: string): Promise<void> {
  if (inFlight.has(sessionId)) return;
  inFlight.add(sessionId);
  updateAutomation(sessionId, () => ({ phase: 'running', error: null, autoRunArmed: false }));
  try {
    const ok = await runSessionAutomation(sessionId);
    // Only the platform frame was validated (`SessionCommandOkSchema`); `view`/`events` go to the cache unparsed and
    // the game validates them on read (review F-7, see `commitCommandResult`).
    commitCommandResult(qc, sessionId, ok, 'run');
  } catch (e) {
    if (isNotFound(e) || (isApiError(e) && e.code === GAME_UNAVAILABLE)) {
      updateAutomation(sessionId, () => ({ phase: 'idle', error: null }));
      await qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    } else {
      updateAutomation(sessionId, () => ({ phase: 'error', error: e }));
    }
  } finally {
    inFlight.delete(sessionId);
  }
}

/** Test helper: forget in-flight runs. */
export function resetAutomationRuns(): void {
  inFlight.clear();
}
