import { z } from 'zod';

export const FactionSchema = z.enum(['empire', 'rebellion']);
export type Faction = z.infer<typeof FactionSchema>;

export const PlayerKindSchema = z.enum(['human', 'ai']);
export type PlayerKind = z.infer<typeof PlayerKindSchema>;

export const DifficultySchema = z.enum(['easy', 'normal', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** Rebellion phase names; transitions between them are MOCK logic in SWR-002. */
export const PhaseSchema = z.enum(['assignment', 'command', 'refresh']);
export type Phase = z.infer<typeof PhaseSchema>;

export const PieceKindSchema = z.enum(['unit', 'leader', 'token']);
export type PieceKind = z.infer<typeof PieceKindSchema>;

/** Who produced an event: a faction or the system itself. */
export const ActorSchema = z.union([FactionSchema, z.literal('system')]);
export type Actor = z.infer<typeof ActorSchema>;
