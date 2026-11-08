import type Konva from 'konva';
import { create } from 'zustand';

export type OverState = 'legal' | 'illegal' | 'none';

export interface DragState {
  pieceId: string;
  fromSystemId: string;
  overSystemId: string | null;
  overState: OverState;
}

export interface PendingMove {
  pieceIds: string[];
  fromSystemId: string;
  toSystemId: string;
}

interface DragStoreState {
  drag: DragState | null;
  pendingMove: PendingMove | null;
  start(pieceId: string, fromSystemId: string): void;
  over(overSystemId: string | null, overState: OverState): void;
  endDrag(): void;
  setPending(move: PendingMove | null): void;
  clear(): void;
}

export const useDragStore = create<DragStoreState>()((set, get) => ({
  drag: null,
  pendingMove: null,
  start: (pieceId, fromSystemId) =>
    set({ drag: { pieceId, fromSystemId, overSystemId: null, overState: 'none' } }),
  over: (overSystemId, overState) => {
    const d = get().drag;
    if (!d || (d.overSystemId === overSystemId && d.overState === overState)) return;
    set({ drag: { ...d, overSystemId, overState } });
  },
  endDrag: () => set({ drag: null }),
  setPending: (pendingMove) => set({ pendingMove }),
  clear: () => set({ drag: null, pendingMove: null }),
}));

/** The Konva node being dragged right now (non-reactive; used by Esc to cancel a drag). */
export const activeDragNode: { current: Konva.Node | null } = { current: null };
