/**
 * FROZEN copy of the Rebellion data schemas of SWR-003 (stored `schemaVersion` 1 — the field itself is absent).
 * Used only by the upcaster (`./upcast.ts`) to read rows written before SWR-004. Independent of the current
 * enums on purpose: never edit these schemas, never import them outside the upcaster and its tests.
 * This file (with `./upcast.ts` and the v1 fixtures) is the only place where `'rebellion'` is a faction value.
 */
import { z } from 'zod';

export const FactionV1Schema = z.enum(['empire', 'rebellion']);
export type FactionV1 = z.infer<typeof FactionV1Schema>;

const DifficultyV1Schema = z.enum(['easy', 'normal', 'hard']);
const PhaseV1Schema = z.enum(['assignment', 'command', 'refresh']);
const PieceKindV1Schema = z.enum(['unit', 'leader', 'token']);

const OpponentV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ai'), difficulty: DifficultyV1Schema.default('normal') }),
  z.strictObject({ kind: z.literal('human') }),
]);

/** `Session.setup` / `state.setup` of SWR-002/SWR-003. */
export const GameSetupV1Schema = z.strictObject({
  humanFaction: FactionV1Schema,
  opponent: OpponentV1Schema,
});
export type GameSetupV1 = z.output<typeof GameSetupV1Schema>;

const SystemV1Schema = z.strictObject({
  id: z.string().min(1),
  nameKey: z.string(),
  regionId: z.string(),
  adjacentSystemIds: z.array(z.string()),
});

const PieceV1Schema = z.strictObject({
  id: z.string().min(1),
  kind: PieceKindV1Schema,
  owner: FactionV1Schema,
  typeKey: z.string(),
  systemId: z.string(),
  hidden: z.boolean().optional(),
});

const eventBaseV1 = { seq: z.number().int().positive(), at: z.iso.datetime() };

export const GameEventV1Schema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventBaseV1,
    type: z.literal('GAME_CREATED'),
    actor: z.literal('system'),
    payload: z.strictObject({ scenarioId: z.string() }),
  }),
  z.strictObject({
    ...eventBaseV1,
    type: z.literal('PIECES_MOVED'),
    actor: FactionV1Schema,
    payload: z.strictObject({
      pieceIds: z.array(z.string()),
      fromSystemId: z.string(),
      toSystemId: z.string(),
    }),
  }),
  z.strictObject({
    ...eventBaseV1,
    type: z.literal('PHASE_ADVANCED'),
    actor: FactionV1Schema,
    payload: z.strictObject({
      fromRound: z.number().int().positive(),
      fromPhase: PhaseV1Schema,
      toRound: z.number().int().positive(),
      toPhase: PhaseV1Schema,
    }),
  }),
]);
export type GameEventV1 = z.infer<typeof GameEventV1Schema>;

export const GameStateV1Schema = z.strictObject({
  id: z.string(),
  version: z.number().int().positive(),
  round: z.number().int().positive(),
  phase: PhaseV1Schema,
  setup: GameSetupV1Schema,
  systems: z.array(SystemV1Schema),
  pieces: z.array(PieceV1Schema),
  rebelBase: z.strictObject({ systemId: z.string().nullable(), revealed: z.boolean() }),
  log: z.array(GameEventV1Schema),
});
export type GameStateV1 = z.infer<typeof GameStateV1Schema>;
