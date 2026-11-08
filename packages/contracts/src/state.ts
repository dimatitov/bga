import { z } from 'zod';
import { FactionSchema, PhaseSchema, PieceKindSchema } from './enums';
import { GameSetupSchema } from './setup';

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

export const GameEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedEventSchema,
  PhaseAdvancedEventSchema,
]);
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameEventType = GameEvent['type'];

/** Full authoritative state. Never sent to clients — only `PlayerView` is. No visual coordinates here. */
export const GameStateSchema = z.strictObject({
  id: z.string(),
  version: z.number().int().positive(),
  round: z.number().int().positive(),
  phase: PhaseSchema,
  setup: GameSetupSchema,
  systems: z.array(SystemSchema),
  pieces: z.array(PieceSchema),
  rebelBase: RebelBaseSchema,
  log: z.array(GameEventSchema),
});
export type GameState = z.infer<typeof GameStateSchema>;
