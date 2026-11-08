import type { PlayerViewCore, PlayerViewMock } from '@bga/game-rebellion/schema';
import { create } from 'zustand';

/**
 * What is selected on the table (shared by the map, the list and the panels). `leader` and `zone` (the hidden
 * rebel-base zone) exist only on the `core-v1` table (SWR-005 plan-frontend §3.2); a `piece` there is a unit.
 */
export type Selection =
  | { kind: 'none' }
  | { kind: 'system'; systemId: string }
  | { kind: 'piece'; pieceId: string }
  | { kind: 'leader'; leaderId: string }
  | { kind: 'zone' };

/** Views the selection can be reconciled against (either engine). */
export type ReconcilableView =
  | Pick<PlayerViewMock, 'systems' | 'pieces'>
  | Pick<PlayerViewCore, 'map' | 'units' | 'leaders' | 'rebelBase'>;

export type SidebarTab = 'log' | 'objects' | 'game';

export const NO_SELECTION: Selection = { kind: 'none' };

interface SelectionState {
  gameId: string | null;
  selection: Selection;
  sidebarTab: SidebarTab;
  selectSystem(systemId: string): void;
  selectPiece(pieceId: string): void;
  selectLeader(leaderId: string): void;
  /** Selects the hidden rebel-base zone (core-v1, Empire before the reveal). */
  selectZone(): void;
  clearSelection(): void;
  setSidebarTab(tab: SidebarTab): void;
  /** Resets the selection when the game changes (sidebar tab is kept for the browser-tab session, D-L-5). */
  activateGame(gameId: string): void;
  /** Drops the selection if the selected system/piece/leader/zone no longer exists in `view`. */
  reconcile(view: ReconcilableView): void;
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
  selectLeader: (leaderId) => {
    const s = get().selection;
    if (s.kind === 'leader' && s.leaderId === leaderId) return;
    set({ selection: { kind: 'leader', leaderId } });
  },
  selectZone: () => {
    if (get().selection.kind !== 'zone') set({ selection: { kind: 'zone' } });
  },
  clearSelection: () => {
    if (get().selection.kind !== 'none') set({ selection: NO_SELECTION });
  },
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  activateGame: (gameId) => {
    if (get().gameId !== gameId) set({ gameId, selection: NO_SELECTION });
  },
  reconcile: (view) => {
    if (!selectionExists(get().selection, view)) set({ selection: NO_SELECTION });
  },
}));

function selectionExists(s: Selection, view: ReconcilableView): boolean {
  if (s.kind === 'none') return true;
  if ('units' in view) {
    // core-v1: units / leaders / the hidden zone (present only while the server hides the base system).
    switch (s.kind) {
      case 'system':
        return view.map.systems.some((x) => x.id === s.systemId);
      case 'piece':
        return view.units.some((x) => x.id === s.pieceId);
      case 'leader':
        return view.leaders.some((x) => x.id === s.leaderId);
      case 'zone':
        return view.rebelBase.systemId === null;
    }
  }
  if (s.kind === 'system') return view.systems.some((x) => x.id === s.systemId);
  if (s.kind === 'piece') return view.pieces.some((x) => x.id === s.pieceId);
  return false;
}
