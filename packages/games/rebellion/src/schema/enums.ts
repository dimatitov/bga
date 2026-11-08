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

/**
 * Rules engine of a session (SWR-005, BD-1): `mock-v1` — the SWR-002…004 mock rules on the fictional map
 * (kept only for old sessions); `core-v1` — the first real slice (round + activation) on the base-game map.
 * Public (Q-32): part of the player view, the handoff view and `details`.
 */
export const RulesEngineSchema = z.enum(['mock-v1', 'core-v1']);
export type RulesEngine = z.infer<typeof RulesEngineSchema>;

/** Where a unit fights and moves (reference §2: blue icon = ship → `space`, orange → `ground`). */
export const UnitArenaSchema = z.enum(['space', 'ground']);
export type UnitArena = z.infer<typeof UnitArenaSchema>;

/** `immobile` = never moves (Rebel structures, Death Star under construction; R-5). */
export const UnitMobilitySchema = z.enum(['mobile', 'immobile']);
export type UnitMobility = z.infer<typeof UnitMobilitySchema>;

/** Why a `core-v1` game ended (R-9): Rebels — time reached reputation; Empire — rebel base captured. */
export const OutcomeReasonSchema = z.enum(['timeReachedReputation', 'rebelBaseCaptured']);
export type OutcomeReason = z.infer<typeof OutcomeReasonSchema>;

/**
 * Who issued a command (`ApplyContext.origin`, never taken from a request): a human player or the server's
 * automatic AI move (PO-3 auto-pass). Marked on `PASSED` / `ACTIVATION_FINISHED` as `payload.auto` (AM-BE-4).
 */
export const CommandOriginSchema = z.enum(['player', 'auto']);
export type CommandOrigin = z.infer<typeof CommandOriginSchema>;
