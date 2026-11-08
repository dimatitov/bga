import { z } from 'zod';
import { PhaseSchema } from './enums';
import { CommandErrSchema } from './results';
import { GameSetupSchema } from './setup';
import { PlayerViewSchema } from './view';

export const HealthResponseSchema = z.strictObject({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const GameIdParamSchema = z.string().min(1).max(64);

export const CreateGameResponseSchema = z.strictObject({
  gameId: z.string(),
  view: PlayerViewSchema,
});
export type CreateGameResponse = z.infer<typeof CreateGameResponseSchema>;

export const GameSummarySchema = z.strictObject({
  gameId: z.string(),
  setup: GameSetupSchema,
  round: z.number().int(),
  phase: PhaseSchema,
  updatedAt: z.iso.datetime(),
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

/** `GET /api/games`: at most `MAX_GAMES_LISTED`, ordered by `updatedAt` desc (A-18). */
export const ListGamesResponseSchema = z.array(GameSummarySchema);
export type ListGamesResponse = z.infer<typeof ListGamesResponseSchema>;
export const MAX_GAMES_LISTED = 20;

/** Body of every non-2xx response under `/api` (R-8). */
export const ErrorResponseSchema = CommandErrSchema;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
