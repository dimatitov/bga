/**
 * The one way a new state of an existing session is written (SWR-006 plan-backend §6.1), shared by the human command
 * pipeline and the automation runner: `setupOf` (review #1), `statusOf` (SWR-005, AM-BE-1), the events of the step and
 * the optimistic version guard (`expectedVersion = version(previous)`), all in one transaction.
 */
import {
  SessionStatusSchema,
  type ServerGameModule,
  type SessionEventRecord,
  type SessionStatus,
} from '@bga/platform';
import type { CommitOutcome, SessionsRepository } from './sessions.repository';

/** `module.statusOf(state)` as a `SessionStatus`, or `null` when the module returned something else (server bug). */
export function statusAfter(module: ServerGameModule, state: unknown): SessionStatus | null {
  const parsed = SessionStatusSchema.safeParse(module.statusOf(state));
  return parsed.success ? parsed.data : null;
}

export interface StateWrite {
  sessionId: string;
  module: ServerGameModule;
  previous: unknown;
  next: unknown;
  status: SessionStatus;
  events: readonly SessionEventRecord[];
  now: string;
}

export function commitState(repo: SessionsRepository, w: StateWrite): Promise<CommitOutcome> {
  return repo.commit({
    id: w.sessionId,
    expectedVersion: w.module.version(w.previous),
    setup: JSON.stringify(w.module.setupOf(w.next)),
    state: JSON.stringify(w.next),
    version: w.module.version(w.next),
    status: w.status,
    events: w.events,
    now: w.now,
  });
}
