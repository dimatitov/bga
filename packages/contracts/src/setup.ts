import { z } from 'zod';
import { DifficultySchema, FactionSchema } from './enums';

/** A-7: AI without difficulty → 'normal'; human opponent with difficulty → validation error. */
export const OpponentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ai'), difficulty: DifficultySchema.default('normal') }),
  z.strictObject({ kind: z.literal('human') }),
]);
export type Opponent = z.output<typeof OpponentSchema>;
export type OpponentInput = z.input<typeof OpponentSchema>;

export const GameSetupSchema = z.strictObject({
  humanFaction: FactionSchema,
  opponent: OpponentSchema,
});
/** Stored form (difficulty filled for AI). */
export type GameSetup = z.output<typeof GameSetupSchema>;
/** What the client sends (difficulty optional for AI). */
export type GameSetupInput = z.input<typeof GameSetupSchema>;
