/** Test-only provider of the `core-v1` panels: the view follows the TanStack session cache (see `harness.tsx`). */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
// Test-only: the platform provides this context in SessionHost; here a test supplies the automation state.
import {
  SessionAutomationContext,
  sessionKeys,
  type SessionAutomationState,
  type SessionEnvelope,
} from '@/platform';
import { useSendCommand } from '../../../table/hooks/useSendCommand';
import { CORE_SESSION_ID } from '../../../test/coreFixtures';
import { coreAutomationFlags } from '../../model/aiCommander';
import { CoreBoardContext, type CoreBoardContextValue } from '../../model/coreContext';
import { useCoreUiStore } from '../../model/coreUiStore';

/**
 * `automation` — the session automation as `useSessionAutomation()` returns it (`null`/absent = outside
 * SessionHost); `isPending` / `aiThinking` are derived from it exactly like `CoreTable` does.
 */
export function CoreHarness({
  children,
  automation = null,
}: {
  children: ReactNode;
  automation?: SessionAutomationState | null;
}) {
  const qc = useQueryClient();
  const key = sessionKeys.detail(CORE_SESSION_ID);
  const [env, setEnv] = useState(() => qc.getQueryData<SessionEnvelope>(key));
  useEffect(
    () => qc.getQueryCache().subscribe(() => setEnv(qc.getQueryData<SessionEnvelope>(key))),
    [qc, key],
  );
  const { send, isPending: sending, pendingCommand } = useSendCommand(CORE_SESSION_ID);
  const view = env?.view as PlayerViewCore | undefined;
  const reconcile = useCoreUiStore((s) => s.reconcile);
  useEffect(() => {
    if (view?.kind === 'player') reconcile(view);
  }, [view, reconcile]);
  const value = useMemo<CoreBoardContextValue | null>(() => {
    if (!view) return null;
    const flags = coreAutomationFlags(view.settings, automation?.phase, sending, pendingCommand);
    return { sessionId: CORE_SESSION_ID, view, send, ...flags };
  }, [view, send, sending, pendingCommand, automation]);
  if (!value || value.view.kind !== 'player') return null;
  return (
    <SessionAutomationContext value={automation}>
      <CoreBoardContext.Provider value={value}>{children}</CoreBoardContext.Provider>
    </SessionAutomationContext>
  );
}
