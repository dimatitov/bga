import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Opt-in switch of the dev AI decision panel on the game table (SWR-008 plan-frontend §2.1 G-2, QD-15). Lives only in
 * the lazy dev chunk; off by default. Value: `{"state":{"enabled":true},"version":1}` (this browser only).
 */
export const DEV_AI_TABLE_DIAGNOSTICS_KEY = 'bga.dev.aiTableDiagnostics.v1';

export interface DevAiTableDiagnosticsState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useDevAiTableDiagnostics = create<DevAiTableDiagnosticsState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: DEV_AI_TABLE_DIAGNOSTICS_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ enabled: s.enabled }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DevAiTableDiagnosticsState>;
        return { ...current, enabled: p.enabled === true };
      },
    },
  ),
);

/** Test helper: back to «off» (the in-memory store survives `localStorage.clear()`, RF-3). */
export function resetDevAiTableDiagnostics(): void {
  useDevAiTableDiagnostics.setState({ enabled: false });
}
