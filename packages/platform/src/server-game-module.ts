/**
 * Server side of a game, as seen by the game-independent session service (SWR-003 plan-backend §2.1, AM-2).
 * Types only (+ an identity helper). Nothing here knows game concepts.
 *
 * Methods use METHOD syntax on purpose: method parameters are bivariant, so a concrete
 * `ServerGameModule<MyState, MySetup, MyEvent>` is assignable to `ServerGameModule` (unknowns) in the
 * registry without `any`. Do NOT enable `@typescript-eslint/method-signature-style: property` here.
 */
import type { GameModuleError } from './errors';
import type { GameDefinition } from './game';
import type { SessionDetails, SessionSettings, SessionStatus } from './sessions';
import type { ValidationIssue } from './validation';

export interface CreateSessionContext {
  sessionId: string;
  /** ISO-8601; the module is deterministic and never reads the clock itself. */
  now: string;
}

export interface ApplyCommandContext {
  /** ISO-8601. */
  now: string;
}

/** Minimal event shape the service stores in `SessionEvent` (append-only mirror of the game log). */
export interface SessionEventRecord {
  seq: number;
  type: string;
  actor: string;
  at: string;
  payload: unknown;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

/**
 * Result of `ServerGameModule.parseSetup` (SWR-004, AM-BE-3). Schema problems come first:
 * - `invalid` → 400 VALIDATION; `issues` paths are relative to `setup` (the service prefixes `['setup']`);
 * - `unsupported` → 422 SETUP_UNSUPPORTED; `messageKey` is the game's `errors.<name>` key (or
 *   `ERROR_MESSAGE_KEYS.setupUnsupported`), `details` only echo request fields (never hidden data).
 */
export type SetupParseResult<Setup> =
  | { ok: true; value: Setup }
  | { ok: false; kind: 'invalid'; issues: ValidationIssue[] }
  | { ok: false; kind: 'unsupported'; messageKey: string; details?: unknown };

/** What the session service knows about a session when it asks for a view (status = `Session.status`). */
export interface ViewContext {
  status: SessionStatus;
}

export type ApplyCommandResult<State, Event> =
  { ok: true; state: State; events: Event[] } | { ok: false; error: GameModuleError };

/** State and setup must be JSON-serialisable (stored as JSON text). */
export interface ServerGameModule<
  State = unknown,
  Setup = unknown,
  Event extends SessionEventRecord = SessionEventRecord,
> {
  /** `status` must be 'available' (checked by the registry at start-up). */
  readonly definition: GameDefinition;
  /**
   * Client setup → setup to store (defaults applied). Schema first (`invalid` → 400), then support
   * (`unsupported` → 422 SETUP_UNSUPPORTED). Never throws for client input.
   */
  parseSetup(input: unknown): SetupParseResult<Setup>;
  /** `Session.setup` of any stored version (already JSON.parse'd) → current setup; corrupt → throw (500). */
  parseStoredSetup(raw: unknown): Setup;
  /** Status of a new session (stored in `Session.status`). */
  initialStatus(setup: Setup): SessionStatus;
  /**
   * Status after an accepted command (SWR-005, AM-BE-1): the session service writes it to `Session.status`
   * in the same commit as the state. Pure; the platform never interprets game data.
   */
  statusOf(state: State): SessionStatus;
  /** Public settings for the session envelope (`SessionResponse.settings`); nothing secret (Q-24). */
  publicSettings(setup: Setup): SessionSettings;
  /**
   * New session: version ≥ 1 (the game may apply automatic moves on creation, AM-BE-2);
   * `events` are the initial events (seq ≥ 1) for `SessionEvent`.
   */
  createInitialState(setup: Setup, ctx: CreateSessionContext): { state: State; events: Event[] };
  /**
   * The setup a state was created with, in the CURRENT stored form (review #1: single source of settings).
   * The session service rewrites `Session.setup` with it whenever the state is written, and checks
   * `publicSettings(parseStoredSetup(Session.setup))` against `publicSettings(setupOf(state))` on read
   * (mismatch → 500 INTERNAL). Pure; never throws for a parsed state.
   */
  setupOf(state: State): Setup;
  /** Snapshot from the DB (already JSON.parse'd). Schema/version/id mismatch → throw (500 INTERNAL). */
  parseState(raw: unknown, expected: { sessionId: string; version: number }): State;
  version(state: State): number;
  /** Order inside: 400 (game envelope schema) → 409 (expectedVersion) → 422 (rules). Never mutates input. */
  applyCommand(
    state: State,
    envelope: unknown,
    ctx: ApplyCommandContext,
  ): ApplyCommandResult<State, Event>;
  /** Only what the current viewer may see (validated by the game's view schema). */
  toPlayerView(state: State, ctx: ViewContext): unknown;
  /** Events of one command, filtered for the same viewer. */
  toPlayerEvents(events: readonly Event[], state: State): unknown[];
  /** Flat, NON-secret fields for session lists (`SessionSummary.details`; `null` allowed, Q-20). */
  summarize(state: State): SessionDetails;
}

/** Type-checks a concrete module and widens it for the registry (`readonly ServerGameModule[]`). */
export function defineServerGameModule<State, Setup, Event extends SessionEventRecord>(
  module: ServerGameModule<State, Setup, Event>,
): ServerGameModule {
  return module as unknown as ServerGameModule;
}
