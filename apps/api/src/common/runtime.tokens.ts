import { randomUUID } from 'node:crypto';

/** Source of "now" (ISO-8601). Overridable through `createApp({ clock })` for deterministic tests. */
export interface Clock {
  now(): string;
}

/** Source of new session ids. Overridable through `createApp({ idGenerator })`. */
export interface IdGenerator {
  sessionId(): string;
}

export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');

export const wallClock: Clock = { now: () => new Date().toISOString() };
export const uuidGenerator: IdGenerator = { sessionId: () => randomUUID() };
