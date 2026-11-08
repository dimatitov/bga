/** Test-only provider of the `core-v1` panels: the view follows the TanStack session cache (see `harness.tsx`). */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { sessionKeys, type SessionEnvelope } from '@/platform';
import { useSendCommand } from '../../../table/hooks/useSendCommand';
import { CORE_SESSION_ID } from '../../../test/coreFixtures';
import { CoreBoardContext } from '../../model/coreContext';
import { useCoreUiStore } from '../../model/coreUiStore';

export function CoreHarness({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const key = sessionKeys.detail(CORE_SESSION_ID);
  const [env, setEnv] = useState(() => qc.getQueryData<SessionEnvelope>(key));
  useEffect(
    () => qc.getQueryCache().subscribe(() => setEnv(qc.getQueryData<SessionEnvelope>(key))),
    [qc, key],
  );
  const { send, isPending } = useSendCommand(CORE_SESSION_ID);
  const view = env?.view as PlayerViewCore | undefined;
  const reconcile = useCoreUiStore((s) => s.reconcile);
  useEffect(() => {
    if (view?.kind === 'player') reconcile(view);
  }, [view, reconcile]);
  const value = useMemo(
    () => (view ? { sessionId: CORE_SESSION_ID, view, send, isPending } : null),
    [view, send, isPending],
  );
  if (!value || value.view.kind !== 'player') return null;
  return <CoreBoardContext.Provider value={value}>{children}</CoreBoardContext.Provider>;
}
