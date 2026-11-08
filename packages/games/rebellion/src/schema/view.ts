import { z } from 'zod';
import { SessionStatusSchema } from '@bga/platform';
import {
  FactionIdSchema,
  FactionSchema,
  OutcomeReasonSchema,
  PhaseSchema,
  RulesEngineSchema,
} from './enums';
import { UnitTypeSchema } from './data';
import { RebellionSettingsSchema } from './settings';
import {
  CoreViewEventSchema,
  GameLogSchema,
  PassedSidesSchema,
  PiecesSchema,
  RebelBaseSchema,
  SystemsSchema,
} from './state';

// ---------------------------------------------------------------------------------------------------------
// mock-v1 (SWR-002…004)
// ---------------------------------------------------------------------------------------------------------

export const MovePiecesLegalActionSchema = z.strictObject({
  type: z.literal('MOVE_PIECES'),
  pieceId: z.string(),
  toSystemIds: z.array(z.string()),
});
export const AdvancePhaseLegalActionSchema = z.strictObject({
  type: z.literal('ADVANCE_PHASE'),
});
/** Hot-seat: only in human games, only for the active side (AM-FE-7). */
export const EndTurnLegalActionSchema = z.strictObject({
  type: z.literal('END_TURN'),
});

/** Legal actions of a `mock-v1` view. */
export const MockLegalActionSchema = z.discriminatedUnion('type', [
  MovePiecesLegalActionSchema,
  AdvancePhaseLegalActionSchema,
  EndTurnLegalActionSchema,
]);
export type MockLegalAction = z.infer<typeof MockLegalActionSchema>;

/**
 * Board projection of a `mock-v1` state for one side (`kind: 'player'`, filled by game-core):
 * - `viewer` is always chosen by the server (the active side), never taken from a request;
 * - `rebelBase.systemId` is `null` for the Empire while `revealed === false`;
 * - hidden pieces of the viewer's opponent (either side, symmetric) have `typeKey: 'unknown'`;
 * - `log` carries no enemy secrets; `legalActions` are computed by game-core (empty unless `viewer` is active);
 * - `settings` are public (Q-24); never `schemaVersion`, `handoffPending` or the stored setup.
 * SWR-005 (AM-BE-6): + `rulesEngine: 'mock-v1'`; otherwise unchanged.
 */
export const MockPlayerViewSchema = z.strictObject({
  kind: z.literal('player'),
  rulesEngine: z.literal('mock-v1'),
  viewer: FactionIdSchema,
  activeSide: FactionIdSchema,
  settings: RebellionSettingsSchema,
  id: z.string(),
  version: z.number().int().positive(),
  round: z.number().int().positive(),
  phase: PhaseSchema,
  systems: SystemsSchema,
  pieces: PiecesSchema,
  rebelBase: RebelBaseSchema,
  log: GameLogSchema,
  legalActions: z.array(MockLegalActionSchema),
});
export type MockPlayerView = z.infer<typeof MockPlayerViewSchema>;
/** Name used by plan-frontend (FE-0). */
export type PlayerViewMock = MockPlayerView;

// ---------------------------------------------------------------------------------------------------------
// core-v1 (SWR-005, plan-backend §8.2 with the specification revisions: `passed` instead of
// `consecutivePasses`, `canActivate` on leaders)
// ---------------------------------------------------------------------------------------------------------

/**
 * Where a unit / leader / activation is shown: a system, or the hidden rebel-base zone
 * (`rebelBase` — only for the Empire before the reveal and before the end of the game, AM-BE-7, Q-14).
 */
export const ViewLocationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('system'), systemId: z.string() }),
  z.strictObject({ kind: z.literal('rebelBase') }),
]);
export type ViewLocation = z.infer<typeof ViewLocationSchema>;

/** A leader is in its owner's pool (pools of both sides are public) or on the map. */
export const LeaderViewLocationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pool') }),
  z.strictObject({ kind: z.literal('system'), systemId: z.string() }),
  z.strictObject({ kind: z.literal('rebelBase') }),
]);
export type LeaderViewLocation = z.infer<typeof LeaderViewLocationSchema>;

export const CoreRegionViewSchema = z.strictObject({
  id: z.string(),
  /** i18n key, `regions.<id>` */
  nameKey: z.string(),
});
export const CoreSystemViewSchema = z.strictObject({
  id: z.string(),
  /** i18n key, `systems.<id>` */
  nameKey: z.string(),
  regionId: z.string(),
  adjacentSystemIds: z.array(z.string()),
  remote: z.boolean(),
});
export type CoreSystemView = z.infer<typeof CoreSystemViewSchema>;

export const CoreUnitViewSchema = z.strictObject({
  id: z.string(),
  owner: FactionSchema,
  /** i18n `pieceTypes.<typeKey>`; arena/mobility/capacity — from `unitTypes` by `typeKey`. */
  typeKey: z.string(),
  location: ViewLocationSchema,
});
export type CoreUnitView = z.infer<typeof CoreUnitViewSchema>;

export const CoreLeaderViewSchema = z.strictObject({
  /** i18n `leaders.<id>` */
  id: z.string(),
  owner: FactionSchema,
  canActivate: z.boolean(),
  location: LeaderViewLocationSchema,
});
export type CoreLeaderView = z.infer<typeof CoreLeaderViewSchema>;

export const CoreActivationViewSchema = z.strictObject({
  side: FactionSchema,
  leaderId: z.string(),
  location: ViewLocationSchema,
});
export type CoreActivationView = z.infer<typeof CoreActivationViewSchema>;

/**
 * R-4. Without an activation: own pool leaders that can activate (`canActivate`) × every system of the map
 * (a system with any leader is allowed, Q-BE-3; for the Empire never depends on the base). Only when
 * `leaderIds` is non-empty.
 */
export const ActivateSystemLegalActionSchema = z.strictObject({
  type: z.literal('ACTIVATE_SYSTEM'),
  leaderIds: z.array(z.string()),
  systemIds: z.array(z.string()),
});

/**
 * R-5. During an own activation: one per adjacent source system without an own leader that has movable own
 * units; `pieces` with their capacity numbers (UI preview only; the server decides `insufficientCapacity`).
 */
export const MovePiecesCoreLegalActionSchema = z.strictObject({
  type: z.literal('MOVE_PIECES'),
  fromSystemId: z.string(),
  toSystemId: z.string(),
  pieces: z.array(
    z.strictObject({
      pieceId: z.string(),
      transportCapacity: z.int().nonnegative(),
      requiresTransport: z.boolean(),
    }),
  ),
});
export const FinishActivationLegalActionSchema = z.strictObject({
  type: z.literal('FINISH_ACTIVATION'),
});
/** R-6: always available outside an activation (the turn of a side that passed is skipped). */
export const PassLegalActionSchema = z.strictObject({
  type: z.literal('PASS'),
});

/** Legal actions of a `core-v1` view (`[]` unless it is the viewer's turn, no handoff, no outcome). */
export const CoreLegalActionSchema = z.discriminatedUnion('type', [
  ActivateSystemLegalActionSchema,
  MovePiecesCoreLegalActionSchema,
  FinishActivationLegalActionSchema,
  PassLegalActionSchema,
]);
export type CoreLegalAction = z.infer<typeof CoreLegalActionSchema>;

/** Legal action of either engine (the schemas are per engine: `MOVE_PIECES` differs). */
export type LegalAction = MockLegalAction | CoreLegalAction;

/**
 * Board projection of a `core-v1` state for one side. Hidden information is removed on the server
 * (one redaction point, plan-backend §5.1): for the Empire before the reveal (and while the game runs)
 * `rebelBase.systemId` is `null`, Rebel units/leaders/activation in the base system have
 * `location: {kind: 'rebelBase'}`, and the base system in `log` events is `null`; `contestedSystemIds`
 * is computed after the redaction (D-1). Static data (`map`, `unitTypes`) is public.
 */
export const CorePlayerViewSchema = z.strictObject({
  kind: z.literal('player'),
  rulesEngine: z.literal('core-v1'),
  viewer: FactionIdSchema,
  activeSide: FactionIdSchema,
  settings: RebellionSettingsSchema,
  id: z.string(),
  version: z.number().int().positive(),
  /** = time marker (R-1). */
  round: z.int().positive(),
  /** `command`; `refresh` only with `outcome`. */
  phase: PhaseSchema,
  markers: z.strictObject({ time: z.int().positive(), reputation: z.int().positive() }),
  map: z.strictObject({
    regions: z.array(CoreRegionViewSchema),
    systems: z.array(CoreSystemViewSchema),
  }),
  unitTypes: z.array(UnitTypeSchema),
  units: z.array(CoreUnitViewSchema),
  leaders: z.array(CoreLeaderViewSchema),
  activation: CoreActivationViewSchema.nullable(),
  /** R-6: who has passed in the current command phase. */
  passed: PassedSidesSchema,
  rebelBase: RebelBaseSchema,
  contestedSystemIds: z.array(z.string()),
  outcome: z.strictObject({ winner: FactionSchema, reason: OutcomeReasonSchema }).nullable(),
  log: z.array(CoreViewEventSchema),
  legalActions: z.array(CoreLegalActionSchema),
});
export type CorePlayerView = z.infer<typeof CorePlayerViewSchema>;
/** Name used by plan-frontend (FE-0). */
export type PlayerViewCore = CorePlayerView;

// ---------------------------------------------------------------------------------------------------------
// Session view
// ---------------------------------------------------------------------------------------------------------

/** `kind: 'player'` of either engine, discriminated by `rulesEngine` (AM-BE-6). */
export const PlayerViewPlayerSchema = z.discriminatedUnion('rulesEngine', [
  MockPlayerViewSchema,
  CorePlayerViewSchema,
]);
export type PlayerViewPlayer = z.infer<typeof PlayerViewPlayerSchema>;

/**
 * Hot-seat handoff screen (`handoffPending`): public metadata ONLY (AM-BE-1, Q-12) — no systems, pieces,
 * rebel base, log, legal actions or settings. Strict: nothing else may ever be added by accident.
 * SWR-005 (AM-FE-8): + `rulesEngine` (public fact).
 */
export const HandoffViewSchema = z.strictObject({
  kind: z.literal('handoff'),
  rulesEngine: RulesEngineSchema,
  id: z.string(),
  version: z.number().int().positive(),
  activeSide: FactionIdSchema,
  round: z.number().int().positive(),
  phase: PhaseSchema,
  sessionStatus: SessionStatusSchema,
});
export type HandoffView = z.infer<typeof HandoffViewSchema>;

/** What a Rebellion session sends as `view`: the board of the active side (either engine) or the handoff screen. */
export const PlayerViewSchema = z.discriminatedUnion('kind', [
  PlayerViewPlayerSchema,
  HandoffViewSchema,
]);
export type PlayerView = z.infer<typeof PlayerViewSchema>;
export type PlayerViewKind = PlayerView['kind'];

/** `typeKey` value used for hidden enemy pieces in a `mock-v1` PlayerView. */
export const UNKNOWN_TYPE_KEY = 'unknown';
