import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import type { SessionEnvelope } from '../sessions/api';
import {
  consumeAutomationArm,
  promoteLoadArm,
  resetAutomation,
  useAutomationStore,
} from './automationStore';
import { runAutomation } from './runAutomation';
import type { SessionAutomationState } from './SessionAutomationContext';

/**
 * Auto-run driver of SessionHost (SWR-006 plan-frontend §3.2, Q-FE-1): when the server says
 * `automation.pending === true` and an automatic run is armed (by this load, a GET refetch or a command response),
 * makes exactly ONE `POST …/automation/run` (a GET arms only after its data is in the cache). A run answering `pending: true` does not re-arm → `stalled` and the
 * explicit «Continue AI turn». The arm is taken atomically from the module-level store, so StrictMode double effects
 * never make a second request. `strategy: null` + `pending: false` → no request at all.
 * Returns the state exposed to the game through `SessionAutomationContext`.
 */
export function useAutomationDriver(
  sessionId: string,
  data: SessionEnvelope | undefined,
  /** `dataUpdatedAt` of the session query: a GET's data reached the cache → its load arms one run. */
  dataUpdatedAt: number,
): SessionAutomationState {
  const qc = useQueryClient();

  // One reset per mount of the session (refs survive the StrictMode effect re-run; a new mount is a new load).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    resetAutomation(sessionId);
  }, [sessionId]);

  useEffect(() => {
    promoteLoadArm(sessionId);
  }, [sessionId, dataUpdatedAt]);

  const own = useAutomationStore((s) => s.sessionId === sessionId);
  const armed = useAutomationStore((s) => s.sessionId === sessionId && s.autoRunArmed);
  const storePhase = useAutomationStore((s) => (s.sessionId === sessionId ? s.phase : 'idle'));
  const error = useAutomationStore((s) => (s.sessionId === sessionId ? s.error : null));
  const lastRun = useAutomationStore((s) => (s.sessionId === sessionId ? s.lastRun : null));

  const pending = data?.automation.pending ?? false;
  const strategy = data?.automation.strategy ?? null;

  useEffect(() => {
    if (!own || !pending || !armed || storePhase === 'running') return;
    if (!consumeAutomationArm(sessionId)) return;
    void runAutomation(qc, sessionId);
  }, [own, pending, armed, storePhase, sessionId, qc]);

  // The server still waits for the automated participant but no run is in flight or armed (e.g. after a run that
  // stopped on its step limit, or an idle state the store missed) → offer the explicit retry.
  // Conversely, `stalled` ends as soon as the server data says nothing is pending (e.g. a refetch after a conflict).
  const phase =
    storePhase === 'idle' && pending && own && !armed
      ? 'stalled'
      : storePhase === 'stalled' && !pending
        ? 'idle'
        : storePhase;

  return useMemo(
    () => ({
      strategy,
      pending,
      phase,
      error,
      lastRun,
      retry: () => void runAutomation(qc, sessionId),
    }),
    [strategy, pending, phase, error, lastRun, qc, sessionId],
  );
}
