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
import { CardIdSchema, checkCardInvariants } from '@bga/platform/cards';
import { PROBE_SYSTEM_IDS, probeInstanceId, probeSystemOf } from './card-catalog';
import { CoreCardsStateSchema, rebellionCardEngineContext } from './cards';
import { CoreTableStateSchema, TableTaskKindSchema } from './table';

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

// ---------------------------------------------------------------------------------------------------------
// SWR-010 card / physical-table events (plan-backend §4.1, §11.4). State forms are full; view forms redact.
// ---------------------------------------------------------------------------------------------------------

/** Refresh step 3: `side` drew `count` cards (`definitionIds` in draw order) from `fromZoneId` into `toZoneId`. */
export const CardsDrawnEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('CARDS_DRAWN'),
  actor: z.literal('system'),
  payload: z
    .strictObject({
      side: FactionSchema,
      fromZoneId: CardIdSchema,
      toZoneId: CardIdSchema,
      count: z.int().positive(),
      definitionIds: z.array(CardIdSchema).min(1),
    })
    .refine((p) => p.definitionIds.length === p.count, {
      message: 'definitionIds.length must equal count',
      path: ['definitionIds'],
    }),
});
export type CardsDrawnEvent = z.infer<typeof CardsDrawnEventSchema>;

/** Physical Hand: the human Rebels registered their Location card (secret until the base is revealed). */
export const CardRegisteredEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('CARD_REGISTERED'),
  actor: FactionSchema,
  payload: z.strictObject({ zoneId: CardIdSchema, definitionId: CardIdSchema }),
});
export type CardRegisteredEvent = z.infer<typeof CardRegisteredEventSchema>;

/** The human confirmed the head physical-table task (public). */
export const TableTaskConfirmedEventSchema = z.strictObject({
  ...eventBase,
  type: z.literal('TABLE_TASK_CONFIRMED'),
  actor: FactionSchema,
  payload: z.strictObject({ taskId: z.string(), kind: TableTaskKindSchema }),
});
export type TableTaskConfirmedEvent = z.infer<typeof TableTaskConfirmedEventSchema>;

/** View form: `definitionIds: null` when the viewer is not `side` (the count stays public). */
export const CardsDrawnViewEventSchema = CardsDrawnEventSchema.extend({
  payload: z
    .strictObject({
      side: FactionSchema,
      fromZoneId: CardIdSchema,
      toZoneId: CardIdSchema,
      count: z.int().positive(),
      definitionIds: z.array(CardIdSchema).nullable(),
    })
    .refine((p) => p.definitionIds === null || p.definitionIds.length === p.count, {
      message: 'definitionIds.length must equal count',
      path: ['definitionIds'],
    }),
});
export type CardsDrawnViewEvent = z.infer<typeof CardsDrawnViewEventSchema>;

/** View form: `definitionId: null` while the base is hidden from the viewer. */
export const CardRegisteredViewEventSchema = CardRegisteredEventSchema.extend({
  payload: z.strictObject({ zoneId: CardIdSchema, definitionId: CardIdSchema.nullable() }),
});
export type CardRegisteredViewEvent = z.infer<typeof CardRegisteredViewEventSchema>;

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
  CardsDrawnEventSchema,
  CardRegisteredEventSchema,
  TableTaskConfirmedEventSchema,
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
  CardsDrawnEventSchema,
  CardRegisteredEventSchema,
  TableTaskConfirmedEventSchema,
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
  CardsDrawnViewEventSchema,
  CardRegisteredViewEventSchema,
  TableTaskConfirmedEventSchema,
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
  CardsDrawnViewEventSchema,
  CardRegisteredViewEventSchema,
  TableTaskConfirmedEventSchema,
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
  /**
   * SWR-010 (plan-backend §3.1, D-3): card state. Absent = cards are not tracked in this game (created before
   * SWR-010); never `null` in storage. Optional → legacy rows parse byte-identically, no schemaVersion bump.
   */
  cards: CoreCardsStateSchema.optional(),
  /** SWR-010: physical-table queue; present exactly in `physical_companion` games. */
  table: CoreTableStateSchema.optional(),
});
type CoreGameStateObject = z.infer<typeof CoreGameStateObjectSchema>;

/**
 * Invariants of every STORED `core-v1` state (plan-backend §1.1 `coreInvariants`, with the SWR-005 revisions):
 * references exist; `activation` belongs to the active side and its leader stands in the activated system;
 * `outcome === null ⇒ phase === 'command'` and nobody has both passed; `outcome ⇒` no activation, no handoff;
 * AI game: no handoff. SWR-006 (AM-BE-2): the AI side MAY be active — the server runner commits every automated
 * step separately, so a stored state can wait for the AI's move (an interrupted run is resumed later). The
 * `mock-v1` rule "the player is always active" is unchanged.
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
  checkAiInvariant(state, ctx, false);
  checkCardsAndTable(state, issue);
}

const PROBE_COUNT = PROBE_SYSTEM_IDS.length;

/** SWR-010 invariants of `cards` / `table` (plan-backend §3.1). */
function checkCardsAndTable(
  state: CoreGameStateObject,
  issue: (path: (string | number)[], message: string) => void,
): void {
  const physical = state.settings.gameMode === 'physical_companion';
  const { cards, table } = state;
  if ((table !== undefined) !== physical) {
    issue(['table'], 'table is present exactly in physical_companion games');
  }
  if (physical && state.settings.opponentType !== 'ai') {
    issue(['settings', 'opponentType'], 'physical_companion is played against the AI only');
  }
  if (physical && cards === undefined) issue(['cards'], 'physical_companion games track cards');

  let locationEmpty = false;
  if (cards !== undefined) {
    for (const i of checkCardInvariants(cards.pile, rebellionCardEngineContext)) {
      issue(['cards', 'pile'], `card invariant ${i.code}${i.zoneId ? ` (${i.zoneId})` : ''}`);
    }
    if (cards.pile.instances.length !== PROBE_COUNT) {
      issue(['cards', 'pile', 'instances'], `exactly ${PROBE_COUNT} card instances`);
    }
    const zone = (id: string) => cards.pile.zones.find((z0) => z0.id === id)?.cards ?? [];
    const definitionOf = new Map(cards.pile.instances.map((c) => [c.id, c.definitionId]));
    const location = zone('rebels-location');
    const revealedZone = zone('rebels-base-revealed');
    locationEmpty = location.length === 0;
    if (location.length > 1) issue(['cards'], 'the Location holds at most one card');
    const locationCard = location[0];
    if (locationCard !== undefined) {
      const def = definitionOf.get(locationCard);
      if (def === undefined || probeSystemOf(def) !== state.rebelBase.systemId) {
        issue(['cards'], 'the Location card must name the rebel base system');
      }
    }
    if (state.rebelBase.revealed) {
      if (!locationEmpty) issue(['cards'], 'a revealed base leaves the Location empty');
      if (
        revealedZone.length !== 1 ||
        revealedZone[0] !== probeInstanceId(state.rebelBase.systemId)
      ) {
        issue(['cards'], 'a revealed base card lies on the Rebel Base space');
      }
    } else if (revealedZone.length > 0) {
      issue(['cards'], 'no revealed base card before the reveal');
    }
  }

  const pendingRegistration = cards !== undefined && locationEmpty && !state.rebelBase.revealed;
  const registration = table?.baseRegistration ?? null;
  const hasRegisterTask = table?.tasks.some((t) => t.kind === 'registerBase') ?? false;
  if ((registration !== null) !== hasRegisterTask) {
    issue(['table', 'baseRegistration'], 'baseRegistration iff a registerBase task is queued');
  }
  if ((registration !== null) !== pendingRegistration) {
    issue(['table', 'baseRegistration'], 'baseRegistration iff the Location awaits registration');
  }
  if (registration !== null && state.settings.playerFaction !== 'rebels') {
    issue(['table', 'baseRegistration'], 'only a human Rebel player registers the base');
  }
  if (table !== undefined) {
    const ids = table.tasks.map((t) => t.id);
    if (new Set(ids).size !== ids.length) issue(['table', 'tasks'], 'duplicate table task id');
    if (table.tasks.filter((t) => t.kind === 'registerBase').length > 1) {
      issue(['table', 'tasks'], 'at most one registerBase task');
    }
    table.tasks.forEach((t, i) => {
      // `register` is the completion of `registerBase` and of nothing else (rules/core/table.ts `task`).
      if ((t.kind === 'registerBase') !== (t.completion === 'register')) {
        issue(
          ['table', 'tasks', i, 'completion'],
          'completion is register iff kind is registerBase',
        );
      }
      // The title is fixed by the kind: `table.tasks.<kind>`.
      if (t.titleKey !== `table.tasks.${t.kind}`) {
        issue(['table', 'tasks', i, 'titleKey'], 'titleKey is table.tasks.<kind>');
      }
    });
  }
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
