/**
 * FROZEN copy of the Rebellion state schemas of SWR-004 (stored `schemaVersion: 2`, copied from `ddfa4db`).
 * Used only by the upcaster (`./upcast.ts`) to read rows written before SWR-005 (plan-backend §1.3).
 * Independent of the current schemas on purpose: never edit these schemas, never import them outside the
 * upcaster and its tests. The stored setup did not change in SWR-005 (still `schemaVersion: 2`), so no setup
 * schema is frozen here.
 */
import { z } from 'zod';

const FactionV2Schema = z.enum(['rebels', 'empire']);
const PlayerKindV2Schema = z.enum(['human', 'ai']);
const DifficultyV2Schema = z.enum(['easy', 'normal', 'hard']);
const GameRulesetV2Schema = z.enum(['base', 'rise-of-the-empire']);
const GameModeV2Schema = z.enum(['digital', 'physical_companion']);
const PhaseV2Schema = z.enum(['assignment', 'command', 'refresh']);
const PieceKindV2Schema = z.enum(['unit', 'leader', 'token']);

const SettingsV2Schema = z
  .strictObject({
    playerFaction: FactionV2Schema,
    opponentFaction: FactionV2Schema,
    opponentType: PlayerKindV2Schema,
    aiDifficulty: DifficultyV2Schema.nullable(),
    ruleset: GameRulesetV2Schema,
    gameMode: GameModeV2Schema,
  })
  .superRefine((value, ctx) => {
    if (value.opponentFaction === value.playerFaction) {
      ctx.addIssue({
        code: 'custom',
        path: ['opponentFaction'],
        message: 'opponentFaction must be the other side',
      });
    }
    if ((value.aiDifficulty === null) !== (value.opponentType === 'human')) {
      ctx.addIssue({
        code: 'custom',
        path: ['aiDifficulty'],
        message: 'aiDifficulty is null exactly when the opponent is human',
      });
    }
  });

const SystemV2Schema = z.strictObject({
  id: z.string().min(1),
  nameKey: z.string(),
  regionId: z.string(),
  adjacentSystemIds: z.array(z.string()),
});

const PieceV2Schema = z.strictObject({
  id: z.string().min(1),
  kind: PieceKindV2Schema,
  owner: FactionV2Schema,
  typeKey: z.string(),
  systemId: z.string(),
  hidden: z.boolean().optional(),
});

const eventBaseV2 = { seq: z.number().int().positive(), at: z.iso.datetime() };

export const GameEventV2Schema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventBaseV2,
    type: z.literal('GAME_CREATED'),
    actor: z.literal('system'),
    payload: z.strictObject({ scenarioId: z.string() }),
  }),
  z.strictObject({
    ...eventBaseV2,
    type: z.literal('PIECES_MOVED'),
    actor: FactionV2Schema,
    payload: z.strictObject({
      pieceIds: z.array(z.string()),
      fromSystemId: z.string(),
      toSystemId: z.string(),
    }),
  }),
  z.strictObject({
    ...eventBaseV2,
    type: z.literal('PHASE_ADVANCED'),
    actor: FactionV2Schema,
    payload: z.strictObject({
      fromRound: z.number().int().positive(),
      fromPhase: PhaseV2Schema,
      toRound: z.number().int().positive(),
      toPhase: PhaseV2Schema,
    }),
  }),
  z.strictObject({
    ...eventBaseV2,
    type: z.literal('TURN_ENDED'),
    actor: FactionV2Schema,
    payload: z.strictObject({ toSide: FactionV2Schema }),
  }),
  z.strictObject({
    ...eventBaseV2,
    type: z.literal('HANDOFF_ACCEPTED'),
    actor: FactionV2Schema,
    payload: z.strictObject({}),
  }),
]);
export type GameEventV2 = z.infer<typeof GameEventV2Schema>;

/** SWR-004 `GameStateSchema` (`schemaVersion: 2`) with its AI invariant. */
export const GameStateV2Schema = z
  .strictObject({
    schemaVersion: z.literal(2),
    id: z.string(),
    version: z.number().int().positive(),
    round: z.number().int().positive(),
    phase: PhaseV2Schema,
    settings: SettingsV2Schema,
    activeSide: FactionV2Schema,
    handoffPending: z.boolean(),
    systems: z.array(SystemV2Schema),
    pieces: z.array(PieceV2Schema),
    rebelBase: z.strictObject({ systemId: z.string().nullable(), revealed: z.boolean() }),
    log: z.array(GameEventV2Schema),
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
export type GameStateV2 = z.infer<typeof GameStateV2Schema>;
