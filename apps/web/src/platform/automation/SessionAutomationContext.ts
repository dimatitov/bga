import type { AutomationStrategyId } from '@bga/platform';
import { createContext, useContext } from 'react';
import type { AutomationLastRun, AutomationPhase } from './automationStore';

/**
 * What a game table may know about the automated participant of its session (SWR-006 plan-frontend §4.3).
 * `strategy`/`pending` come from the session cache (`SessionEnvelope.automation`), the rest from the client store.
 */
export interface SessionAutomationState {
  /** `null` — the session has no automated participant. */
  strategy: AutomationStrategyId | null;
  pending: boolean;
  phase: AutomationPhase;
  /** The failure of the last run (`phase === 'error'`). */
  error: unknown;
  /** Summary of the last response with automated steps (`null` — none, or cleared by a human command). */
  lastRun: AutomationLastRun | null;
  /** Runs the automated participant now (no-op while a run is in flight). */
  retry(): void;
}

export const SessionAutomationContext = createContext<SessionAutomationState | null>(null);

/** Automation of the session shown by SessionHost; `null` outside SessionHost (= "no automation"). */
export function useSessionAutomation(): SessionAutomationState | null {
  return useContext(SessionAutomationContext);
}
