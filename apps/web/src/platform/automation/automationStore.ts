import type { AutomationRunSummary } from '@bga/platform';
import { create } from 'zustand';

/**
 * Client state of the automated participant of the CURRENT session (SWR-006 plan-frontend §3.1). Server data
 * (`pending`, `strategy`, `view`) stays in the TanStack Query cache; this store only keeps what the client does:
 * whether a run is in flight, its last error, the last automated summary and whether an automatic run is allowed.
 * Module-level on purpose: the in-flight guard survives StrictMode double effects and double clicks.
 */
export type AutomationPhase = 'idle' | 'running' | 'error' | 'stalled';

export type AutomationSource = 'command' | 'run';

export interface AutomationLastRun {
  source: AutomationSource;
  summary: AutomationRunSummary;
  /** The game's events of that response (opaque to the platform). */
  events: unknown[];
  /** Increases on every recorded summary (games announce a new one once). */
  seq: number;
}

export interface AutomationStoreState {
  /** Session the state belongs to (`null` — no SessionHost mounted). */
  sessionId: string | null;
  phase: AutomationPhase;
  /** The failure of the last run (`phase === 'error'`). */
  error: unknown;
  lastRun: AutomationLastRun | null;
  /** One automatic run is allowed (armed by a load or a command response, Q-FE-1). */
  autoRunArmed: boolean;
  /**
   * A GET of the session finished; becomes `autoRunArmed` only once its data is in the cache (SessionHost sees the
   * new `dataUpdatedAt`) — arming earlier would let the driver act on the previous, possibly `pending`, data.
   */
  loadArmPending: boolean;
  seq: number;
}

const INITIAL: AutomationStoreState = {
  sessionId: null,
  phase: 'idle',
  error: null,
  lastRun: null,
  autoRunArmed: false,
  loadArmPending: false,
  seq: 0,
};

export const useAutomationStore = create<AutomationStoreState>()(() => ({ ...INITIAL }));

/** SessionHost mounted for `sessionId` (a new load): fresh state, one automatic run allowed. */
export function resetAutomation(sessionId: string): void {
  useAutomationStore.setState({ ...INITIAL, sessionId, autoRunArmed: true });
}

/** A load (GET) of `sessionId` returned data (called by the query function; ignored for another session). */
export function noteSessionLoaded(sessionId: string): void {
  const s = useAutomationStore.getState();
  if (s.sessionId === sessionId && !s.loadArmPending) {
    useAutomationStore.setState({ loadArmPending: true });
  }
}

/** The loaded data reached the cache: a noted load arms one automatic run. */
export function promoteLoadArm(sessionId: string): void {
  const s = useAutomationStore.getState();
  if (s.sessionId !== sessionId || !s.loadArmPending) return;
  useAutomationStore.setState({ loadArmPending: false, autoRunArmed: true });
}

/** Atomically takes the armed automatic run; `true` when it was armed (StrictMode-safe: second call → false). */
export function consumeAutomationArm(sessionId: string): boolean {
  const s = useAutomationStore.getState();
  if (s.sessionId !== sessionId || !s.autoRunArmed) return false;
  useAutomationStore.setState({ autoRunArmed: false });
  return true;
}

/** Updates the state only when it still belongs to `sessionId` (a late response of another session is ignored). */
export function updateAutomation(
  sessionId: string,
  update: (s: AutomationStoreState) => Partial<AutomationStoreState>,
): void {
  const s = useAutomationStore.getState();
  if (s.sessionId !== sessionId) return;
  useAutomationStore.setState(update(s));
}

/** Test helper: back to the initial state. */
export function resetAutomationStore(): void {
  useAutomationStore.setState({ ...INITIAL });
}
