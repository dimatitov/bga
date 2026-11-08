import type { PlayerView } from '@swr/contracts';
import { create } from 'zustand';

export type Selection =
  { kind: 'none' } | { kind: 'system'; systemId: string } | { kind: 'piece'; pieceId: string };

export type SidebarTab = 'log' | 'objects' | 'game';

export const NO_SELECTION: Selection = { kind: 'none' };

interface SelectionState {
  gameId: string | null;
  selection: Selection;
  sidebarTab: SidebarTab;
  selectSystem(systemId: string): void;
  selectPiece(pieceId: string): void;
  clearSelection(): void;
  setSidebarTab(tab: SidebarTab): void;
  /** Resets the selection when the game changes (sidebar tab is kept for the browser-tab session, D-L-5). */
  activateGame(gameId: string): void;
  /** Drops the selection if the selected system/piece no longer exists in `view`. */
  reconcile(view: Pick<PlayerView, 'systems' | 'pieces'>): void;
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  gameId: null,
  selection: NO_SELECTION,
  sidebarTab: 'log',
  selectSystem: (systemId) => {
    const s = get().selection;
    if (s.kind === 'system' && s.systemId === systemId) return;
    set({ selection: { kind: 'system', systemId } });
  },
  selectPiece: (pieceId) => {
    const s = get().selection;
    if (s.kind === 'piece' && s.pieceId === pieceId) return;
    set({ selection: { kind: 'piece', pieceId } });
  },
  clearSelection: () => {
    if (get().selection.kind !== 'none') set({ selection: NO_SELECTION });
  },
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  activateGame: (gameId) => {
    if (get().gameId !== gameId) set({ gameId, selection: NO_SELECTION });
  },
  reconcile: (view) => {
    const s = get().selection;
    const exists =
      s.kind === 'none' ||
      (s.kind === 'system' && view.systems.some((x) => x.id === s.systemId)) ||
      (s.kind === 'piece' && view.pieces.some((x) => x.id === s.pieceId));
    if (!exists) set({ selection: NO_SELECTION });
  },
}));
