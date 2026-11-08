import {
  CommandErrSchema,
  IDEMPOTENCY_KEY_HEADER,
  ListSessionsResponseSchema,
  SessionCommandOkSchema,
  type SessionSettings,
  type SessionStatus,
  type SessionSummary,
  SessionResponseSchema,
} from '@bga/platform';
import { parseBody, requestJson, requestRaw, toApiError } from '@/shared/api/http';

/**
 * Platform sessions API client (spec "HTTP API", plan-frontend §3). Every response is validated by the
 * `@bga/platform` frame schema; the game's `view` stays `unknown` (the game parses it with its own schema).
 */
export interface CallOptions {
  signal?: AbortSignal;
}

/**
 * `POST /api/sessions` (201, or 200 on an idempotent replay) and `GET /api/sessions/:id` (SWR-004 AM-FE-3).
 * `status` is the platform lifecycle status; `settings` are the game's public settings — opaque to the platform
 * (kept in the `detail` cache, the game reads its own settings from its view).
 */
export interface SessionEnvelope {
  sessionId: string;
  gameId: string;
  status: SessionStatus;
  settings: SessionSettings;
  view: unknown;
}

export interface CreateSessionOptions extends CallOptions {
  /** Sent as `Idempotency-Key` (UUID, one per submit attempt — `useCreateSession`, Q-5). Omitted → no header. */
  idempotencyKey?: string;
}

/** Frame of `POST /api/sessions/:id/commands`; the game narrows `view`/`events` with its own schema. */
export type SessionCommandResult =
  | { ok: true; view: unknown; events: unknown[] }
  | { ok: false; error: { code: string; messageKey: string; details?: unknown } };

export interface CreateSessionInput {
  gameId: string;
  setup: unknown;
}

/**
 * `POST /api/sessions { gameId, setup }` [+ `Idempotency-Key`] → `{ sessionId, gameId, status, settings, view }`.
 * 201 (created) and 200 (`Idempotent-Replay: true`, Q-1) are handled the same way.
 * 404 `errors.gameNotFound` / 422 `GAME_UNAVAILABLE` | `SETUP_UNSUPPORTED` / 400 / 409 `IDEMPOTENCY_KEY_REUSED`
 * → throws `ApiError` (UI shows it by `messageKey`).
 */
export function createSession(
  input: CreateSessionInput,
  options: CreateSessionOptions = {},
): Promise<SessionEnvelope> {
  return requestJson('/sessions', SessionResponseSchema, {
    method: 'POST',
    body: { gameId: input.gameId, setup: input.setup },
    signal: options.signal,
    ...(options.idempotencyKey === undefined
      ? {}
      : { headers: { [IDEMPOTENCY_KEY_HEADER]: options.idempotencyKey } }),
  });
}

export interface ListSessionsParams {
  /** Filter by game; omitted → sessions of all games. */
  gameId?: string;
}

/** `GET /api/sessions[?gameId=<id>]` → summaries, server order `updatedAt` desc (max 20). */
export function listSessions(
  params: ListSessionsParams = {},
  options: CallOptions = {},
): Promise<SessionSummary[]> {
  const query = params.gameId === undefined ? '' : `?gameId=${encodeURIComponent(params.gameId)}`;
  return requestJson(`/sessions${query}`, ListSessionsResponseSchema, { signal: options.signal });
}

/** `GET /api/sessions/:id` → envelope; 404 → `ApiError{status:404}`; 422 `GAME_UNAVAILABLE` (Q-7) → `ApiError`. */
export function getSession(sessionId: string, options: CallOptions = {}): Promise<SessionEnvelope> {
  return requestJson(`/sessions/${encodeURIComponent(sessionId)}`, SessionResponseSchema, {
    signal: options.signal,
  });
}

/** Statuses whose `{ ok:false, error }` body is a command result the game handles (not thrown). */
const HANDLED_COMMAND_STATUSES = new Set([400, 404, 409, 422]);

/**
 * `POST /api/sessions/:id/commands` with the game's envelope (`{ actor, expectedVersion, command }`).
 * Does NOT throw for 400/404/409/422 with `{ ok:false, error }`; throws `ApiError` for network, 5xx and
 * unparseable bodies (as SWR-002 `postCommand`).
 */
export async function postSessionCommand(
  sessionId: string,
  envelope: unknown,
  options: CallOptions = {},
): Promise<SessionCommandResult> {
  const raw = await requestRaw(`/sessions/${encodeURIComponent(sessionId)}/commands`, {
    method: 'POST',
    body: envelope,
    signal: options.signal,
  });
  if (raw.ok) return parseBody(raw, SessionCommandOkSchema);
  if (HANDLED_COMMAND_STATUSES.has(raw.status)) {
    const err = CommandErrSchema.safeParse(raw.body);
    if (err.success) return err.data;
  }
  throw toApiError(raw);
}
