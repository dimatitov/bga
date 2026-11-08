/**
 * `core-v1` test fixtures (SWR-005 plan-frontend §11 FE-0): player views typed with the FROZEN schema
 * (`PlayerViewCore`, plan-backend §8.2 + spec rev. 2: `passed`, `canActivate`, handoff `rulesEngine`). Test-only.
 * A small slice of the base-game map (real ids, fictional adjacency/positions are irrelevant here): enough for
 * the dispatcher, the view model, the stores and the panels. Every builder returns a view that passes
 * `PlayerViewSchema` (checked in `viewModel.test.ts`).
 */
import type {
  CoreLeaderView,
  CoreUnitView,
  CoreViewEvent,
  FactionId,
  HandoffView,
  OutcomeReason,
  PlayerViewCore,
  RebellionSettings,
  UnitType,
} from '@bga/game-rebellion/schema';
import type { SessionEnvelope } from '@/platform';
import { makeRebellionSession } from './fixtures';

export const CORE_SESSION_ID = 'core-fixture-1';

// Systems (regions r1 / r2).
export const CS_CORUSCANT = 'coruscant';
export const CS_CORELLIA = 'corellia';
export const CS_ALDERAAN = 'alderaan';
export const CS_SULLUST = 'sullust';
/** Remote. The rebel base of the fixtures (visible to the Rebels, hidden from the Empire in `makeCoreEmpireView`). */
export const CS_YAVIN = 'yavin';
/** Remote. */
export const CS_HOTH = 'hoth';

// Leaders.
export const L_VADER = 'vader';
export const L_PALPATINE = 'palpatine';
export const L_TARKIN = 'tarkin';
export const L_TAGGE = 'tagge';
export const L_LEIA = 'leia';
/** `canActivate: false` (no tactic values, R-4). */
export const L_MOTHMA = 'mon-mothma';
export const L_DODONNA = 'dodonna';
export const L_RIEEKAN = 'rieekan';

// Units.
export const U_SD = 'u-e-sd';
export const U_ST1 = 'u-e-st1';
export const U_ST2 = 'u-e-st2';
export const U_TIE = 'u-e-tie';
export const U_TRANSPORT = 'u-r-transport';
export const U_RT_SULLUST = 'u-r-trooper-sullust';
export const U_XWING = 'u-r-xwing';
export const U_RT_BASE = 'u-r-trooper-base';
export const U_SHIELD = 'u-r-shield';

const AT = '2026-11-08T10:00:00.000Z';

export const CORE_REBELS_VS_AI: RebellionSettings = {
  playerFaction: 'rebels',
  opponentFaction: 'empire',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
};

export const CORE_EMPIRE_VS_AI: RebellionSettings = {
  ...CORE_REBELS_VS_AI,
  playerFaction: 'empire',
  opponentFaction: 'rebels',
};

export const CORE_HOT_SEAT: RebellionSettings = {
  ...CORE_REBELS_VS_AI,
  opponentType: 'human',
  aiDifficulty: null,
};

export const CORE_UNIT_TYPES: UnitType[] = [
  {
    typeKey: 'unit.empire.star-destroyer',
    owner: 'empire',
    arena: 'space',
    mobility: 'mobile',
    transportCapacity: 6,
    requiresTransport: false,
  },
  {
    typeKey: 'unit.empire.stormtrooper',
    owner: 'empire',
    arena: 'ground',
    mobility: 'mobile',
    transportCapacity: 0,
    requiresTransport: true,
  },
  {
    typeKey: 'unit.empire.tie-fighter',
    owner: 'empire',
    arena: 'space',
    mobility: 'mobile',
    transportCapacity: 0,
    requiresTransport: true,
  },
  {
    typeKey: 'unit.rebels.rebel-transport',
    owner: 'rebels',
    arena: 'space',
    mobility: 'mobile',
    transportCapacity: 4,
    requiresTransport: false,
  },
  {
    typeKey: 'unit.rebels.x-wing',
    owner: 'rebels',
    arena: 'space',
    mobility: 'mobile',
    transportCapacity: 0,
    requiresTransport: false,
  },
  {
    typeKey: 'unit.rebels.rebel-trooper',
    owner: 'rebels',
    arena: 'ground',
    mobility: 'mobile',
    transportCapacity: 0,
    requiresTransport: true,
  },
  {
    typeKey: 'unit.rebels.shield-generator',
    owner: 'rebels',
    arena: 'ground',
    mobility: 'immobile',
    transportCapacity: 0,
    requiresTransport: false,
  },
];

const sys = (id: string) => ({ kind: 'system' as const, systemId: id });
const POOL = { kind: 'pool' as const };
const BASE = { kind: 'rebelBase' as const };

/** Units as the Rebels see them (base system known). */
function rebelsUnits(): CoreUnitView[] {
  return [
    {
      id: U_SD,
      owner: 'empire',
      typeKey: 'unit.empire.star-destroyer',
      location: sys(CS_CORUSCANT),
    },
    {
      id: U_ST1,
      owner: 'empire',
      typeKey: 'unit.empire.stormtrooper',
      location: sys(CS_CORUSCANT),
    },
    {
      id: U_ST2,
      owner: 'empire',
      typeKey: 'unit.empire.stormtrooper',
      location: sys(CS_CORUSCANT),
    },
    { id: U_TIE, owner: 'empire', typeKey: 'unit.empire.tie-fighter', location: sys(CS_CORUSCANT) },
    {
      id: U_TRANSPORT,
      owner: 'rebels',
      typeKey: 'unit.rebels.rebel-transport',
      location: sys(CS_SULLUST),
    },
    {
      id: U_RT_SULLUST,
      owner: 'rebels',
      typeKey: 'unit.rebels.rebel-trooper',
      location: sys(CS_SULLUST),
    },
    { id: U_XWING, owner: 'rebels', typeKey: 'unit.rebels.x-wing', location: sys(CS_YAVIN) },
    {
      id: U_RT_BASE,
      owner: 'rebels',
      typeKey: 'unit.rebels.rebel-trooper',
      location: sys(CS_YAVIN),
    },
    {
      id: U_SHIELD,
      owner: 'rebels',
      typeKey: 'unit.rebels.shield-generator',
      location: sys(CS_YAVIN),
    },
  ];
}

function poolLeaders(): CoreLeaderView[] {
  return [
    { id: L_PALPATINE, owner: 'empire', canActivate: true, location: POOL },
    { id: L_VADER, owner: 'empire', canActivate: true, location: POOL },
    { id: L_TARKIN, owner: 'empire', canActivate: true, location: POOL },
    { id: L_TAGGE, owner: 'empire', canActivate: true, location: POOL },
    { id: L_MOTHMA, owner: 'rebels', canActivate: false, location: POOL },
    { id: L_LEIA, owner: 'rebels', canActivate: true, location: POOL },
    { id: L_DODONNA, owner: 'rebels', canActivate: true, location: POOL },
    { id: L_RIEEKAN, owner: 'rebels', canActivate: true, location: POOL },
  ];
}

export const CORE_SYSTEM_IDS_FIXTURE = [
  CS_CORUSCANT,
  CS_CORELLIA,
  CS_ALDERAAN,
  CS_SULLUST,
  CS_YAVIN,
  CS_HOTH,
] as const;

function baseLog(): CoreViewEvent[] {
  return [
    { seq: 1, at: AT, type: 'GAME_CREATED', actor: 'system', payload: { scenarioId: 'core-v1' } },
    {
      seq: 2,
      at: AT,
      type: 'PHASE_STARTED',
      actor: 'system',
      payload: { round: 1, phase: 'command' },
    },
  ];
}

/**
 * Rebels (player, vs AI Empire) at the start of round 1, command phase, their turn: `ACTIVATE_SYSTEM` for the
 * three leaders that can activate (not Mon Mothma) × every system, and `PASS`. The base (Yavin) is visible.
 */
export function makeCoreView(overrides: Partial<PlayerViewCore> = {}): PlayerViewCore {
  return {
    kind: 'player',
    rulesEngine: 'core-v1',
    viewer: 'rebels',
    activeSide: 'rebels',
    settings: { ...CORE_REBELS_VS_AI },
    id: CORE_SESSION_ID,
    version: 2,
    round: 1,
    phase: 'command',
    markers: { time: 1, reputation: 14 },
    map: {
      regions: [
        { id: 'r1', nameKey: 'regions.r1' },
        { id: 'r2', nameKey: 'regions.r2' },
      ],
      systems: [
        {
          id: CS_CORUSCANT,
          nameKey: `systems.${CS_CORUSCANT}`,
          regionId: 'r1',
          adjacentSystemIds: [CS_CORELLIA, CS_ALDERAAN],
          remote: false,
        },
        {
          id: CS_CORELLIA,
          nameKey: `systems.${CS_CORELLIA}`,
          regionId: 'r1',
          adjacentSystemIds: [CS_CORUSCANT, CS_SULLUST, CS_YAVIN],
          remote: false,
        },
        {
          id: CS_ALDERAAN,
          nameKey: `systems.${CS_ALDERAAN}`,
          regionId: 'r1',
          adjacentSystemIds: [CS_CORUSCANT],
          remote: false,
        },
        {
          id: CS_SULLUST,
          nameKey: `systems.${CS_SULLUST}`,
          regionId: 'r2',
          adjacentSystemIds: [CS_CORELLIA, CS_HOTH],
          remote: false,
        },
        {
          id: CS_YAVIN,
          nameKey: `systems.${CS_YAVIN}`,
          regionId: 'r2',
          adjacentSystemIds: [CS_CORELLIA],
          remote: true,
        },
        {
          id: CS_HOTH,
          nameKey: `systems.${CS_HOTH}`,
          regionId: 'r2',
          adjacentSystemIds: [CS_SULLUST],
          remote: true,
        },
      ],
    },
    unitTypes: CORE_UNIT_TYPES.map((t) => ({ ...t })),
    units: rebelsUnits(),
    leaders: poolLeaders(),
    activation: null,
    passed: { rebels: false, empire: false },
    rebelBase: { systemId: CS_YAVIN, revealed: false },
    contestedSystemIds: [],
    outcome: null,
    log: baseLog(),
    legalActions: [
      {
        type: 'ACTIVATE_SYSTEM',
        leaderIds: [L_LEIA, L_DODONNA, L_RIEEKAN],
        systemIds: [...CORE_SYSTEM_IDS_FIXTURE],
      },
      { type: 'PASS' },
    ],
    ...overrides,
  };
}

/**
 * Rebels after `ACTIVATE_SYSTEM { leia, corellia }` (version + 1): two move sources — Sullust (transport + trooper)
 * and Yavin (X-wing + trooper; the shield generator is immobile, so not a candidate) — and `FINISH_ACTIVATION`.
 */
export function makeCoreActivationView(overrides: Partial<PlayerViewCore> = {}): PlayerViewCore {
  const base = makeCoreView();
  return makeCoreView({
    version: base.version + 1,
    leaders: base.leaders.map((l) => (l.id === L_LEIA ? { ...l, location: sys(CS_CORELLIA) } : l)),
    activation: { side: 'rebels', leaderId: L_LEIA, location: sys(CS_CORELLIA) },
    log: [
      ...base.log,
      {
        seq: 3,
        at: AT,
        type: 'SYSTEM_ACTIVATED',
        actor: 'rebels',
        payload: { leaderId: L_LEIA, systemId: CS_CORELLIA },
      },
    ],
    legalActions: [
      {
        type: 'MOVE_PIECES',
        fromSystemId: CS_SULLUST,
        toSystemId: CS_CORELLIA,
        pieces: [
          { pieceId: U_TRANSPORT, transportCapacity: 4, requiresTransport: false },
          { pieceId: U_RT_SULLUST, transportCapacity: 0, requiresTransport: true },
        ],
      },
      {
        type: 'MOVE_PIECES',
        fromSystemId: CS_YAVIN,
        toSystemId: CS_CORELLIA,
        pieces: [
          { pieceId: U_XWING, transportCapacity: 0, requiresTransport: false },
          { pieceId: U_RT_BASE, transportCapacity: 0, requiresTransport: true },
        ],
      },
      { type: 'FINISH_ACTIVATION' },
    ],
    ...overrides,
  });
}

/**
 * The Empire (player, vs AI Rebels) before the reveal: the base system is hidden — `rebelBase.systemId: null`,
 * Rebel units of the base system are in the zone (`location.kind === 'rebelBase'`); the AI Rebels have passed.
 */
export function makeCoreEmpireView(overrides: Partial<PlayerViewCore> = {}): PlayerViewCore {
  const base = makeCoreView();
  return makeCoreView({
    viewer: 'empire',
    activeSide: 'empire',
    settings: { ...CORE_EMPIRE_VS_AI },
    version: 3,
    units: base.units.map((u) =>
      u.location.kind === 'system' && u.location.systemId === CS_YAVIN
        ? { ...u, location: BASE }
        : u,
    ),
    passed: { rebels: true, empire: false },
    rebelBase: { systemId: null, revealed: false },
    log: [
      ...base.log,
      { seq: 3, at: AT, type: 'PASSED', actor: 'rebels', payload: { auto: true } },
    ],
    legalActions: [
      {
        type: 'ACTIVATE_SYSTEM',
        leaderIds: [L_PALPATINE, L_VADER, L_TARKIN, L_TAGGE],
        systemIds: [...CORE_SYSTEM_IDS_FIXTURE],
      },
      { type: 'PASS' },
    ],
    ...overrides,
  });
}

/** The game is over (`outcome` set, phase `refresh`, no legal actions); the base is visible to both sides (Q-14). */
export function makeCoreOutcomeView(
  winner: FactionId = 'rebels',
  reason: OutcomeReason = winner === 'rebels' ? 'timeReachedReputation' : 'rebelBaseCaptured',
  overrides: Partial<PlayerViewCore> = {},
): PlayerViewCore {
  const base = makeCoreView();
  return makeCoreView({
    version: 40,
    round: 14,
    phase: 'refresh',
    markers: { time: 14, reputation: 14 },
    outcome: { winner, reason },
    rebelBase: { systemId: CS_YAVIN, revealed: reason === 'rebelBaseCaptured' },
    log: [
      ...base.log,
      {
        seq: 3,
        at: AT,
        type: 'GAME_OVER',
        actor: 'system',
        payload: { winner, reason },
      },
    ],
    legalActions: [],
    ...overrides,
  });
}

/** Hot-seat handoff screen of a `core-v1` session (8 public keys, Q-38). */
export function makeCoreHandoffView(overrides: Partial<HandoffView> = {}): HandoffView {
  return {
    kind: 'handoff',
    rulesEngine: 'core-v1',
    id: CORE_SESSION_ID,
    version: 4,
    activeSide: 'empire',
    round: 1,
    phase: 'command',
    sessionStatus: 'prototype',
    ...overrides,
  };
}

/** Session envelope of a `core-v1` view; `settings` follow the view (handoff views carry none). */
export function makeCoreSession(
  view: PlayerViewCore | HandoffView = makeCoreView(),
  overrides: Partial<Omit<SessionEnvelope, 'view'>> = {},
): SessionEnvelope {
  return makeRebellionSession(view, {
    settings: { ...(view.kind === 'player' ? view.settings : CORE_HOT_SEAT) },
    ...overrides,
  });
}
