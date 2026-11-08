/**
 * `window.__boardDebug` (R-11, plan-frontend §6.3). Read-only: returns copies, cannot change game state.
 * Loaded only via dynamic import from `useBoardDebug` under `DEV || VITE_E2E === '1'`.
 */
import type { PlayerViewMock } from '@bga/game-rebellion/schema';
import type { MapPoint } from '@bga/game-rebellion/board';
import type { BoardLayout } from '../model/boardLayout';
import { MAX_SCALE } from '../model/constants';
import { useDragStore } from '../model/dragStore';
import { worldToScreen } from '../model/geometry';
import { highlightedSystemIds } from '../model/legal';
import { useSelectionStore } from '../model/selectionStore';
import { useViewportStore } from '../model/viewportStore';

export interface BoardDebug {
  getViewport(): { scale: number; x: number; y: number };
  getZoomLimits(): { min: number; max: number };
  getSystemScreenPos(systemId: string): { x: number; y: number } | null;
  getPieceScreenPos(pieceId: string): { x: number; y: number } | null;
  getSelection(): { kind: 'system' | 'piece' | null; id: string | null };
  getHighlightedSystemIds(): string[];
  isDragging(): boolean;
}

declare global {
  interface Window {
    __boardDebug?: BoardDebug;
  }
}

export interface BoardDebugContext {
  container: HTMLElement | null;
  layout: BoardLayout;
  view: PlayerViewMock;
}

export function installBoardDebug(get: () => BoardDebugContext): () => void {
  const toPage = (world: MapPoint | undefined) => {
    const { container } = get();
    if (!world || !container) return null;
    const rect = container.getBoundingClientRect();
    const p = worldToScreen(useViewportStore.getState().viewport, world);
    return { x: rect.left + p.x + window.scrollX, y: rect.top + p.y + window.scrollY };
  };
  const api: BoardDebug = {
    getViewport: () => ({ ...useViewportStore.getState().viewport }),
    getZoomLimits: () => ({ min: useViewportStore.getState().minScale, max: MAX_SCALE }),
    getSystemScreenPos: (id) => toPage(get().layout.centers.get(id)),
    getPieceScreenPos: (id) => toPage(get().layout.slots.get(id)),
    getSelection: () => {
      const s = useSelectionStore.getState().selection;
      if (s.kind === 'system') return { kind: 'system', id: s.systemId };
      if (s.kind === 'piece') return { kind: 'piece', id: s.pieceId };
      return { kind: null, id: null };
    },
    getHighlightedSystemIds: () =>
      highlightedSystemIds(
        get().view,
        useSelectionStore.getState().selection,
        useDragStore.getState().drag,
      ),
    isDragging: () => useDragStore.getState().drag !== null,
  };
  window.__boardDebug = api;
  return () => {
    if (window.__boardDebug === api) delete window.__boardDebug;
  };
}
