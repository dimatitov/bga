import { z } from 'zod';

/** Faction ids (SWR-004: `rebellion` → `rebels`; spec order, default first). */
export const FactionSchema = z.enum(['rebels', 'empire']);
export type Faction = z.infer<typeof FactionSchema>;
/** Name used by the SWR-004 specification. */
export const FactionIdSchema = FactionSchema;
export type FactionId = Faction;

export const PlayerKindSchema = z.enum(['human', 'ai']);
export type PlayerKind = z.infer<typeof PlayerKindSchema>;
/** Name used by the SWR-004 specification (same values as `PlayerKindSchema`). */
export const OpponentTypeSchema = PlayerKindSchema;
export type OpponentType = PlayerKind;

export const DifficultySchema = z.enum(['easy', 'normal', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;
/** Name used by the SWR-004 specification (same values as `DifficultySchema`). */
export const AIDifficultySchema = DifficultySchema;
export type AIDifficulty = Difficulty;

export const GameRulesetSchema = z.enum(['base', 'rise-of-the-empire']);
export type GameRuleset = z.infer<typeof GameRulesetSchema>;

export const GameModeSchema = z.enum(['digital', 'physical_companion']);
export type GameMode = z.infer<typeof GameModeSchema>;

/** Rebellion phase names; transitions between them are MOCK logic in SWR-002. */
export const PhaseSchema = z.enum(['assignment', 'command', 'refresh']);
export type Phase = z.infer<typeof PhaseSchema>;

export const PieceKindSchema = z.enum(['unit', 'leader', 'token']);
export type PieceKind = z.infer<typeof PieceKindSchema>;

/** Who produced an event: a faction or the system itself. */
export const ActorSchema = z.union([FactionSchema, z.literal('system')]);
export type Actor = z.infer<typeof ActorSchema>;
