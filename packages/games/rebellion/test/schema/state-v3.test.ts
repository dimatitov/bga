/**
 * SWR-005 W1: state v3 = discriminated union by `rulesEngine` (BD-1), `core-v1` invariants, events (state vs
 * view form), view / handoff / commands / error keys / details of the frozen contract.
 */
import { describe, expect, it } from 'vitest';
import {
  CommandEnvelopeSchema,
  CommandOkSchema,
  CoreEventSchema,
  CoreGameStateV3Schema,
  CorePlayerViewSchema,
  CoreViewEventSchema,
  GameEventSchema,
  GameStateSchema,
  HandoffViewSchema,
  MockEventSchema,
  MockGameStateV3Schema,
  PlayerEventSchema,
  PlayerViewSchema,
  REBELLION_ERROR_MESSAGE_KEYS,
  REBELLION_SETUP_SCHEMA_VERSION,
  REBELLION_STATE_SCHEMA_VERSION,
  RebellionSessionDetailsSchema,
  type CoreGameStateV3,
} from '../../src/schema';
import { AT, EMPIRE_VS_AI, coreEmpireView, coreState } from './core-sample';

function messages(state: unknown): string[] {
  const parsed = GameStateSchema.safeParse(state);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
}

function changed(change: (s: CoreGameStateV3) => void, base = coreState()): CoreGameStateV3 {
  const s = structuredClone(base);
  change(s);
  return s;
}

const MOVE_IN_BASE = {
  seq: 4,
  type: 'PIECES_MOVED',
  actor: 'rebels',
  payload: { pieceIds: ['u-05'], fromSystemId: 'c', toSystemId: null },
  at: AT,
} as const;

describe('versions (AM-BE-9)', () => {
  it('setup stays v2, state is v3', () => {
    expect(REBELLION_SETUP_SCHEMA_VERSION).toBe(2);
    expect(REBELLION_STATE_SCHEMA_VERSION).toBe(3);
  });
});

describe('GameStateSchema v3 — union by rulesEngine', () => {
  it('a core-v1 state parses into the core branch, unchanged', () => {
    const state = coreState();
    const parsed = GameStateSchema.parse(state);
    expect(parsed.rulesEngine).toBe('core-v1');
    expect(parsed).toEqual(state);
    expect(CoreGameStateV3Schema.parse(state)).toEqual(state);
  });

  it('rulesEngine decides the branch: core data under mock-v1 (or unknown engine / v2) is rejected', () => {
    expect(GameStateSchema.safeParse({ ...coreState(), rulesEngine: 'mock-v1' }).success).toBe(
      false,
    );
    expect(GameStateSchema.safeParse({ ...coreState(), rulesEngine: 'core-v2' }).success).toBe(
      false,
    );
    expect(GameStateSchema.safeParse({ ...coreState(), schemaVersion: 2 }).success).toBe(false);
    const { rulesEngine: _r, ...noEngine } = coreState();
    expect(GameStateSchema.safeParse(noEngine).success).toBe(false);
    expect(MockGameStateV3Schema.safeParse(coreState()).success).toBe(false);
  });

  it('strict: unknown keys are rejected; the full state never holds a null base system', () => {
    expect(GameStateSchema.safeParse({ ...coreState(), consecutivePasses: 0 }).success).toBe(false);
    expect(
      GameStateSchema.safeParse(
        changed((s) => ((s.rebelBase as { systemId: unknown }).systemId = null)),
      ).success,
    ).toBe(false);
  });

  it('a null system in an event is accepted only by the VIEW event schema', () => {
    expect(CoreViewEventSchema.safeParse(MOVE_IN_BASE).success).toBe(true);
    expect(PlayerEventSchema.safeParse(MOVE_IN_BASE).success).toBe(true);
    expect(CoreEventSchema.safeParse(MOVE_IN_BASE).success).toBe(false);
    expect(GameEventSchema.safeParse(MOVE_IN_BASE).success).toBe(false);
    const state = changed((s) => s.log.push(MOVE_IN_BASE as never));
    expect(GameStateSchema.safeParse(state).success).toBe(false);
    const activated = {
      seq: 4,
      type: 'SYSTEM_ACTIVATED',
      actor: 'rebels',
      payload: { leaderId: 'leia', systemId: null },
      at: AT,
    };
    expect(CoreViewEventSchema.safeParse(activated).success).toBe(true);
    expect(CoreEventSchema.safeParse(activated).success).toBe(false);
  });

  it('engine event sets: mock events in a core log (and core events in a mock log) are rejected', () => {
    const phaseAdvanced = {
      seq: 4,
      type: 'PHASE_ADVANCED',
      actor: 'rebels',
      payload: { fromRound: 1, fromPhase: 'command', toRound: 1, toPhase: 'refresh' },
      at: AT,
    };
    const passed = { seq: 4, type: 'PASSED', actor: 'rebels', payload: { auto: true }, at: AT };
    expect(CoreEventSchema.safeParse(phaseAdvanced).success).toBe(false);
    expect(MockEventSchema.safeParse(passed).success).toBe(false);
    expect(GameEventSchema.safeParse(phaseAdvanced).success).toBe(true);
    expect(GameEventSchema.safeParse(passed).success).toBe(true);
    expect(CoreEventSchema.safeParse({ ...passed, payload: {} }).success).toBe(false); // auto required
  });

  it('every core-v1 event type parses (system actor where the engine acts)', () => {
    const events = [
      { type: 'PHASE_STARTED', actor: 'system', payload: { round: 2, phase: 'refresh' } },
      { type: 'SYSTEM_ACTIVATED', actor: 'empire', payload: { leaderId: 'vader', systemId: 'b' } },
      { type: 'ACTIVATION_FINISHED', actor: 'empire', payload: { auto: false } },
      { type: 'PASSED', actor: 'rebels', payload: { auto: true } },
      { type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: ['vader'] } },
      { type: 'TIME_ADVANCED', actor: 'system', payload: { from: 1, to: 2 } },
      { type: 'BASE_REVEALED', actor: 'system', payload: { systemId: 'd' } },
      {
        type: 'GAME_OVER',
        actor: 'system',
        payload: { winner: 'empire', reason: 'rebelBaseCaptured' },
      },
      { type: 'HANDOFF_ACCEPTED', actor: 'empire', payload: {} },
    ];
    for (const [i, e] of events.entries()) {
      const event = { seq: 10 + i, at: AT, ...e };
      expect(CoreEventSchema.safeParse(event).success, e.type).toBe(true);
    }
    expect(
      CoreEventSchema.safeParse({
        seq: 1,
        at: AT,
        type: 'TIME_ADVANCED',
        actor: 'rebels',
        payload: { from: 1, to: 2 },
      }).success,
    ).toBe(false);
  });
});

describe('coreInvariants (stored core-v1 state)', () => {
  it('references must exist (systems, unit types, rebel base)', () => {
    expect(messages(changed((s) => (s.units[0]!.systemId = 'zz')))).toContain('unknown system zz');
    expect(messages(changed((s) => (s.units[0]!.typeKey = 'unit.empire.nope')))).toContain(
      'unknown unit type unit.empire.nope',
    );
    expect(messages(changed((s) => (s.units[0]!.owner = 'rebels')))).toContain(
      'owner differs from its unit type',
    );
    expect(messages(changed((s) => (s.leaders[0]!.systemId = 'zz')))).toContain(
      'unknown system zz',
    );
    expect(messages(changed((s) => (s.rebelBase.systemId = 'zz')))).toContain(
      'unknown rebel base system',
    );
    expect(messages(changed((s) => s.units.push({ ...s.units[0]! })))).toContain(
      'duplicate unit id',
    );
  });

  it('activation: of the active side, its leader stands in the activated system', () => {
    const ok = changed((s) => {
      s.leaders[2]!.systemId = 'b';
      s.activation = { side: 'rebels', leaderId: 'leia', systemId: 'b' };
    });
    expect(messages(ok)).toEqual([]);
    expect(
      messages(
        changed((s) => (s.activation = { side: 'rebels', leaderId: 'leia', systemId: 'b' })),
      ),
    ).toContain('the activating leader must stand in the activated system');
    expect(
      messages(
        changed((s) => {
          s.leaders[0]!.systemId = 'b';
          s.activation = { side: 'empire', leaderId: 'vader', systemId: 'b' };
        }),
      ),
    ).toContain('activation of a non-active side');
  });

  it('passes (R-6): the active side has not passed; both passed is never stored', () => {
    expect(messages(changed((s) => (s.passed.empire = true)))).toEqual([]);
    expect(messages(changed((s) => (s.passed.rebels = true)))).toContain(
      'the active side has already passed',
    );
    expect(messages(changed((s) => (s.passed = { rebels: true, empire: true })))).toContain(
      'both sides passed: the command phase must have ended',
    );
  });

  it('phase: command while running; refresh only with an outcome; outcome ⇒ no activation/handoff', () => {
    expect(messages(changed((s) => (s.phase = 'refresh')))).toContain(
      'a running game is stored in the command phase',
    );
    const over = changed((s) => {
      s.phase = 'refresh';
      s.round = 14;
      s.outcome = { winner: 'rebels', reason: 'timeReachedReputation' };
    });
    expect(messages(over)).toEqual([]);
    expect(messages(changed((s) => (s.handoffPending = true), over))).toContain(
      'no handoff after the game is over',
    );
    expect(
      messages(
        changed((s) => {
          s.leaders[2]!.systemId = 'b';
          s.activation = { side: 'rebels', leaderId: 'leia', systemId: 'b' };
        }, over),
      ),
    ).toContain('no activation after the game is over');
  });

  it('AI game: no handoff; the player is active while the game runs (not after the outcome)', () => {
    const ai = coreState(EMPIRE_VS_AI);
    expect(messages(ai)).toEqual([]);
    expect(messages(changed((s) => (s.activeSide = 'rebels'), ai))).toContain(
      'AI game: the player is always active',
    );
    expect(messages(changed((s) => (s.handoffPending = true), ai))).toContain(
      'AI game: no handoff',
    );
    const lostOnAiTurn = changed((s) => {
      s.activeSide = 'rebels';
      s.outcome = { winner: 'empire', reason: 'rebelBaseCaptured' };
    }, ai);
    expect(messages(lostOnAiTurn)).toEqual([]);
  });
});

describe('core-v1 view, handoff view, commands, errors, details (frozen contract)', () => {
  it('CorePlayerView: strict; parsed by the session view union; hidden zone has no system', () => {
    const view = coreEmpireView();
    expect(CorePlayerViewSchema.parse(view)).toEqual(view);
    expect(PlayerViewSchema.parse(view)).toEqual(view);
    expect(PlayerViewSchema.safeParse({ ...view, consecutivePasses: 0 }).success).toBe(false);
    expect(PlayerViewSchema.safeParse({ ...view, rulesEngine: 'mock-v1' }).success).toBe(false);
    expect(
      CorePlayerViewSchema.safeParse({
        ...view,
        units: [{ ...view.units[2]!, location: { kind: 'rebelBase', systemId: 'd' } }],
      }).success,
    ).toBe(false);
    expect(
      CorePlayerViewSchema.safeParse({
        ...view,
        leaders: [{ ...view.leaders[0]!, location: 'pool' }],
      }).success,
    ).toBe(false);
  });

  it('core legal actions have the §3.5 shapes', () => {
    const view = coreEmpireView();
    const legalActions = [
      { type: 'ACTIVATE_SYSTEM', leaderIds: ['vader'], systemIds: ['a', 'b', 'c', 'd'] },
      {
        type: 'MOVE_PIECES',
        fromSystemId: 'a',
        toSystemId: 'b',
        pieces: [
          { pieceId: 'u-01', transportCapacity: 0, requiresTransport: true },
          { pieceId: 'u-02', transportCapacity: 6, requiresTransport: false },
        ],
      },
      { type: 'FINISH_ACTIVATION' },
      { type: 'PASS' },
    ];
    expect(CorePlayerViewSchema.safeParse({ ...view, legalActions }).success).toBe(true);
    for (const bad of [
      { type: 'ADVANCE_PHASE' },
      { type: 'MOVE_PIECES', pieceId: 'u-01', toSystemIds: ['b'] },
      { type: 'PASS', auto: true },
    ]) {
      expect(CorePlayerViewSchema.safeParse({ ...view, legalActions: [bad] }).success).toBe(false);
    }
  });

  it('handoff view: the SWR-004 fields + rulesEngine, strict', () => {
    const handoff = {
      kind: 'handoff',
      rulesEngine: 'core-v1',
      id: 'core-1',
      version: 3,
      activeSide: 'empire',
      round: 1,
      phase: 'command',
      sessionStatus: 'prototype',
    };
    expect(HandoffViewSchema.parse(handoff)).toEqual(handoff);
    expect(PlayerViewSchema.parse(handoff)).toEqual(handoff);
    const { rulesEngine: _r, ...withoutEngine } = handoff;
    expect(HandoffViewSchema.safeParse(withoutEngine).success).toBe(false);
    expect(
      HandoffViewSchema.safeParse({ ...handoff, passed: { rebels: false, empire: false } }).success,
    ).toBe(false);
  });

  it('commands of both engines pass the envelope schema (→ 422, not 400, AM-BE-3); strict', () => {
    for (const command of [
      { type: 'ACTIVATE_SYSTEM', leaderId: 'vader', systemId: 'b' },
      { type: 'FINISH_ACTIVATION' },
      { type: 'PASS' },
      { type: 'MOVE_PIECES', pieceIds: ['u-01'], fromSystemId: 'a', toSystemId: 'b' },
      { type: 'ADVANCE_PHASE' },
      { type: 'END_TURN' },
      { type: 'ACCEPT_HANDOFF' },
    ]) {
      expect(
        CommandEnvelopeSchema.safeParse({ actor: 'empire', expectedVersion: 1, command }).success,
        command.type,
      ).toBe(true);
    }
    for (const command of [
      { type: 'ACTIVATE_SYSTEM', leaderId: '', systemId: 'b' },
      { type: 'ACTIVATE_SYSTEM', leaderId: 'vader' },
      { type: 'PASS', auto: true },
      { type: 'FINISH_ACTIVATION', systemId: 'b' },
    ]) {
      expect(
        CommandEnvelopeSchema.safeParse({ actor: 'empire', expectedVersion: 1, command }).success,
      ).toBe(false);
    }
  });

  it('error keys: the specification list is present, no systemHasOwnLeader (Q-BE-3)', () => {
    for (const key of [
      'notYourTurn',
      'wrongPhase',
      'leaderNotInPool',
      'leaderCannotActivate',
      'activationInProgress',
      'noActivation',
      'notActivatedSystem',
      'notAdjacent',
      'pinnedByLeader',
      'immobileUnit',
      'insufficientCapacity',
      'gameOver',
      'commandUnavailable',
      'unknownLeader',
      'unknownSystem',
      'sameSystem',
      'notYourSide',
      'handoffPending',
    ] as const) {
      expect(REBELLION_ERROR_MESSAGE_KEYS[key]).toBe(`errors.${key}`);
    }
    expect(Object.keys(REBELLION_ERROR_MESSAGE_KEYS)).not.toContain('systemHasOwnLeader');
  });

  it('details: + rulesEngine, winner (null until over), reputation (null for mock-v1)', () => {
    const base = {
      playerFaction: 'empire',
      opponentFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'normal',
      ruleset: 'base',
      gameMode: 'digital',
      round: 3,
      phase: 'command',
    };
    expect(
      RebellionSessionDetailsSchema.safeParse({
        ...base,
        rulesEngine: 'core-v1',
        winner: 'empire',
        reputation: 14,
      }).success,
    ).toBe(true);
    expect(
      RebellionSessionDetailsSchema.safeParse({
        ...base,
        rulesEngine: 'mock-v1',
        winner: null,
        reputation: null,
      }).success,
    ).toBe(true);
    expect(
      RebellionSessionDetailsSchema.safeParse({ ...base, rulesEngine: 'core-v1' }).success,
    ).toBe(false);
    expect(
      RebellionSessionDetailsSchema.safeParse({
        ...base,
        rulesEngine: 'core-v1',
        winner: null,
        reputation: 14,
        rebelBase: 'd',
      }).success,
    ).toBe(false);
  });

  it('command response events accept redacted core events (null systems)', () => {
    const ok = { ok: true, view: coreEmpireView(), events: [MOVE_IN_BASE] };
    expect(CommandOkSchema.safeParse(ok).success).toBe(true);
  });
});
