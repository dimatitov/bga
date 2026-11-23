import { create } from 'zustand';

/**
 * Inline rejection text of the Physical Execution module (plan-frontend §4.3: 422 → `table-task-error` under the head
 * task). Tagged with the task it belongs to, so a new head never shows the error of the previous one. Already
 * translated; UI-only, never a copy of server state.
 */
interface TableErrorState {
  taskId: string | null;
  text: string | null;
  set(taskId: string | null, text: string): void;
  clear(): void;
}

export const useTableErrorStore = create<TableErrorState>()((set) => ({
  taskId: null,
  text: null,
  set: (taskId, text) => set({ taskId, text }),
  clear: () => set({ taskId: null, text: null }),
}));
