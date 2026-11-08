import { z } from 'zod';
import { FactionIdSchema, FactionSchema, PhaseSchema, PieceKindSchema } from './enums';
import { REBELLION_SCHEMA_VERSION, RebellionSettingsSchema } from './settings';

export const SystemSchema = z.strictObject({
  id: z.string().min(1),
  /** i18n key, `systems.<id>` */
  nameKey: z.string(),
  regionId: z.string(),
  adjacentSystemIds: z.array(z.string()),
});
export type System = z.infer<typeof SystemSchema>;

export const PieceSchema = z.strictObject({
  id: z.string().min(1),
  kind: PieceKindSchema,
  owner: FactionSchema,
  /** i18n key suffix (`pieceTypes.<typeKey>`); `'unknown'` in a PlayerView for hidden enemy pieces. */
  typeKey: z.string(),
  systemId: z.string(),
  hidden: z.boolean().optional(),
});
export type Piece = z.infer<typeof PieceSchema>;

export const RebelBaseSchema = z.strictObject({
  systemId: z.string().nullable(),
  revealed: z.boolean(),
});
export type RebelBase = z.infer<typeof RebelBaseSchema>;

const eventBase = {
  seq: z.number().int().positive(),
  at: z.iso.datetime(),
};

export const GameCreatedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('GAME_CREATED'),
  actor: z.literal('system'),
  payload: z.strictObject({ scenarioId: z.string() }),
});
export type GameCreatedEvent = z.infer<typeof GameCreatedEventSchema>;

export const PiecesMovedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('PIECES_MOVED'),
  actor: FactionSchema,
  payload: z.strictObject({
    pieceIds: z.array(z.string()),
    fromSystemId: z.string(),
    toSystemId: z.string(),
  }),
});
export type PiecesMovedEvent = z.infer<typeof PiecesMovedEventSchema>;

export const PhaseAdvancedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('PHASE_ADVANCED'),
  actor: FactionSchema,
  payload: z.strictObject({
    fromRound: z.number().int().positive(),
    fromPhase: PhaseSchema,
    toRound: z.number().int().positive(),
    toPhase: PhaseSchema,
  }),
});
export type PhaseAdvancedEvent = z.infer<typeof PhaseAdvancedEventSchema>;

/** Hot-seat: `actor` passed the turn to `toSide` (handoff pending). No secrets. */
export const TurnEndedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('TURN_ENDED'),
  actor: FactionSchema,
  payload: z.strictObject({ toSide: FactionSchema }),
});
export type TurnEndedEvent = z.infer<typeof TurnEndedEventSchema>;

/** Hot-seat: `actor` (the new active side) took the seat. No secrets. */
export const HandoffAcceptedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('HANDOFF_ACCEPTED'),
  actor: FactionSchema,
  payload: z.strictObject({}),
});
export type HandoffAcceptedEvent = z.infer<typeof HandoffAcceptedEventSchema>;

export const GameEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedEventSchema,
  PhaseAdvancedEventSchema,
  TurnEndedEventSchema,
  HandoffAcceptedEventSchema,
]);
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameEventType = GameEvent['type'];

export const SystemsSchema = z.array(SystemSchema);
export const PiecesSchema = z.array(PieceSchema);
export const GameLogSchema = z.array(GameEventSchema);

/**
 * Full authoritative state, `schemaVersion: 2` (SWR-004). Never sent to clients — only `PlayerView` is.
 * No visual coordinates here. Older snapshots are upcast on read (`@bga/game-rebellion/server`).
 * Invariant: in an AI game the human side is always active and there is never a pending handoff.
 */
export const GameStateSchema = z
  .strictObject({
    schemaVersion: z.literal(REBELLION_SCHEMA_VERSION),
    id: z.string(),
    version: z.number().int().positive(),
    round: z.number().int().positive(),
    phase: PhaseSchema,
    settings: RebellionSettingsSchema,
    /** Side whose turn it is (hot-seat; SWR-004). */
    activeSide: FactionIdSchema,
    /** A turn was passed and the next player has not taken the seat yet (hot-seat; SWR-004). */
    handoffPending: z.boolean(),
    systems: SystemsSchema,
    pieces: PiecesSchema,
    rebelBase: RebelBaseSchema,
    log: GameLogSchema,
  })
  .superRefine((state, ctx) => {
    if (state.settings.opponentType === 'ai') {
      if (state.activeSide !== state.settings.playerFaction) {
        ctx.addIssue({
          code: 'custom',
          path: ['activeSide'],
          message: 'AI game: the player is always active',
        });
      }
      if (state.handoffPending) {
        ctx.addIssue({ code: 'custom', path: ['handoffPending'], message: 'AI game: no handoff' });
      }
    }
  });
export type GameState = z.infer<typeof GameStateSchema>;
