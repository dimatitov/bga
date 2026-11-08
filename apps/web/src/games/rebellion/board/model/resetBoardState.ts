import { useCoreUiStore } from '../../core-v1/model/coreUiStore';
import { useDragStore } from './dragStore';
import { NO_SELECTION, useSelectionStore } from './selectionStore';
import { useViewportStore } from './viewportStore';

/**
 * Clears everything the board remembers about a session (hot-seat handoff, SWR-004 plan-frontend §5.3 step 2):
 * selection (and the active game, so the next table starts from "nothing selected"), drag / pending move, the
 * remembered viewport (the next table fits the map) and the `core-v1` turn-flow state (armed leader, move draft;
 * SWR-005 plan-frontend §3.2). The sidebar tab is kept — it is not secret.
 */
export function resetBoardState(sessionId: string): void {
  useSelectionStore.setState({ gameId: null, selection: NO_SELECTION });
  useDragStore.getState().clear();
  useViewportStore.getState().forget(sessionId);
  useCoreUiStore.getState().reset();
}
