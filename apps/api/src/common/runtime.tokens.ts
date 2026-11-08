import { randomUUID } from 'node:crypto';

/** Source of "now" (ISO-8601). Overridable through `createApp({ clock })` for deterministic tests. */
export interface Clock {
  now(): string;
}

/** Source of new game ids. Overridable through `createApp({ idGenerator })`. */
export interface IdGenerator {
  gameId(): string;
}

export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const SCENARIO = Symbol('SCENARIO');

export const systemClock: Clock = { now: () => new Date().toISOString() };
export const uuidGenerator: IdGenerator = { gameId: () => randomUUID() };
