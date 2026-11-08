/**
 * Test harness of the `core-v1` turn panels (P1, test-only): the session envelope lives in a real TanStack cache
 * (`sessionKeys.detail`), the real `useSendCommand` posts through `mockFetch`, and the rendered view follows the
 * cache exactly like `SessionHost` → `CoreTable` (the cache changes only with server responses).
 */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import type { ReactNode } from 'react';
import { sessionKeys } from '@/platform';
import { resetFeedbackStore } from '@/shared/feedback';
import {
  createTestQueryClient,
  mockFetch,
  renderWithProviders,
  type MockHandler,
} from '@/shared/test';
import { useSelectionStore } from '../../../board/model/selectionStore';
import { CORE_SESSION_ID, makeCoreSession } from '../../../test/coreFixtures';
import { useCoreUiStore } from '../../model/coreUiStore';
import { useTurnErrorStore } from '../turnErrorStore';
import { CoreHarness } from './CoreHarness';

export const CMD_PATH = `POST /api/sessions/${CORE_SESSION_ID}/commands`;

export function resetCoreStores() {
  useCoreUiStore.getState().reset();
  useTurnErrorStore.getState().clear();
  useSelectionStore.setState({ gameId: null, selection: { kind: 'none' }, sidebarTab: 'log' });
  resetFeedbackStore();
}

/** Renders `ui` inside the harness with `view` in the cache; `routes` mock the API (commands). */
export function renderCore(
  ui: ReactNode,
  view: PlayerViewCore,
  routes: Record<string, MockHandler> = {},
) {
  const api = mockFetch(routes);
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKeys.detail(CORE_SESSION_ID), makeCoreSession(view));
  const utils = renderWithProviders({ element: <CoreHarness>{ui}</CoreHarness>, queryClient });
  return { ...utils, api };
}

export const ok = (view: PlayerViewCore, events: unknown[] = []) => ({
  status: 200,
  body: { ok: true, view, events },
});

export const rejected = (messageKey: string, code = 'ILLEGAL_COMMAND') => ({
  status: 422,
  body: { ok: false, error: { code, messageKey } },
});

/** Bodies of the recorded command requests. */
export function commandsOf(requests: { method: string; path: string; body: unknown }[]) {
  return requests
    .filter((r) => r.method === 'POST' && r.path.endsWith('/commands'))
    .map((r) => (r.body as { command: unknown }).command);
}
