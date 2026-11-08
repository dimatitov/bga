import { z } from 'zod';
import { FactionSchema } from './enums';

/** A-5/A-6: empty or duplicate `pieceIds` are rejected by the schema (→ 400). */
export const MovePiecesCommandSchema = z.strictObject({
  type: z.literal('MOVE_PIECES'),
  pieceIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate pieceIds' }),
  fromSystemId: z.string().min(1),
  toSystemId: z.string().min(1),
});
export type MovePiecesCommand = z.infer<typeof MovePiecesCommandSchema>;

/** MOCK: phase cycling is temporary logic in SWR-002. */
export const AdvancePhaseCommandSchema = z.strictObject({
  type: z.literal('ADVANCE_PHASE'),
});
export type AdvancePhaseCommand = z.infer<typeof AdvancePhaseCommandSchema>;

/** Hot-seat (human games only): pass the turn to the other side → handoff screen (Q-10: phase unchanged). */
export const EndTurnCommandSchema = z.strictObject({
  type: z.literal('END_TURN'),
});
export type EndTurnCommand = z.infer<typeof EndTurnCommandSchema>;

/** Hot-seat: the new active side takes the seat (trusted confirmation, no authentication). */
export const AcceptHandoffCommandSchema = z.strictObject({
  type: z.literal('ACCEPT_HANDOFF'),
});
export type AcceptHandoffCommand = z.infer<typeof AcceptHandoffCommandSchema>;

export const CommandSchema = z.discriminatedUnion('type', [
  MovePiecesCommandSchema,
  AdvancePhaseCommandSchema,
  EndTurnCommandSchema,
  AcceptHandoffCommandSchema,
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];

/** Single entry point for commands from a human or (later) the AI. */
export const CommandEnvelopeSchema = z.strictObject({
  actor: FactionSchema,
  expectedVersion: z.number().int().positive(),
  command: CommandSchema,
});
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
