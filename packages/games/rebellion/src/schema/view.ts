import { z } from 'zod';
import { SessionStatusSchema } from '@bga/platform';
import { FactionIdSchema, PhaseSchema } from './enums';
import { RebellionSettingsSchema } from './settings';
import { GameLogSchema, PiecesSchema, RebelBaseSchema, SystemsSchema } from './state';

export const MovePiecesLegalActionSchema = z.strictObject({
  type: z.literal('MOVE_PIECES'),
  pieceId: z.string(),
  toSystemIds: z.array(z.string()),
});
export const AdvancePhaseLegalActionSchema = z.strictObject({
  type: z.literal('ADVANCE_PHASE'),
});
/** Hot-seat: only in human games, only for the active side (AM-FE-7). */
export const EndTurnLegalActionSchema = z.strictObject({
  type: z.literal('END_TURN'),
});

export const LegalActionSchema = z.discriminatedUnion('type', [
  MovePiecesLegalActionSchema,
  AdvancePhaseLegalActionSchema,
  EndTurnLegalActionSchema,
]);
export type LegalAction = z.infer<typeof LegalActionSchema>;

/**
 * Board projection of `GameState` for one side (`kind: 'player'`, filled by game-core):
 * - `viewer` is always chosen by the server (the active side), never taken from a request;
 * - `rebelBase.systemId` is `null` for the Empire while `revealed === false`;
 * - hidden pieces of the viewer's opponent (either side, symmetric) have `typeKey: 'unknown'`;
 * - `log` carries no enemy secrets; `legalActions` are computed by game-core (empty unless `viewer` is active);
 * - `settings` are public (Q-24); never `schemaVersion`, `handoffPending` or the stored setup.
 */
export const PlayerViewPlayerSchema = z.strictObject({
  kind: z.literal('player'),
  viewer: FactionIdSchema,
  activeSide: FactionIdSchema,
  settings: RebellionSettingsSchema,
  id: z.string(),
  version: z.number().int().positive(),
  round: z.number().int().positive(),
  phase: PhaseSchema,
  systems: SystemsSchema,
  pieces: PiecesSchema,
  rebelBase: RebelBaseSchema,
  log: GameLogSchema,
  legalActions: z.array(LegalActionSchema),
});
export type PlayerViewPlayer = z.infer<typeof PlayerViewPlayerSchema>;

/**
 * Hot-seat handoff screen (`handoffPending`): public metadata ONLY (AM-BE-1, Q-12) — no systems, pieces,
 * rebel base, log, legal actions or settings. Strict: nothing else may ever be added by accident.
 */
export const HandoffViewSchema = z.strictObject({
  kind: z.literal('handoff'),
  id: z.string(),
  version: z.number().int().positive(),
  activeSide: FactionIdSchema,
  round: z.number().int().positive(),
  phase: PhaseSchema,
  sessionStatus: SessionStatusSchema,
});
export type HandoffView = z.infer<typeof HandoffViewSchema>;

/** What a Rebellion session sends as `view`: the board of the active side or the handoff screen. */
export const PlayerViewSchema = z.discriminatedUnion('kind', [
  PlayerViewPlayerSchema,
  HandoffViewSchema,
]);
export type PlayerView = z.infer<typeof PlayerViewSchema>;
export type PlayerViewKind = PlayerView['kind'];

/** `typeKey` value used for hidden enemy pieces in a PlayerView. */
export const UNKNOWN_TYPE_KEY = 'unknown';
