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

export const CommandSchema = z.discriminatedUnion('type', [
  MovePiecesCommandSchema,
  AdvancePhaseCommandSchema,
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
