/**
 * SWR-010 FE-A (plan-frontend §3.1): local UI state of the Card Hand — only which card is open in Card Detail.
 * Never a copy of the view: `reconcile` drops the selection when the card is no longer visible to the viewer in that
 * zone (it moved, the hot-seat viewer changed, another session opened).
 */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { create } from 'zustand';
import { handModel, visibleCards } from './handModel';

export interface CardSelection {
  definitionId: string;
  zoneId: string;
}

export interface CardUiState {
  sessionId: string | null;
  selected: CardSelection | null;
  select(definitionId: string, zoneId: string): void;
  clear(): void;
  reconcile(view: PlayerViewCore, sessionId: string): void;
}

export const useCardUiStore = create<CardUiState>()((set, get) => ({
  sessionId: null,
  selected: null,
  select: (definitionId, zoneId) => set({ selected: { definitionId, zoneId } }),
  clear: () => set({ selected: null }),
  reconcile: (view, sessionId) => {
    const { sessionId: current, selected } = get();
    if (current !== sessionId) {
      set({ sessionId, selected: null });
      return;
    }
    if (selected === null) return;
    const still = visibleCards(handModel(view)).some(
      (c) => c.definitionId === selected.definitionId && c.zone.id === selected.zoneId,
    );
    if (!still) set({ selected: null });
  },
}));

/** Test helper / session reset. */
export function resetCardUiStore(): void {
  useCardUiStore.setState({ sessionId: null, selected: null });
}
