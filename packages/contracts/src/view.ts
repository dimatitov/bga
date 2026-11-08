import { z } from 'zod';
import { GameStateSchema } from './state';

export const MovePiecesLegalActionSchema = z.strictObject({
  type: z.literal('MOVE_PIECES'),
  pieceId: z.string(),
  toSystemIds: z.array(z.string()),
});
export const AdvancePhaseLegalActionSchema = z.strictObject({
  type: z.literal('ADVANCE_PHASE'),
});

export const LegalActionSchema = z.discriminatedUnion('type', [
  MovePiecesLegalActionSchema,
  AdvancePhaseLegalActionSchema,
]);
export type LegalAction = z.infer<typeof LegalActionSchema>;

/**
 * Projection of `GameState` for one viewer (filled by game-core `toPlayerView`):
 * - `rebelBase.systemId` is `null` for the Empire while `revealed === false`;
 * - hidden pieces of the viewer's opponent (either side, symmetric) have `typeKey: 'unknown'`;
 * - `log` carries no enemy secrets;
 * - plus `legalActions` computed by game-core.
 */
export const PlayerViewSchema = GameStateSchema.extend({
  legalActions: z.array(LegalActionSchema),
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

/** `typeKey` value used for hidden enemy pieces in a PlayerView. */
export const UNKNOWN_TYPE_KEY = 'unknown';
