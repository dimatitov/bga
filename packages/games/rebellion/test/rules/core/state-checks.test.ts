/**
 * SWR-008 W2 — DISC-009: the central state check of `core-v1` (`runStateChecks`, plan-backend §7; specification
 * R-3, AC-8, AC-9, QD-1, QD-2). Transition matrix TC-D-01..TC-D-30 on the mini data (base = `zeta`), the static
 * centralisation check TC-D-31, the metamorphic Empire view TC-D-34 and the save/restore unit cases TC-RS-04 /
 * TC-RS-01 (engine half). Rows marked [art] use artificial states (an Imperial ground unit already in the hidden
 * base outside an Imperial activation) — the contract of the central check, not a path of a real core-v1 game.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  REBELLION_STATE_SCHEMA_VERSION,
  eligibleRebelBaseSystemIds,
  unitTypeRevealsRebelBase,
  type Command,
  type CoreGameState,
  type Faction,
  type GameEvent,
} from '../../../src/schema';
import { chooseRebelBase, createCoreGame, getLegalActions, toSideView } from '../../../src/rules';
import {
  baseRevealConditionMet,
  revealTimingAllows,
  runStateChecks,
} from '../../../src/rules/core';
import { checkCreatedState } from '../../../src/rules/core/create';
import { coreDataBaseV1 } from '../../../src/scenario';
import { rebellionServerModule } from '../../../src/server';
import { relocateBase } from '../../ai/fixtures/relocate-base';
import { SYSTEM_IDS, T, type TypeKey } from './fixtures/mini-data';
import {
  ACCEPT,
  FINISH,
  HOT_SEAT,
  PASS,
  REBELS_VS_AI,
  activate,
  clone,
  deepFreeze,
  errorKey,
  eventTypes,
  mulberry32,
  mv,
  ok,
  rejected,
  scenario,
  tryApply,
  type ApplyOptions,
} from './helpers';

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

type Step = { state: CoreGameState; events: GameEvent[] };

/** Apply and check TC-D-24 on every command: `version + 1` once, consecutive `seq`, log = old log + events. */
function step(
  state: CoreGameState,
  actor: Faction,
  command: Command,
  opts: ApplyOptions = {},
): Step {
  const result = ok(state, actor, command, opts);
  expect(result.state.version).toBe(state.version + 1);
  expect(result.events.map((e) => e.seq)).toEqual(
    result.events.map((_, i) => state.log.length + i + 1),
  );
  expect(result.state.log).toEqual([...state.log, ...result.events]);
  return result;
}

function run(state: CoreGameState, steps: [Faction, Command][]): Step[] {
  const out: Step[] = [];
  let current = state;
  for (const [actor, command] of steps) {
    const next = step(current, actor, command);
    out.push(next);
    current = next.state;
  }
  return out;
}

const last = (steps: Step[]): Step => {
  const s = steps[steps.length - 1];
  if (!s) throw new Error('no steps');
  return s;
};

const revealsIn = (events: readonly GameEvent[]) =>
  events.filter((e) => e.type === 'BASE_REVEALED').length;

function isImperialGround(state: CoreGameState, typeKey: string, owner: string): boolean {
  const type = state.unitTypes.find((t) => t.typeKey === typeKey);
  return owner === 'empire' && type !== undefined && unitTypeRevealsRebelBase(type);
}

/**
 * "No reveal" row check: `revealed = false`, no `BASE_REVEALED` in the command's events, the Empire's view
 * hides the base and is deep-equal to the view of the same state with the base in another system (Rebels moved
 * along; only targets the Empire could not rule out — no Rebel traces, no Imperial ground unit there).
 */
function expectHidden(state: CoreGameState, events: readonly GameEvent[] = []): void {
  expect(state.rebelBase.revealed).toBe(false);
  expect(eventTypes(events)).not.toContain('BASE_REVEALED');
  const view = toSideView(state, 'empire');
  expect(view.rebelBase).toEqual({ systemId: null, revealed: false });
  let compared = 0;
  for (const to of SYSTEM_IDS) {
    if (state.units.some((u) => u.systemId === to && isImperialGround(state, u.typeKey, u.owner)))
      continue;
    const moved = relocateBase(state, to);
    if (!moved) continue;
    expect(toSideView(moved, 'empire'), `base relocated to ${to}`).toEqual(view);
    compared += 1;
  }
  expect(compared).toBeGreaterThan(0);
}

function expectRevealedOnce(state: CoreGameState): void {
  expect(state.rebelBase.revealed).toBe(true);
  expect(revealsIn(state.log)).toBe(1);
  expect(toSideView(state, 'empire').rebelBase).toEqual({ systemId: 'zeta', revealed: true });
}

/** u-01 AC, u-02 ST in delta (ground with transport); u-03 SD, u-04 TIE in epsilon; u-05 DS in eta; Rebels in zeta. */
const UNITS: [TypeKey, string][] = [
  [T.AC, 'delta'], // u-01
  [T.ST, 'delta'], // u-02
  [T.SD, 'epsilon'], // u-03
  [T.TIE, 'epsilon'], // u-04
  [T.DS, 'eta'], // u-05
  [T.RT, 'zeta'], // u-06 Rebels on the base
  [T.XW, 'zeta'], // u-07
];
/** The same Imperial units, no Rebel unit in the base. */
const NO_REBELS_IN_BASE: [TypeKey, string][] = [...UNITS.slice(0, 5), [T.XW, 'theta']];

function empireTurn(units: [TypeKey, string][] = UNITS, extra = {}): CoreGameState {
  return scenario({ base: 'zeta', units, activeSide: 'empire', ...extra });
}

/** TC-D-03 state: the Empire activated `zeta` and moved ground units (AC + ST) into it. */
function groundMovedIn(units: [TypeKey, string][] = UNITS): {
  state: CoreGameState;
  steps: Step[];
} {
  const steps = run(empireTurn(units), [
    ['empire', activate('vader', 'zeta')],
    ['empire', mv(['u-01', 'u-02'], 'delta', 'zeta')],
  ]);
  return { state: last(steps).state, steps };
}

// ---------------------------------------------------------------------------------------------------------
// 8.1 Transition matrix
// ---------------------------------------------------------------------------------------------------------

describe('DISC-009 transition matrix — ACTIVATE_SYSTEM / MOVE_PIECES / FINISH_ACTIVATION (AC-8)', () => {
  it('TC-D-01: an Imperial activation of the base without units in it does not reveal', () => {
    const { state, events } = step(empireTurn(), 'empire', activate('vader', 'zeta'));
    expect(eventTypes(events)).toEqual(['SYSTEM_ACTIVATED']);
    expectHidden(state, events);
  });

  it('TC-D-02: an Imperial activation of another system does not reveal', () => {
    const { state, events } = step(empireTurn(), 'empire', activate('vader', 'beta'));
    expectHidden(state, events);
  });

  it('TC-D-03: ground units moved into the base do not reveal it in the middle of the activation', () => {
    for (const units of [UNITS, NO_REBELS_IN_BASE]) {
      const { state, steps } = groundMovedIn(units);
      const moveEvents = last(steps).events;
      expect(eventTypes(moveEvents)).toEqual(['PIECES_MOVED']);
      // no premature reveal and no victory, even with no Rebel unit in the base
      expect(state.outcome).toBeNull();
      expect(state.activation).toEqual({ side: 'empire', leaderId: 'vader', systemId: 'zeta' });
      expect(toSideView(state, 'empire').rebelBase).toEqual({ systemId: null, revealed: false });
      expectHidden(state, moveEvents);
    }
  });

  it('TC-D-04: a ship alone (Star Destroyer) in the base does not reveal — neither after MOVE nor after FINISH', () => {
    const steps = run(empireTurn(), [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-03'], 'epsilon', 'zeta')],
      ['empire', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });

  it('TC-D-05: TIE fighters (carried, not ground) do not reveal', () => {
    const steps = run(empireTurn(), [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-03', 'u-04'], 'epsilon', 'zeta')],
      ['empire', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });

  it('TC-D-06: the Death Star does not reveal', () => {
    const steps = run(empireTurn(), [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-05'], 'eta', 'zeta')],
      ['empire', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });

  it('TC-D-07: a leader alone does not reveal', () => {
    const steps = run(empireTurn(), [
      ['empire', activate('vader', 'zeta')],
      ['empire', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });

  it('TC-D-08: ground units in ANOTHER system do not reveal', () => {
    const steps = run(empireTurn(), [
      ['empire', activate('vader', 'beta')],
      ['empire', mv(['u-01', 'u-02'], 'delta', 'beta')],
      ['empire', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });

  it('TC-D-09: FINISH with Rebel units in the base → exactly [ACTIVATION_FINISHED, BASE_REVEALED], turn handed over', () => {
    const { state, events } = step(groundMovedIn().state, 'empire', FINISH);
    expect(events.map((e) => [e.type, e.actor, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', 'empire', { auto: false }],
      ['BASE_REVEALED', 'system', { systemId: 'zeta' }],
    ]);
    expect(state).toMatchObject({
      rebelBase: { systemId: 'zeta', revealed: true },
      outcome: null,
      activation: null,
      activeSide: 'rebels',
      handoffPending: true,
    });
    expectRevealedOnce(state);
  });

  it('TC-D-10: FINISH with no Rebel unit in the base → ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER, activeSide unchanged', () => {
    const { state, events } = step(groundMovedIn(NO_REBELS_IN_BASE).state, 'empire', FINISH);
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', { auto: false }],
      ['BASE_REVEALED', { systemId: 'zeta' }],
      ['GAME_OVER', { winner: 'empire', reason: 'rebelBaseCaptured' }],
    ]);
    expect(state).toMatchObject({
      outcome: { winner: 'empire', reason: 'rebelBaseCaptured' },
      activation: null,
      handoffPending: false,
      activeSide: 'empire',
    });
  });

  it('TC-D-11: several moves into the base → exactly one BASE_REVEALED, only in the FINISH events', () => {
    const units: [TypeKey, string][] = [
      [T.AC, 'delta'], // u-01
      [T.ST, 'delta'], // u-02
      [T.SD, 'epsilon'], // u-03
      [T.AC, 'eta'], // u-04
      [T.ATAT, 'eta'], // u-05
      [T.RT, 'zeta'], // u-06
    ];
    const steps = run(empireTurn(units), [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-01', 'u-02'], 'delta', 'zeta')],
      ['empire', mv(['u-03'], 'epsilon', 'zeta')],
      ['empire', mv(['u-04', 'u-05'], 'eta', 'zeta')],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
    const finished = step(last(steps).state, 'empire', FINISH);
    expect(eventTypes(finished.events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED']);
    expectRevealedOnce(finished.state);
  });

  it("TC-D-12: AI Empire, origin 'auto' → [ACTIVATION_FINISHED{auto:true}, BASE_REVEALED{actor:'system'}], no handoff", () => {
    const start = scenario({
      base: 'zeta',
      units: UNITS,
      settings: REBELS_VS_AI,
      activeSide: 'empire',
      activation: { leaderId: 'vader', systemId: 'zeta' },
    });
    const moved = step(start, 'empire', mv(['u-01', 'u-02'], 'delta', 'zeta'), {
      origin: 'auto',
    });
    expectHidden(moved.state, moved.events);
    const { state, events } = step(moved.state, 'empire', FINISH, { origin: 'auto' });
    expect(events.map((e) => [e.type, e.actor, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', 'empire', { auto: true }],
      ['BASE_REVEALED', 'system', { systemId: 'zeta' }],
    ]);
    expect(state).toMatchObject({ activeSide: 'rebels', handoffPending: false, outcome: null });
  });

  it('TC-D-13: the Rebels activating / moving into / finishing their own base never reveal it', () => {
    const units: [TypeKey, string][] = [
      [T.TR, 'eta'], // u-01
      [T.RT, 'eta'], // u-02
      [T.XW, 'zeta'], // u-03
      [T.ST, 'alpha'], // u-04
    ];
    const steps = run(scenario({ base: 'zeta', units }), [
      ['rebels', activate('leia', 'zeta')],
      ['rebels', mv(['u-01', 'u-02'], 'eta', 'zeta')],
      ['rebels', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });

  it('TC-D-14: the Rebels activating / moving / finishing elsewhere never reveal', () => {
    const units: [TypeKey, string][] = [
      [T.TR, 'theta'], // u-01
      [T.RT, 'theta'], // u-02
      [T.XW, 'zeta'], // u-03
    ];
    const steps = run(scenario({ base: 'zeta', units }), [
      ['rebels', activate('leia', 'eta')],
      ['rebels', mv(['u-01', 'u-02'], 'theta', 'eta')],
      ['rebels', FINISH],
    ]);
    for (const s of steps) expectHidden(s.state, s.events);
  });
});

describe('DISC-009 transition matrix — PASS / end of round / ACCEPT_HANDOFF / game over (AC-8)', () => {
  it('TC-D-15: a single PASS of either side does not reveal', () => {
    const rebels = step(scenario({ base: 'zeta', units: UNITS }), 'rebels', PASS);
    expect(eventTypes(rebels.events)).toEqual(['PASSED']);
    expectHidden(rebels.state, rebels.events);
    const empire = step(empireTurn(), 'empire', PASS);
    expect(eventTypes(empire.events)).toEqual(['PASSED']);
    expectHidden(empire.state, empire.events);
  });

  it('TC-D-16: the second PASS ends the round — round-end events in the old order, no BASE_REVEALED', () => {
    const { state, events } = step(empireTurn(UNITS, { passed: { rebels: true } }), 'empire', PASS);
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      ['PASSED', { auto: false }],
      ['PHASE_STARTED', { round: 1, phase: 'refresh' }],
      ['LEADERS_RETURNED', { leaderIds: [] }],
      ['TIME_ADVANCED', { from: 1, to: 2 }],
      ['PHASE_STARTED', { round: 2, phase: 'assignment' }],
      ['PHASE_STARTED', { round: 2, phase: 'command' }],
    ]);
    expectHidden(state, events);
  });

  it('TC-D-17: the Rebel victory by time adds no BASE_REVEALED (also [art] with Imperial ground in the base)', () => {
    for (const units of [UNITS, [...UNITS, [T.ST, 'zeta']] as [TypeKey, string][]]) {
      const start = empireTurn(units, { passed: { rebels: true }, round: 13, reputation: 14 });
      const { state, events } = step(start, 'empire', PASS);
      expect(eventTypes(events)).toEqual([
        'PASSED',
        'PHASE_STARTED',
        'LEADERS_RETURNED',
        'TIME_ADVANCED',
        'GAME_OVER',
      ]);
      expect(state.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
      expect(state.rebelBase.revealed).toBe(false);
      expect(revealsIn(state.log)).toBe(0);
    }
  });

  it('TC-D-18: ACCEPT_HANDOFF after the reveal → [HANDOFF_ACCEPTED], no second BASE_REVEALED', () => {
    const revealed = step(groundMovedIn().state, 'empire', FINISH).state;
    const { state, events } = step(revealed, 'rebels', ACCEPT);
    expect(eventTypes(events)).toEqual(['HANDOFF_ACCEPTED']);
    expectRevealedOnce(state);
  });

  it('TC-D-19: ACCEPT_HANDOFF by the Empire before the reveal does not reveal', () => {
    const { state, events } = step(empireTurn(UNITS, { handoffPending: true }), 'empire', ACCEPT);
    expect(eventTypes(events)).toEqual(['HANDOFF_ACCEPTED']);
    expectHidden(state, events);
  });

  it('TC-D-20: after the reveal no later command reveals again (exactly one BASE_REVEALED in the log)', () => {
    const units: [TypeKey, string][] = [...UNITS, [T.AC, 'delta'], [T.ST, 'delta']]; // u-08, u-09
    const revealed = step(groundMovedIn(units).state, 'empire', FINISH).state;
    const steps = run(revealed, [
      ['rebels', ACCEPT],
      ['rebels', activate('leia', 'zeta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', activate('tarkin', 'zeta')],
      ['empire', mv(['u-08', 'u-09'], 'delta', 'zeta')],
      ['empire', FINISH],
      ['rebels', ACCEPT],
      ['rebels', PASS],
      ['empire', ACCEPT],
      ['empire', PASS],
    ]);
    for (const s of steps) {
      expect(eventTypes(s.events)).not.toContain('BASE_REVEALED');
      expectRevealedOnce(s.state);
      expect(s.state.outcome).toBeNull();
    }
    expect(last(steps).state.round).toBe(2);
  });

  it('TC-D-21: after the game is over every command is 422 gameOver — state and log unchanged, no BASE_REVEALED', () => {
    const empireWon = step(groundMovedIn(NO_REBELS_IN_BASE).state, 'empire', FINISH).state;
    const rebelsWon = step(
      empireTurn(UNITS, { passed: { rebels: true }, round: 13, reputation: 14 }),
      'empire',
      PASS,
    ).state;
    for (const over of [empireWon, rebelsWon]) {
      for (const actor of ['rebels', 'empire'] as const) {
        for (const command of [
          PASS,
          FINISH,
          ACCEPT,
          activate('leia', 'zeta'),
          activate('tarkin', 'zeta'),
        ]) {
          rejected(over, actor, command, K.gameOver);
        }
      }
    }
  });

  it('TC-D-22: after the reveal a Rebel MOVE out of the base → [PIECES_MOVED, GAME_OVER{empire}], no BASE_REVEALED', () => {
    const start = scenario({
      base: 'zeta',
      revealed: true,
      units: [
        [T.SD, 'zeta'], // u-01
        [T.ST, 'zeta'], // u-02
        [T.XW, 'zeta'], // u-03 the last Rebel unit
      ],
      activation: { leaderId: 'leia', systemId: 'epsilon' },
    });
    const { state, events } = step(start, 'rebels', mv(['u-03'], 'zeta', 'epsilon'));
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      ['PIECES_MOVED', { pieceIds: ['u-03'], fromSystemId: 'zeta', toSystemId: 'epsilon' }],
      ['GAME_OVER', { winner: 'empire', reason: 'rebelBaseCaptured' }],
    ]);
    expect(state.activeSide).toBe('rebels');
  });

  it('TC-D-23: only a Rebel structure left in the base → the reveal happens, the victory does not', () => {
    const units: [TypeKey, string][] = [
      [T.AC, 'delta'], // u-01
      [T.ST, 'delta'], // u-02
      [T.SG, 'zeta'], // u-03 immobile shield generator
    ];
    const { state, events } = step(groundMovedIn(units).state, 'empire', FINISH);
    expect(eventTypes(events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED']);
    expect(state.outcome).toBeNull();
    expectRevealedOnce(state);
  });

  it('TC-D-24: every accepted command of the matrix is version + 1 exactly once with a continuous seq', () => {
    // `step` asserts it on every command above; here a full scripted game with a reveal and a victory.
    const units: [TypeKey, string][] = [
      [T.AC, 'delta'], // u-01
      [T.ST, 'delta'], // u-02
      [T.XW, 'zeta'], // u-03
    ];
    const steps = run(scenario({ base: 'zeta', units }), [
      ['rebels', PASS],
      ['empire', ACCEPT],
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-01', 'u-02'], 'delta', 'zeta')],
      ['empire', FINISH], // reveal (Rebel X-wing still there), consecutive turn (Rebels passed)
      ['empire', PASS], // end of round 1 → Rebels first, hot-seat handoff
      ['rebels', ACCEPT],
      ['rebels', activate('leia', 'epsilon')],
      ['rebels', mv(['u-03'], 'zeta', 'epsilon')], // the last Rebel unit leaves → Empire wins
    ]);
    const final = last(steps).state;
    expect(final.version).toBe(1 + steps.length);
    expect(final.log.map((e) => e.seq)).toEqual(final.log.map((_, i) => i + 1));
    expect(revealsIn(final.log)).toBe(1);
    expect(final.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
  });
});

describe('DISC-009 — creation (TC-D-25, QD-2)', () => {
  const NOW = '2026-11-20T10:00:00.000Z';
  const eligible = eligibleRebelBaseSystemIds(coreDataBaseV1);

  function idWithBase(base: string): string {
    for (let i = 0; i < 100_000; i += 1) {
      const id = `swr008-create-${i}`;
      if (chooseRebelBase(id, eligible) === base) return id;
    }
    throw new Error(`no game id for base ${base}`);
  }

  it('TC-D-25: every eligible base (real data) and 20 random ids — hidden base, creation log unchanged, the check is a no-op', () => {
    expect(eligible).toHaveLength(9);
    const rng = mulberry32(20_261_120);
    const ids = [
      ...eligible.map(idWithBase),
      ...Array.from({ length: 20 }, () => `swr008-rnd-${Math.floor(rng() * 1e9)}`),
    ];
    const bases = new Set<string>();
    for (const gameId of ids) {
      for (const settings of [HOT_SEAT, REBELS_VS_AI]) {
        const state = createCoreGame(settings, coreDataBaseV1, { gameId, now: NOW });
        bases.add(state.rebelBase.systemId);
        expect(state.rebelBase.revealed).toBe(false);
        expect(state.outcome).toBeNull();
        expect(state.log.map((e) => [e.seq, e.type, e.payload])).toEqual([
          [1, 'GAME_CREATED', { scenarioId: coreDataBaseV1.id }],
          [2, 'PHASE_STARTED', { round: state.round, phase: 'assignment' }],
          [3, 'PHASE_STARTED', { round: state.round, phase: 'command' }],
        ]);
        // the central check ran on this state (createCoreGame) and running it again changes nothing
        const transition = { state, drafts: [] };
        expect(runStateChecks(transition)).toBe(transition);
        expect(baseRevealConditionMet(state)).toBe(false);
      }
    }
    expect([...bases].sort()).toEqual([...eligible].sort());
  });

  it('review F-6 [art]: creation-time events are numbered from the LAST seq, not the log length', () => {
    const base = scenario({ base: 'zeta', units: [...UNITS, [T.ST, 'zeta']] });
    // a log whose seq is not 1..n (two entries, last seq 7): length-based numbering would give 3, 4
    const log = [
      { ...base.log[0], seq: 5 },
      { ...base.log[base.log.length - 1], seq: 7 },
    ] as CoreGameState['log'];
    const state = deepFreeze({ ...base, log });
    const checked = checkCreatedState(state, NOW);
    expect(checked.log.slice(0, 2)).toEqual(log);
    expect(checked.log.slice(2).map((e) => [e.seq, e.type, e.at])).toEqual([
      [8, 'BASE_REVEALED', NOW],
    ]);
    expect(checked.version).toBe(state.version);
    expectRevealedOnce(checked);

    // with Rebels gone from the base the Empire victory follows in the same numbering
    const empty = deepFreeze({
      ...scenario({ base: 'zeta', units: [...NO_REBELS_IN_BASE, [T.ST, 'zeta']] }),
      log,
    });
    expect(
      checkCreatedState(empty, NOW)
        .log.slice(2)
        .map((e) => [e.seq, e.type]),
    ).toEqual([
      [8, 'BASE_REVEALED'],
      [9, 'GAME_OVER'],
    ]);

    // nothing to report → the state unchanged (no new events)
    const quiet = deepFreeze({ ...scenario({ base: 'zeta', units: UNITS }), log });
    expect(checkCreatedState(quiet, NOW).log).toEqual(log);
  });
});

describe('DISC-009 — [art] the reveal outside an Imperial activation (TC-D-26..TC-D-28, QD-1)', () => {
  /** An Imperial stormtrooper already stands in the hidden base (u-08), Rebels there too (u-06, u-07). */
  const ART: [TypeKey, string][] = [...UNITS, [T.ST, 'zeta']];
  const ART_EMPTY: [TypeKey, string][] = [
    [T.ST, 'zeta'],
    [T.XW, 'theta'],
  ];

  it('TC-D-26 [art]: any accepted Rebel command reveals at once — ACTIVATE / PASS / MOVE', () => {
    const activated = step(
      scenario({ base: 'zeta', units: ART }),
      'rebels',
      activate('leia', 'beta'),
    );
    expect(eventTypes(activated.events)).toEqual(['SYSTEM_ACTIVATED', 'BASE_REVEALED']);
    expect(activated.state.outcome).toBeNull();
    expectRevealedOnce(activated.state);

    const passed = step(scenario({ base: 'zeta', units: ART }), 'rebels', PASS);
    expect(eventTypes(passed.events)).toEqual(['PASSED', 'BASE_REVEALED']);
    expect(passed.state).toMatchObject({
      activeSide: 'empire',
      handoffPending: true,
      outcome: null,
    });

    const moving = scenario({
      base: 'zeta',
      units: [...ART, [T.XW, 'eta']], // u-09
      activation: { leaderId: 'leia', systemId: 'zeta' }, // set directly: no check has run yet
    });
    const moved = step(moving, 'rebels', mv(['u-09'], 'eta', 'zeta'));
    expect(eventTypes(moved.events)).toEqual(['PIECES_MOVED', 'BASE_REVEALED']);
  });

  it('TC-D-26 [art]: … then the Empire victory is checked in the same command (no Rebel unit in the base)', () => {
    const { state, events } = step(scenario({ base: 'zeta', units: ART_EMPTY }), 'rebels', PASS);
    expect(eventTypes(events)).toEqual(['PASSED', 'BASE_REVEALED', 'GAME_OVER']);
    expect(state).toMatchObject({
      outcome: { winner: 'empire', reason: 'rebelBaseCaptured' },
      handoffPending: false,
      activation: null,
    });
  });

  it('TC-D-27 [art]: during an Imperial activation the reveal waits — then FINISH of a NON-base system reveals', () => {
    const activated = step(empireTurn(ART), 'empire', activate('tarkin', 'beta'));
    expect(eventTypes(activated.events)).toEqual(['SYSTEM_ACTIVATED']);
    expect(activated.state.rebelBase.revealed).toBe(false);
    expect(toSideView(activated.state, 'empire').rebelBase).toEqual({
      systemId: null,
      revealed: false,
    });
    const moved = step(activated.state, 'empire', mv(['u-01', 'u-02'], 'delta', 'beta'));
    expect(eventTypes(moved.events)).toEqual(['PIECES_MOVED']);
    expect(moved.state.rebelBase.revealed).toBe(false);
    const finished = step(moved.state, 'empire', FINISH);
    expect(finished.events.map((e) => [e.type, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', { auto: false }],
      ['BASE_REVEALED', { systemId: 'zeta' }],
    ]);
    expect(finished.state).toMatchObject({ activeSide: 'rebels', handoffPending: true });
    expectRevealedOnce(finished.state);
  });

  it('TC-D-28 [art]: activating the base with ground already in it → one reveal on FINISH', () => {
    const steps = run(empireTurn(ART), [
      ['empire', activate('tarkin', 'zeta')],
      ['empire', FINISH],
    ]);
    expect(eventTypes(steps[0]?.events ?? [])).toEqual(['SYSTEM_ACTIVATED']);
    expect(eventTypes(last(steps).events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED']);
    expectRevealedOnce(last(steps).state);
  });
});

describe('runStateChecks — direct unit tests (TC-D-29, TC-D-30, TR-4)', () => {
  const art = (extra = {}) =>
    deepFreeze(scenario({ base: 'zeta', units: [...UNITS, [T.ST, 'zeta']], ...extra }));
  const draft = { type: 'PASSED', actor: 'rebels', payload: { auto: false } } as const;

  it('(a) condition false → the same transition object', () => {
    const t = { state: deepFreeze(scenario({ base: 'zeta', units: UNITS })), drafts: [draft] };
    expect(runStateChecks(t)).toBe(t);
  });

  it('(b) already revealed → the same object (no second BASE_REVEALED)', () => {
    const t = { state: art({ revealed: true }), drafts: [] };
    expect(runStateChecks(t)).toBe(t);
  });

  it('(c) game over → the same object, even when the condition holds', () => {
    const over = deepFreeze({
      ...scenario({ base: 'zeta', units: [[T.ST, 'zeta']] }),
      outcome: { winner: 'rebels', reason: 'timeReachedReputation' },
    } as CoreGameState);
    expect(baseRevealConditionMet(over)).toBe(true);
    const t = { state: over, drafts: [] };
    expect(runStateChecks(t)).toBe(t);
  });

  it('(d) an Imperial activation is running → deferred (same object); a Rebel activation does not defer', () => {
    const empire = art({
      activeSide: 'empire',
      activation: { leaderId: 'vader', systemId: 'beta' },
    });
    expect(revealTimingAllows(empire)).toBe(false);
    const t = { state: empire, drafts: [] };
    expect(runStateChecks(t)).toBe(t);
    const rebels = art({ activation: { leaderId: 'leia', systemId: 'beta' } });
    expect(revealTimingAllows(rebels)).toBe(true);
    expect(runStateChecks({ state: rebels, drafts: [] }).state.rebelBase.revealed).toBe(true);
  });

  it('(e) condition true outside an Imperial activation → revealed + BASE_REVEALED after the given drafts, then the victory check; idempotent', () => {
    const state = art();
    const snapshot = clone(state);
    const t = { state, drafts: [draft] };
    const once = runStateChecks(t);
    expect(state).toEqual(snapshot); // input never mutated (deep-frozen as well)
    expect(once.state.rebelBase).toEqual({ systemId: 'zeta', revealed: true });
    expect(once.drafts).toEqual([
      draft,
      { type: 'BASE_REVEALED', actor: 'system', payload: { systemId: 'zeta' } },
    ]);
    expect(once.state.outcome).toBeNull(); // Rebels still in the base
    expect(runStateChecks(once)).toBe(once);

    const empty = deepFreeze(
      scenario({
        base: 'zeta',
        units: [
          [T.ST, 'zeta'],
          [T.XW, 'theta'],
        ],
      }),
    );
    const won = runStateChecks({ state: empty, drafts: [] });
    expect(won.drafts.map((d) => d.type)).toEqual(['BASE_REVEALED', 'GAME_OVER']);
    expect(won.state.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
    expect(runStateChecks(won)).toBe(won);
  });

  it('the condition: only Imperial GROUND units in the base system (not ships, TIE, Death Star, leaders, Rebels, other systems)', () => {
    const at = (units: [TypeKey, string][], leadersAt = {}) =>
      baseRevealConditionMet(scenario({ base: 'zeta', units, leadersAt }));
    expect(at([[T.ST, 'zeta']])).toBe(true);
    expect(at([[T.ATAT, 'zeta']])).toBe(true);
    expect(
      at([
        [T.SD, 'zeta'],
        [T.TIE, 'zeta'],
        [T.DS, 'zeta'],
        [T.AC, 'zeta'],
      ]),
    ).toBe(false);
    expect(
      at([
        [T.RT, 'zeta'],
        [T.AS, 'zeta'],
        [T.SG, 'zeta'],
      ]),
    ).toBe(false);
    expect(
      at([
        [T.ST, 'eta'],
        [T.ATAT, 'delta'],
      ]),
    ).toBe(false);
    expect(at([], { vader: 'zeta', tarkin: 'zeta' })).toBe(false);
  });

  it('TC-D-30 [art] loyalty: no Imperial unit in the base → no reveal; loyalty is documented as not applicable in core-v1 (DISC-005)', () => {
    const t = { state: deepFreeze(scenario({ base: 'zeta', units: UNITS })), drafts: [] };
    expect(baseRevealConditionMet(t.state)).toBe(false);
    expect(runStateChecks(t)).toBe(t);
    const source = readFileSync(join(CORE_DIR, 'state-checks.ts'), 'utf8');
    expect(source).toMatch(/loyalty/i);
    expect(source).toContain('DISC-005');
    expect(source).toMatch(/extension point/i);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 8.2 Centralisation (static), hidden information
// ---------------------------------------------------------------------------------------------------------

const CORE_DIR = join(__dirname, '../../../src/rules/core');

/** `name(` call sites (definitions `function name(` excluded) per file of src/rules/core. */
/** Source of a src/rules/core file without comments. */
function codeOf(file: string): string {
  return readFileSync(join(CORE_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function callSites(name: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts'))) {
    const source = codeOf(file);
    const calls = source.match(new RegExp(`(?<!function )\\b${name}\\(`, 'g'))?.length ?? 0;
    if (calls > 0) out[file] = calls;
  }
  return out;
}

describe('DISC-009 — one central check point (TC-D-31)', () => {
  it('revealBase is called only from runStateChecks; runStateChecks only from applyCoreCommand and createCoreGame', () => {
    expect(callSites('revealBase')).toEqual({ 'state-checks.ts': 1 });
    expect(callSites('runStateChecks')).toEqual({ 'apply.ts': 1, 'create.ts': 1 });
    expect(callSites('checkEmpireVictory')).toEqual({ 'state-checks.ts': 1 });
    expect(callSites('baseRevealConditionMet')).toEqual({ 'state-checks.ts': 1 });
    for (const file of ['turn-flow.ts', 'movement.ts', 'activation.ts']) {
      const source = codeOf(file);
      for (const symbol of [
        'revealBase',
        'checkEmpireVictory',
        'runStateChecks',
        'unitTypeRevealsRebelBase',
      ]) {
        expect(source, `${file} mentions ${symbol}`).not.toMatch(new RegExp(`\\b${symbol}\\b`));
      }
    }
  });
});

describe('DISC-009 — the Empire cannot tell the base before the legal reveal (TC-D-34)', () => {
  /** Empire in the middle of an activation of the base `zeta` with its ground units in it. */
  function midActivation(): CoreGameState {
    const units: [TypeKey, string][] = [
      [T.AC, 'delta'], // u-01
      [T.ST, 'delta'], // u-02
      [T.SD, 'delta'], // u-03
      [T.ST, 'delta'], // u-04
      [T.RT, 'zeta'], // u-05 Rebels on their base
      [T.XW, 'zeta'], // u-06
      [T.XW, 'theta'], // u-07
    ];
    return last(
      run(scenario({ base: 'zeta', units, activeSide: 'empire' }), [
        ['empire', activate('vader', 'zeta')],
        ['empire', mv(['u-01', 'u-02'], 'delta', 'zeta')],
      ]),
    ).state;
  }

  it('base = zeta (Imperial ground in it, activation running) vs base = epsilon / eta: view, legal actions, errors and probe results are equal', () => {
    const a = midActivation();
    expect(baseRevealConditionMet(a)).toBe(true);
    expect(a.rebelBase.revealed).toBe(false);
    for (const other of ['epsilon', 'eta']) {
      const b = relocateBase(a, other);
      if (!b) throw new Error(`relocation to ${other} refused`);
      expect(baseRevealConditionMet(b)).toBe(false);
      expect(toSideView(b, 'empire')).toEqual(toSideView(a, 'empire'));
      expect(getLegalActions(b, 'empire')).toEqual(getLegalActions(a, 'empire'));
      // errors on illegal Empire commands
      expect(errorKey(a, 'empire', PASS)).toBe(K.activationInProgress);
      expect(errorKey(b, 'empire', PASS)).toBe(K.activationInProgress);
      expect(errorKey(a, 'empire', mv(['u-05'], 'zeta', 'zeta'))).toBe(
        errorKey(b, 'empire', mv(['u-05'], 'zeta', 'zeta')),
      );
      for (const from of SYSTEM_IDS) {
        for (const id of ['u-05', 'u-06', 'u-07']) {
          const ka = errorKey(a, 'empire', mv([id], from, 'zeta'));
          expect(ka).not.toBeNull();
          expect(errorKey(b, 'empire', mv([id], from, 'zeta'))).toBe(ka);
        }
      }
      expect(errorKey(a, 'empire', mv(['u-05'], 'delta', 'zeta'))).toBe(K.notOwner);
      // an accepted further move: still hidden, same Empire view
      const ra = tryApply(a, 'empire', mv(['u-03', 'u-04'], 'delta', 'zeta'));
      const rb = tryApply(b, 'empire', mv(['u-03', 'u-04'], 'delta', 'zeta'));
      if (!ra.ok || !rb.ok) throw new Error('move rejected');
      expect(ra.state.rebelBase.revealed).toBe(false);
      expect(toSideView(rb.state, 'empire')).toEqual(toSideView(ra.state, 'empire'));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// AC-9 (engine half): schema unchanged, a save in the middle of an Imperial activation reveals on FINISH
// ---------------------------------------------------------------------------------------------------------

describe('DISC-009 — save / restore (AC-9)', () => {
  it('TC-RS-04: the state schema version is unchanged (3, no upcast needed)', () => {
    expect(REBELLION_STATE_SCHEMA_VERSION).toBe(3);
  });

  it('TC-RS-01 (engine half): a game stored mid-activation with ground in the base reveals once on FINISH after a reload', () => {
    const { state } = groundMovedIn();
    const raw: unknown = JSON.parse(JSON.stringify(state));
    const restored = rebellionServerModule.parseState(raw, {
      sessionId: state.id,
      version: state.version,
    }) as CoreGameState;
    expect(restored).toEqual(state);
    expect(restored.rebelBase.revealed).toBe(false);
    const { state: after, events } = step(restored, 'empire', FINISH);
    expect(eventTypes(events)).toEqual(['ACTIVATION_FINISHED', 'BASE_REVEALED']);
    expect(after.version).toBe(state.version + 1);
    expectRevealedOnce(after);
    // TC-RS-05 (engine half): saved after the reveal → a new base activation with ground never reveals again
    const again = rebellionServerModule.parseState(JSON.parse(JSON.stringify(after)), {
      sessionId: after.id,
      version: after.version,
    }) as CoreGameState;
    const steps = run(again, [
      ['rebels', ACCEPT],
      ['rebels', PASS],
      ['empire', ACCEPT],
      ['empire', activate('tarkin', 'zeta')],
      ['empire', FINISH],
    ]);
    for (const s of steps) expectRevealedOnce(s.state);
  });
});
