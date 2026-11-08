import { z } from 'zod';
import { FactionSchema } from './enums';

/**
 * A-5/A-6: empty or duplicate `pieceIds` are rejected by the schema (→ 400). Same shape in both engines:
 * `mock-v1` — to an adjacent system in any phase; `core-v1` — into the activated system (R-5).
 */
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

/** `mock-v1` only (phase cycling of SWR-002); `core-v1` → 422 `commandUnavailable` (AC-03). */
export const AdvancePhaseCommandSchema = z.strictObject({
  type: z.literal('ADVANCE_PHASE'),
});
export type AdvancePhaseCommand = z.infer<typeof AdvancePhaseCommandSchema>;

/**
 * `mock-v1` only. Hot-seat (human games only): pass the turn to the other side → handoff screen (Q-10: phase
 * unchanged). `core-v1` → 422 `commandUnavailable` (the engine changes the turn itself).
 */
export const EndTurnCommandSchema = z.strictObject({
  type: z.literal('END_TURN'),
});
export type EndTurnCommand = z.infer<typeof EndTurnCommandSchema>;

/** Both engines. Hot-seat: the new active side takes the seat (trusted confirmation, no authentication). */
export const AcceptHandoffCommandSchema = z.strictObject({
  type: z.literal('ACCEPT_HANDOFF'),
});
export type AcceptHandoffCommand = z.infer<typeof AcceptHandoffCommandSchema>;

/** `core-v1` (R-4): place an own leader from the pool in any system of the map → activation. */
export const ActivateSystemCommandSchema = z.strictObject({
  type: z.literal('ACTIVATE_SYSTEM'),
  leaderId: z.string().min(1),
  systemId: z.string().min(1),
});
export type ActivateSystemCommand = z.infer<typeof ActivateSystemCommandSchema>;

/** `core-v1`: end the own activation → the turn goes to the other side unless it has passed (R-3/R-6). */
export const FinishActivationCommandSchema = z.strictObject({
  type: z.literal('FINISH_ACTIVATION'),
});
export type FinishActivationCommand = z.infer<typeof FinishActivationCommandSchema>;

/** `core-v1` (R-6): pass for the rest of the command phase (only outside an activation). */
export const PassCommandSchema = z.strictObject({
  type: z.literal('PASS'),
});
export type PassCommand = z.infer<typeof PassCommandSchema>;

/**
 * Commands of BOTH engines (AM-BE-3): a command of the other engine passes the schema and is rejected by
 * the rules with 422 `commandUnavailable`, never 400.
 */
export const CommandSchema = z.discriminatedUnion('type', [
  MovePiecesCommandSchema,
  AdvancePhaseCommandSchema,
  EndTurnCommandSchema,
  AcceptHandoffCommandSchema,
  ActivateSystemCommandSchema,
  FinishActivationCommandSchema,
  PassCommandSchema,
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];

/** Command types accepted by each engine (others → 422 `commandUnavailable`). */
export const MOCK_COMMAND_TYPES = Object.freeze([
  'MOVE_PIECES',
  'ADVANCE_PHASE',
  'END_TURN',
  'ACCEPT_HANDOFF',
] as const satisfies readonly CommandType[]);
export const CORE_COMMAND_TYPES = Object.freeze([
  'ACTIVATE_SYSTEM',
  'MOVE_PIECES',
  'FINISH_ACTIVATION',
  'PASS',
  'ACCEPT_HANDOFF',
] as const satisfies readonly CommandType[]);
export type MockCommandType = (typeof MOCK_COMMAND_TYPES)[number];
export type CoreCommandType = (typeof CORE_COMMAND_TYPES)[number];
export type MockCommand = Extract<Command, { type: MockCommandType }>;
export type CoreCommand = Extract<Command, { type: CoreCommandType }>;

/** Single entry point for commands from a human or (later) the AI. */
export const CommandEnvelopeSchema = z.strictObject({
  actor: FactionSchema,
  expectedVersion: z.number().int().positive(),
  command: CommandSchema,
});
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
