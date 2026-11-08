import {
  type CommandEnvelope,
  type CommandResult,
  CommandErrSchema,
  CommandResultSchema,
  CreateGameResponseSchema,
  type GameSetupInput,
  type GameSummary,
  ListGamesResponseSchema,
  type PlayerView,
  PlayerViewSchema,
} from '@swr/contracts';
import { parseBody, requestJson, requestRaw, toApiError } from './http';

export interface CallOptions {
  signal?: AbortSignal;
}

/** `POST /api/games` → `{ gameId, view }` (view for `setup.humanFaction`, A-3/A-4). */
export function createGame(
  setup: GameSetupInput,
  options: CallOptions = {},
): Promise<{ gameId: string; view: PlayerView }> {
  return requestJson('/games', CreateGameResponseSchema, {
    method: 'POST',
    body: setup,
    signal: options.signal,
  });
}

/** `GET /api/games` → summaries ordered by `updatedAt` desc (A-18). */
export function listGames(options: CallOptions = {}): Promise<GameSummary[]> {
  return requestJson('/games', ListGamesResponseSchema, { signal: options.signal });
}

/** `GET /api/games/:id` → `PlayerView`; 404 → throws `ApiError{status:404}`. */
export function getGameView(gameId: string, options: CallOptions = {}): Promise<PlayerView> {
  return requestJson(`/games/${encodeURIComponent(gameId)}`, PlayerViewSchema, {
    signal: options.signal,
  });
}

/** Statuses whose body is a `CommandResult {ok:false}` that the caller handles (not thrown). */
const HANDLED_COMMAND_STATUSES = new Set([400, 404, 409, 422]);

/**
 * `POST /api/games/:id/commands`.
 * Does NOT throw for 400/404/409/422 when the body is `CommandResult {ok:false}`;
 * throws `ApiError` only for network failures, 5xx and unparseable bodies.
 */
export async function postCommand(
  gameId: string,
  envelope: CommandEnvelope,
  options: CallOptions = {},
): Promise<CommandResult> {
  const raw = await requestRaw(`/games/${encodeURIComponent(gameId)}/commands`, {
    method: 'POST',
    body: envelope,
    signal: options.signal,
  });
  if (raw.ok) return parseBody(raw, CommandResultSchema);
  if (HANDLED_COMMAND_STATUSES.has(raw.status)) {
    const err = CommandErrSchema.safeParse(raw.body);
    if (err.success) return err.data;
  }
  throw toApiError(raw);
}
