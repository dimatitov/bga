import { z } from 'zod';
import { ErrorResponseSchema } from './errors';
import { GameIdSchema } from './game';

/** Opaque session id (UUID in production). */
export const SessionIdSchema = z.string().min(1).max(64);
export type SessionId = z.infer<typeof SessionIdSchema>;

/** `GET /api/sessions` returns at most this many sessions, `updatedAt` desc. */
export const MAX_SESSIONS_LISTED = 20;

/**
 * Lifecycle status of a session (SWR-004), stored in `Session.status`. The game module chooses the initial
 * status (`ServerGameModule.initialStatus`); the platform never interprets game data to derive it.
 */
export const SessionStatusSchema = z.enum(['setup', 'prototype', 'active', 'completed']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Public settings of a session (`ServerGameModule.publicSettings`): a JSON object only the game interprets
 * (it narrows it with its own schema, see `makeSessionResponseSchema`). Never secret (Q-24).
 */
export const SessionSettingsSchema = z.record(z.string(), z.unknown());
export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

/**
 * Flat, NON-secret fields a game exposes for session lists (`ServerGameModule.summarize`).
 * `null` = "not applicable" (Q-20).
 */
export const SessionDetailsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type SessionDetails = z.infer<typeof SessionDetailsSchema>;

export const SessionSummarySchema = z.strictObject({
  sessionId: SessionIdSchema,
  gameId: GameIdSchema,
  status: SessionStatusSchema,
  version: z.int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  details: SessionDetailsSchema,
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/**
 * Query of `GET /api/sessions` (Q-5, Decisions R-2): missing or '' → no filter; repeated parameter (array)
 * or a malformed id → 400; a well-formed unknown id → `[]` (200). Extra parameters are ignored.
 */
export const ListSessionsQuerySchema = z.object({
  gameId: z.preprocess((v) => (v === '' ? undefined : v), GameIdSchema.optional()),
});
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

export const ListSessionsResponseSchema = z.array(SessionSummarySchema);
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;

/** Body of `POST /api/sessions`; `setup` is validated by the game's own schema. */
export const CreateSessionRequestSchema = z.strictObject({
  gameId: GameIdSchema,
  setup: z.unknown(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/**
 * Session envelope: `POST /api/sessions` (201, or 200 on an idempotent replay) and `GET /api/sessions/:id`.
 * `settings` are the game's public settings, `view` is the game's PlayerView (both validated by the game).
 */
export const SessionResponseSchema = z.strictObject({
  sessionId: SessionIdSchema,
  gameId: GameIdSchema,
  status: SessionStatusSchema,
  settings: SessionSettingsSchema,
  view: z.unknown(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** `SessionResponseSchema` with the game's view schema and, optionally, its settings schema. */
export function makeSessionResponseSchema<
  V extends z.ZodType,
  S extends z.ZodType = typeof SessionSettingsSchema,
>(view: V, settings?: S) {
  return SessionResponseSchema.extend({
    view,
    settings: (settings ?? SessionSettingsSchema) as S,
  });
}

/** Frame of a command envelope; the game narrows `actor` and `command` with its own schema. */
export const CommandEnvelopeFrameSchema = z.object({
  actor: z.string().min(1),
  expectedVersion: z.int().positive(),
  command: z.unknown(),
});
export type CommandEnvelopeFrame = z.infer<typeof CommandEnvelopeFrameSchema>;

/** Success of `POST /api/sessions/:id/commands`; `view`/`events` are the game's. */
export const SessionCommandOkSchema = z.strictObject({
  ok: z.literal(true),
  view: z.unknown(),
  events: z.array(z.unknown()),
});
export type SessionCommandOk = z.infer<typeof SessionCommandOkSchema>;

export const SessionCommandResultSchema = z.discriminatedUnion('ok', [
  SessionCommandOkSchema,
  ErrorResponseSchema,
]);
export type SessionCommandResult = z.infer<typeof SessionCommandResultSchema>;

/** `SessionCommandOkSchema` with the game's view and event schemas. */
export function makeCommandOkSchema<V extends z.ZodType, E extends z.ZodType>(view: V, event: E) {
  return SessionCommandOkSchema.extend({ view, events: z.array(event) });
}
