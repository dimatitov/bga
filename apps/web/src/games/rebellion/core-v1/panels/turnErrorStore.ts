import { create } from 'zustand';

/**
 * Inline rejection texts of the turn panel (plan-frontend §5.3: 422 → text next to the control, the draft is kept).
 * Shared because the same command may come from the panel, the board list or the map (click / drop / drag).
 * Already translated; UI-only, never a copy of server state.
 */
interface TurnErrorState {
  activation: string | null;
  move: Readonly<Record<string, string>>;
  setActivation(text: string | null): void;
  setMove(fromSystemId: string, text: string | null): void;
  clear(): void;
}

export const useTurnErrorStore = create<TurnErrorState>()((set, get) => ({
  activation: null,
  move: {},
  setActivation: (activation) => {
    if (get().activation !== activation) set({ activation });
  },
  setMove: (from, text) => {
    const move = { ...get().move };
    if (text === null) {
      if (!(from in move)) return;
      delete move[from];
    } else move[from] = text;
    set({ move });
  },
  clear: () => {
    const s = get();
    if (s.activation !== null || Object.keys(s.move).length > 0)
      set({ activation: null, move: {} });
  },
}));
