import { create } from 'zustand';

export type FeedbackSeverity = 'success' | 'info' | 'warning' | 'error';

export interface FeedbackAction {
  label: string;
  onClick: () => void;
}

export interface Notification {
  severity: FeedbackSeverity;
  /** Already translated text. */
  message: string;
  action?: FeedbackAction;
}

export interface QueuedNotification extends Notification {
  id: number;
}

export interface LiveMessage {
  id: number;
  text: string;
}

interface FeedbackState {
  queue: QueuedNotification[];
  live: LiveMessage | null;
}

let nextId = 1;

export const useFeedbackStore = create<FeedbackState>()(() => ({ queue: [], live: null }));

/** Snackbar + the same text in the aria-live region (plan-frontend §3.2, frozen). */
export function notify(n: Notification): void {
  const id = nextId++;
  useFeedbackStore.setState((s) => ({
    queue: [...s.queue, { ...n, id }],
    live: { id, text: n.message },
  }));
}

/** aria-live only, no snackbar. */
export function announce(message: string): void {
  const id = nextId++;
  useFeedbackStore.setState({ live: { id, text: message } });
}

/** Removes the notification currently shown (called by FeedbackHost). */
export function dismissNotification(id: number): void {
  useFeedbackStore.setState((s) => ({ queue: s.queue.filter((n) => n.id !== id) }));
}

/** Test helper. */
export function resetFeedbackStore(): void {
  useFeedbackStore.setState({ queue: [], live: null });
}
