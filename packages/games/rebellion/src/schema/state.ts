import { z } from 'zod';
import {
  FactionIdSchema,
  FactionSchema,
  OutcomeReasonSchema,
  PhaseSchema,
  PieceKindSchema,
} from './enums';
import { RegionDataSchema, SystemDataSchema, UnitTypeSchema } from './data';
import { REBELLION_STATE_SCHEMA_VERSION, RebellionSettingsSchema } from './settings';

/** A system of the MOCK map (`mock-v1`; the `core-v1` map uses `SystemData`). */
export const SystemSchema = z.strictObject({
  id: z.string().min(1),
  /** i18n key, `systems.<id>` */
  nameKey: z.string(),
  regionId: z.string(),
  adjacentSystemIds: z.array(z.string()),
});
export type System = z.infer<typeof SystemSchema>;

/** A piece of the MOCK scenario (`mock-v1`; `core-v1` uses `CoreUnit` / `CoreLeader`). */
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

/** Rebel base of a `mock-v1` state and of every player view (`systemId: null` = hidden from the Empire). */
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

/** `mock-v1` only. */
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

/** `mock-v1` only. Hot-seat: `actor` passed the turn to `toSide` (handoff pending). No secrets. */
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

// ---------------------------------------------------------------------------------------------------------
// core-v1 events (SWR-005, plan-backend §1.2). Shared with mock-v1: GAME_CREATED, PIECES_MOVED, HANDOFF_ACCEPTED.
// ---------------------------------------------------------------------------------------------------------

/** The engine started a phase (R-2, R-7: assignment and refresh pass automatically inside a command). */
export const PhaseStartedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('PHASE_STARTED'),
  actor: z.literal('system'),
  payload: z.strictObject({ round: z.int().positive(), phase: PhaseSchema }),
});
export type PhaseStartedEvent = z.infer<typeof PhaseStartedEventSchema>;

/** R-4: `actor` placed `leaderId` from its pool in `systemId`. Secret while Rebels activate the hidden base. */
export const SystemActivatedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('SYSTEM_ACTIVATED'),
  actor: FactionSchema,
  payload: z.strictObject({ leaderId: z.string(), systemId: z.string() }),
});
export type SystemActivatedEvent = z.infer<typeof SystemActivatedEventSchema>;

/** `actor` finished its activation; `auto` = the server's automatic AI move (AM-BE-4). */
export const ActivationFinishedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('ACTIVATION_FINISHED'),
  actor: FactionSchema,
  payload: z.strictObject({ auto: z.boolean() }),
});
export type ActivationFinishedEvent = z.infer<typeof ActivationFinishedEventSchema>;

/** R-6: `actor` passed for the rest of the command phase; `auto` = automatic AI move (AM-BE-4). */
export const PassedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('PASSED'),
  actor: FactionSchema,
  payload: z.strictObject({ auto: z.boolean() }),
});
export type PassedEvent = z.infer<typeof PassedEventSchema>;

/** R-7 step 1: these leaders went from the map back to their owners' pools (order = `state.leaders`). */
export const LeadersReturnedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('LEADERS_RETURNED'),
  actor: z.literal('system'),
  payload: z.strictObject({ leaderIds: z.array(z.string()) }),
});
export type LeadersReturnedEvent = z.infer<typeof LeadersReturnedEventSchema>;

/** R-7 step 5: the time marker moved `from → to`. */
export const TimeAdvancedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('TIME_ADVANCED'),
  actor: z.literal('system'),
  payload: z.strictObject({ from: z.int().positive(), to: z.int().positive() }),
});
export type TimeAdvancedEvent = z.infer<typeof TimeAdvancedEventSchema>;

/** R-8: the rebel base was revealed to both sides (created only at the reveal → public). */
export const BaseRevealedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('BASE_REVEALED'),
  actor: z.literal('system'),
  payload: z.strictObject({ systemId: z.string() }),
});
export type BaseRevealedEvent = z.infer<typeof BaseRevealedEventSchema>;

/** R-9: the game is over (no system in the payload). */
export const GameOverEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('GAME_OVER'),
  actor: z.literal('system'),
  payload: z.strictObject({ winner: FactionSchema, reason: OutcomeReasonSchema }),
});
export type GameOverEvent = z.infer<typeof GameOverEventSchema>;

/** Log of a `mock-v1` state: exactly the five SWR-004 event types. */
export const MockEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedEventSchema,
  PhaseAdvancedEventSchema,
  TurnEndedEventSchema,
  HandoffAcceptedEventSchema,
]);
export type MockEvent = z.infer<typeof MockEventSchema>;

/** Log of a `core-v1` state (full, unredacted: never sent to a client as is). */
export const CoreEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedEventSchema,
  HandoffAcceptedEventSchema,
  PhaseStartedEventSchema,
  SystemActivatedEventSchema,
  ActivationFinishedEventSchema,
  PassedEventSchema,
  LeadersReturnedEventSchema,
  TimeAdvancedEventSchema,
  BaseRevealedEventSchema,
  GameOverEventSchema,
]);
export type CoreEvent = z.infer<typeof CoreEventSchema>;

/** Any stored event of either engine (state logs, `SessionEvent` mirror, module event type). */
export const GameEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedEventSchema,
  PhaseAdvancedEventSchema,
  TurnEndedEventSchema,
  HandoffAcceptedEventSchema,
  PhaseStartedEventSchema,
  SystemActivatedEventSchema,
  ActivationFinishedEventSchema,
  PassedEventSchema,
  LeadersReturnedEventSchema,
  TimeAdvancedEventSchema,
  BaseRevealedEventSchema,
  GameOverEventSchema,
]);
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameEventType = GameEvent['type'];

/**
 * View form of the `core-v1` events (plan-backend §1.2, AM-BE-7): the same events, but the systems of
 * `SYSTEM_ACTIVATED` and `PIECES_MOVED` may be `null` = the hidden rebel-base zone (Empire before the reveal).
 * Only VIEW schemas accept `null`; the state schema never does.
 */
export const SystemActivatedViewEventSchema = SystemActivatedEventSchema.extend({
  payload: z.strictObject({ leaderId: z.string(), systemId: z.string().nullable() }),
});
export const PiecesMovedViewEventSchema = PiecesMovedEventSchema.extend({
  payload: z.strictObject({
    pieceIds: z.array(z.string()),
    fromSystemId: z.string().nullable(),
    toSystemId: z.string().nullable(),
  }),
});
export const CoreViewEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedViewEventSchema,
  HandoffAcceptedEventSchema,
  PhaseStartedEventSchema,
  SystemActivatedViewEventSchema,
  ActivationFinishedEventSchema,
  PassedEventSchema,
  LeadersReturnedEventSchema,
  TimeAdvancedEventSchema,
  BaseRevealedEventSchema,
  GameOverEventSchema,
]);
export type CoreViewEvent = z.infer<typeof CoreViewEventSchema>;

/**
 * Events as a client may receive them (view `log`, command response `events`): mock events, or redacted
 * core events. `PIECES_MOVED` uses the nullable view form (a superset of the mock event).
 */
export const PlayerEventSchema = z.discriminatedUnion('type', [
  GameCreatedEventSchema,
  PiecesMovedViewEventSchema,
  PhaseAdvancedEventSchema,
  TurnEndedEventSchema,
  HandoffAcceptedEventSchema,
  PhaseStartedEventSchema,
  SystemActivatedViewEventSchema,
  ActivationFinishedEventSchema,
  PassedEventSchema,
  LeadersReturnedEventSchema,
  TimeAdvancedEventSchema,
  BaseRevealedEventSchema,
  GameOverEventSchema,
]);
export type PlayerEvent = z.infer<typeof PlayerEventSchema>;

export const SystemsSchema = z.array(SystemSchema);
export const PiecesSchema = z.array(PieceSchema);
/** Log of a `mock-v1` state / mock player view. */
export const GameLogSchema = z.array(MockEventSchema);

// ---------------------------------------------------------------------------------------------------------
// State v3 = discriminated union by `rulesEngine` (BD-1)
// ---------------------------------------------------------------------------------------------------------

function checkAiInvariant(
  state: {
    settings: { opponentType: string; playerFaction: string };
    activeSide: string;
    handoffPending: boolean;
  },
  ctx: z.RefinementCtx,
  activeMustBePlayer: boolean,
): void {
  if (state.settings.opponentType !== 'ai') return;
  if (activeMustBePlayer && state.activeSide !== state.settings.playerFaction) {
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

/**
 * `mock-v1` state = the SWR-004 v2 state + `schemaVersion: 3`, `rulesEngine: 'mock-v1'` (upcast of v1/v2 rows;
 * new sessions until SWR-005 W5). Never sent to clients. No visual coordinates.
 * Invariant: in an AI game the human side is always active and there is never a pending handoff.
 */
export const MockGameStateV3Schema = z
  .strictObject({
    schemaVersion: z.literal(REBELLION_STATE_SCHEMA_VERSION),
    rulesEngine: z.literal('mock-v1'),
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
  .superRefine((state, ctx) => checkAiInvariant(state, ctx, true));
export type MockGameStateV3 = z.infer<typeof MockGameStateV3Schema>;
export type MockGameState = MockGameStateV3;

/** A unit on the `core-v1` map. `id` is opaque (`u-NN`, data order — never depends on the base). */
export const CoreUnitSchema = z.strictObject({
  id: z.string().min(1),
  owner: FactionSchema,
  typeKey: z.string().min(1),
  systemId: z.string().min(1),
});
export type CoreUnit = z.infer<typeof CoreUnitSchema>;

/** A leader: `systemId: null` = in its owner's pool; `canActivate` copied from the data (R-4). */
export const CoreLeaderSchema = z.strictObject({
  id: z.string().min(1),
  owner: FactionSchema,
  canActivate: z.boolean(),
  systemId: z.string().min(1).nullable(),
});
export type CoreLeader = z.infer<typeof CoreLeaderSchema>;

/** The running activation of the active side (R-4/R-5). */
export const ActivationSchema = z.strictObject({
  side: FactionSchema,
  leaderId: z.string().min(1),
  systemId: z.string().min(1),
});
export type Activation = z.infer<typeof ActivationSchema>;

/** End of the game (R-9). */
export const OutcomeSchema = z.strictObject({
  winner: FactionSchema,
  reason: OutcomeReasonSchema,
});
export type Outcome = z.infer<typeof OutcomeSchema>;

/** R-6: who has passed in the current command phase (a pass lasts until the phase ends; Q-BE-2). */
export const PassedSidesSchema = z.strictObject({
  rebels: z.boolean(),
  empire: z.boolean(),
});
export type PassedSides = z.infer<typeof PassedSidesSchema>;

/** Rebel base in the FULL `core-v1` state: the system is always known to the server. */
export const CoreRebelBaseSchema = z.strictObject({
  systemId: z.string().min(1),
  revealed: z.boolean(),
});
export type CoreRebelBase = z.infer<typeof CoreRebelBaseSchema>;

/** Static data copied into the state at creation (BD-2): the state is self-contained for replay. */
export const CoreMapSchema = z.strictObject({
  regions: z.array(RegionDataSchema),
  systems: z.array(SystemDataSchema),
});
export type CoreMap = z.infer<typeof CoreMapSchema>;

const CoreGameStateObjectSchema = z.strictObject({
  schemaVersion: z.literal(REBELLION_STATE_SCHEMA_VERSION),
  rulesEngine: z.literal('core-v1'),
  id: z.string(),
  version: z.number().int().positive(),
  settings: RebellionSettingsSchema,
  /** Side whose turn it is (R-3). */
  activeSide: FactionIdSchema,
  /** Hot-seat: the active side changed and the next player has not taken the seat yet. */
  handoffPending: z.boolean(),
  /** `CoreData.id` the game was created from. */
  scenarioId: z.string().min(1),
  /** Position of the time marker = round number (R-1). */
  round: z.int().positive(),
  /** Reputation marker (R-1; does not move in core-v1). */
  reputation: z.int().positive(),
  /** Stored: always `command`; `refresh` only together with `outcome` (Q-6). */
  phase: PhaseSchema,
  passed: PassedSidesSchema,
  activation: ActivationSchema.nullable(),
  map: CoreMapSchema,
  unitTypes: z.array(UnitTypeSchema),
  units: z.array(CoreUnitSchema),
  leaders: z.array(CoreLeaderSchema),
  rebelBase: CoreRebelBaseSchema,
  outcome: OutcomeSchema.nullable(),
  log: z.array(CoreEventSchema),
});
type CoreGameStateObject = z.infer<typeof CoreGameStateObjectSchema>;

/**
 * Invariants of every STORED `core-v1` state (plan-backend §1.1 `coreInvariants`, with the SWR-005 revisions):
 * references exist; `activation` belongs to the active side and its leader stands in the activated system;
 * `outcome === null ⇒ phase === 'command'` and nobody has both passed; `outcome ⇒` no activation, no handoff;
 * AI game: no handoff, and without `outcome` the player is active. Transient states inside the AI auto-play
 * loop are never stored nor parsed.
 */
function checkCoreInvariants(state: CoreGameStateObject, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const systemIds = new Set(state.map.systems.map((s) => s.id));
  const typeKeys = new Map(state.unitTypes.map((t) => [t.typeKey, t]));
  const leaders = new Map(state.leaders.map((l) => [l.id, l]));

  state.units.forEach((u, i) => {
    if (!systemIds.has(u.systemId)) issue(['units', i, 'systemId'], `unknown system ${u.systemId}`);
    const type = typeKeys.get(u.typeKey);
    if (!type) issue(['units', i, 'typeKey'], `unknown unit type ${u.typeKey}`);
    else if (type.owner !== u.owner)
      issue(['units', i, 'owner'], 'owner differs from its unit type');
  });
  state.leaders.forEach((l, i) => {
    if (l.systemId !== null && !systemIds.has(l.systemId)) {
      issue(['leaders', i, 'systemId'], `unknown system ${l.systemId}`);
    }
  });
  if (!systemIds.has(state.rebelBase.systemId)) {
    issue(['rebelBase', 'systemId'], 'unknown rebel base system');
  }
  if (new Set(state.units.map((u) => u.id)).size !== state.units.length) {
    issue(['units'], 'duplicate unit id');
  }
  if (leaders.size !== state.leaders.length) issue(['leaders'], 'duplicate leader id');

  if (state.activation) {
    const a = state.activation;
    if (a.side !== state.activeSide)
      issue(['activation', 'side'], 'activation of a non-active side');
    if (!systemIds.has(a.systemId)) issue(['activation', 'systemId'], 'unknown system');
    const leader = leaders.get(a.leaderId);
    if (!leader || leader.owner !== a.side || leader.systemId !== a.systemId) {
      issue(['activation', 'leaderId'], 'the activating leader must stand in the activated system');
    }
    if (state.passed[a.side]) issue(['passed'], 'a side that passed cannot be activating');
  }

  if (state.outcome === null) {
    if (state.phase !== 'command')
      issue(['phase'], 'a running game is stored in the command phase');
    if (state.passed.rebels && state.passed.empire) {
      issue(['passed'], 'both sides passed: the command phase must have ended');
    }
    if (state.passed[state.activeSide]) {
      issue(['activeSide'], 'the active side has already passed');
    }
  } else {
    if (state.activation !== null) issue(['activation'], 'no activation after the game is over');
    if (state.handoffPending) issue(['handoffPending'], 'no handoff after the game is over');
  }
  checkAiInvariant(state, ctx, state.outcome === null);
}

/** Full authoritative `core-v1` state (never sent to clients; `rebelBase.systemId` always set). */
export const CoreGameStateV3Schema = CoreGameStateObjectSchema.superRefine(checkCoreInvariants);
export type CoreGameStateV3 = z.infer<typeof CoreGameStateV3Schema>;
export type CoreGameState = CoreGameStateV3;

/** Stored state `schemaVersion: 3` — one of the two engines (BD-1). Older snapshots are upcast on read. */
export const GameStateSchema = z.discriminatedUnion('rulesEngine', [
  MockGameStateV3Schema,
  CoreGameStateV3Schema,
]);
export type GameState = z.infer<typeof GameStateSchema>;
