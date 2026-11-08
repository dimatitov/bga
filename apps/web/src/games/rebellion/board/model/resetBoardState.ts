import { useDragStore } from './dragStore';
import { NO_SELECTION, useSelectionStore } from './selectionStore';
import { useViewportStore } from './viewportStore';

/**
 * Clears everything the board remembers about a session (hot-seat handoff, SWR-004 plan-frontend §5.3 step 2):
 * selection (and the active game, so the next table starts from "nothing selected"), drag / pending move, and the
 * remembered viewport (the next table fits the map). The sidebar tab is kept — it is not secret.
 */
export function resetBoardState(sessionId: string): void {
  useSelectionStore.setState({ gameId: null, selection: NO_SELECTION });
  useDragStore.getState().clear();
  useViewportStore.getState().forget(sessionId);
}
