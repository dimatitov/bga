/**
 * Hidden information of `core-v1` (AC-10; plan-backend §5.1/§5.2 level 1; TC-H-01..TC-H-12).
 * The single redaction point hides the base from the Empire before the reveal and before the end of the
 * game; the metamorphic test proves that NOTHING the Empire can observe — its view (with the log and its
 * legal actions), and the results of probe commands, legal or not — changes when the base is relocated.
 */
import { describe, expect, it } from 'vitest';
import {
  CorePlayerViewSchema,
  HandoffViewSchema,
  type Command,
  type CoreGameState,
  type Faction,
  type RebellionSettings,
  eligibleRebelBaseSystemIds,
} from '../../../src/schema';
import {
  createCoreGame,
  getLegalActions,
  toPlayerEvents,
  toPlayerView,
  toSideView,
} from '../../../src/rules';
import { coreDataBaseV1 } from '../../../src/scenario';
import { SYSTEM_IDS, T, miniData } from './fixtures/mini-data';
import {
  ACCEPT,
  EMPIRE_VS_AI,
  FINISH,
  HOT_SEAT,
  PASS,
  REBELS_VS_AI,
  activate,
  mulberry32,
  mv,
  newCore,
  ok,
  originFor,
  pathsOf,
  play,
  randomStep,
  scenario,
  tryApply,
} from './helpers';

/**
 * Paths where the base id may legally appear in an Empire-facing payload: the static map, ACTIVATE
 * `systemIds` (all systems), and the Empire's OWN pieces / activation / events (the Empire may stand in the
 * base system without knowing it: that is its own knowledge, indistinguishable from any other system —
 * proven by the relocation test below). Anything about Rebel pieces or Rebel events must never carry it.
 */
const ALLOWED = [
  /^\$\.map\.systems\[\d+\]\.(id|nameKey|adjacentSystemIds\[\d+\])$/,
  /^\$\.legalActions\[\d+\]\.(systemIds\[\d+\]|fromSystemId|toSystemId)$/,
];
function leaks(value: unknown, baseId: string): string[] {
  const view = value as {
    units?: { owner: string }[];
    leaders?: { owner: string }[];
    activation?: { side: string } | null;
    log?: { actor: string }[];
  };
  const imperial = (owner: string) => owner === 'empire';
  const allowedByOwner = (path: string): boolean => {
    const m = /^\$\.(units|leaders|log)\[(\d+)\]/.exec(path);
    if (m) {
      const item = (view[m[1] as 'units' | 'leaders' | 'log'] ?? [])[Number(m[2])] as
        { owner?: string; actor?: string } | undefined;
      return imperial(item?.owner ?? item?.actor ?? '');
    }
    return path.startsWith('$.activation.') && view.activation?.side === 'empire';
  };
  return pathsOf(value, [baseId, `systems.${baseId}`]).filter(
    (path) => !ALLOWED.some((re) => re.test(path)) && !allowedByOwner(path),
  );
}

describe('Empire view before the reveal', () => {
  it('base units in the zone, rebelBase.systemId null, no base id outside the static map (TC-H-01)', () => {
    const state = newCore(HOT_SEAT, 'hidden-1');
    const baseId = state.rebelBase.systemId;
    const empire = CorePlayerViewSchema.parse(toSideView(state, 'empire'));
    expect(empire.rebelBase).toEqual({ systemId: null, revealed: false });
    const baseUnits = state.units.filter((u) => u.systemId === baseId).map((u) => u.id);
    expect(baseUnits.length).toBeGreaterThan(0);
    for (const unit of empire.units) {
      expect(unit.location).toEqual(
        baseUnits.includes(unit.id)
          ? { kind: 'rebelBase' }
          : { kind: 'system', systemId: state.units.find((u) => u.id === unit.id)?.systemId },
      );
    }
    expect(leaks(empire, baseId)).toEqual([]);
    const rebels = toSideView(state, 'rebels');
    expect(rebels.rebelBase).toEqual({ systemId: baseId, revealed: false });
    expect(rebels.units.every((u) => u.location.kind === 'system')).toBe(true);
  });

  it('a Rebel activation of the base: activation and leader in the zone, event system null (TC-H-03)', () => {
    const { state, events } = ok(scenario({ base: 'zeta' }), 'rebels', activate('leia', 'zeta'));
    const empire = toSideView(state, 'empire');
    expect(empire.activation).toEqual({
      side: 'rebels',
      leaderId: 'leia',
      location: { kind: 'rebelBase' },
    });
    expect(empire.leaders.find((l) => l.id === 'leia')?.location).toEqual({ kind: 'rebelBase' });
    expect(empire.log.at(-1)?.payload).toEqual({ leaderId: 'leia', systemId: null });
    expect(leaks(empire, 'zeta')).toEqual([]);
    // what the Rebels see is not redacted
    expect(toSideView(state, 'rebels').log.at(-1)?.payload).toEqual({
      leaderId: 'leia',
      systemId: 'zeta',
    });
    // command events for a viewer are redacted against the resulting state (Empire as viewer)
    const forEmpire = toPlayerEvents(events, { ...state, activeSide: 'empire' });
    expect(forEmpire[0]?.payload).toEqual({ leaderId: 'leia', systemId: null });
  });

  it('Rebel moves into and out of the base: base system → null for the Empire (TC-H-04, Q-15)', () => {
    const into = ok(
      scenario({
        base: 'zeta',
        units: [[T.XW, 'delta']],
        activation: { leaderId: 'leia', systemId: 'zeta' },
      }),
      'rebels',
      mv(['u-01'], 'delta', 'zeta'),
    ).state;
    expect(toSideView(into, 'empire').log.at(-1)?.payload).toEqual({
      pieceIds: ['u-01'],
      fromSystemId: 'delta',
      toSystemId: null,
    });
    const out = ok(
      scenario({
        base: 'zeta',
        units: [[T.XW, 'zeta']],
        activation: { leaderId: 'leia', systemId: 'delta' },
      }),
      'rebels',
      mv(['u-01'], 'zeta', 'delta'),
    ).state;
    expect(toSideView(out, 'empire').log.at(-1)?.payload).toEqual({
      pieceIds: ['u-01'],
      fromSystemId: null,
      toSystemId: 'delta',
    });
    // Imperial moves into the base system are the Empire's own knowledge: not redacted.
    const imperial = ok(
      scenario({
        base: 'zeta',
        units: [[T.SD, 'delta']],
        activeSide: 'empire',
        activation: { leaderId: 'vader', systemId: 'zeta' },
      }),
      'empire',
      mv(['u-01'], 'delta', 'zeta'),
    ).state;
    expect(toSideView(imperial, 'empire').log.at(-1)?.payload).toMatchObject({
      toSystemId: 'zeta',
    });
  });

  it('contestedSystemIds is computed after the redaction (TC-H-05)', () => {
    // (a) Rebels only in the base
    const a = scenario({
      base: 'zeta',
      units: [
        [T.RT, 'zeta'],
        [T.SD, 'alpha'],
      ],
    });
    expect(toSideView(a, 'empire').contestedSystemIds).toEqual([]);
    // (b) Imperial ground units in the base, before FINISH_ACTIVATION
    const b = ok(
      scenario({
        base: 'zeta',
        units: [
          [T.RT, 'zeta'],
          [T.AC, 'delta'],
          [T.ST, 'delta'],
        ],
        activeSide: 'empire',
        activation: { leaderId: 'vader', systemId: 'zeta' },
      }),
      'empire',
      mv(['u-02', 'u-03'], 'delta', 'zeta'),
    ).state;
    expect(toSideView(b, 'empire').contestedSystemIds).toEqual([]);
    expect(toSideView(b, 'rebels').contestedSystemIds).toEqual(['zeta']);
  });

  it('LEADERS_RETURNED carries ids only, also for a leader coming back from the base (TC-H-06)', () => {
    const state = scenario({
      base: 'zeta',
      leadersAt: { leia: 'zeta' },
      activeSide: 'empire',
      passed: { rebels: true },
    });
    const next = ok(state, 'empire', PASS).state;
    const returned = toSideView(next, 'empire').log.find((e) => e.type === 'LEADERS_RETURNED');
    expect(returned?.payload).toEqual({ leaderIds: ['leia'] });
    expect(leaks(toSideView(next, 'empire'), 'zeta')).toEqual([]);
  });

  it('probing Rebel units from every source: always notOwner, request-only details (TC-H-08, TC-H-09)', () => {
    const state = scenario({
      base: 'zeta',
      units: [
        [T.RT, 'zeta'],
        [T.XW, 'epsilon'],
        [T.SD, 'gamma'],
      ],
      activeSide: 'empire',
      activation: { leaderId: 'vader', systemId: 'delta' },
    });
    for (const from of ['beta', 'gamma', 'zeta']) {
      for (const pieceId of ['u-01', 'u-02']) {
        const result = tryApply(state, 'empire', mv([pieceId], from, 'delta'));
        expect(result.ok ? null : result.error).toEqual({
          code: 'ILLEGAL_COMMAND',
          messageKey: 'errors.notOwner',
          details: { pieceId },
        });
      }
    }
    // Own unit not in the claimed source: the same answer for the base and an ordinary system.
    for (const from of ['zeta', 'beta']) {
      const result = tryApply(state, 'empire', mv(['u-03'], from, 'delta'));
      expect(result.ok ? null : result.error).toEqual({
        code: 'ILLEGAL_COMMAND',
        messageKey: 'errors.notInFromSystem',
        details: { pieceId: 'u-03', fromSystemId: from },
      });
    }
  });

  it('handoff: strict 8-key view, no events, nothing about the base (TC-H-12)', () => {
    const state = ok(scenario({ base: 'zeta' }), 'rebels', PASS);
    const view = HandoffViewSchema.parse(toPlayerView(state.state, 'prototype'));
    expect(Object.keys(view).sort()).toEqual(
      [
        'activeSide',
        'id',
        'kind',
        'phase',
        'round',
        'rulesEngine',
        'sessionStatus',
        'version',
      ].sort(),
    );
    expect(toPlayerEvents(state.events, state.state)).toEqual([]);
    expect(leaks(view, 'zeta')).toEqual([]);
  });
});

describe('after the reveal', () => {
  it('base visible to the Empire; past events shown unredacted (TC-H-10, Q-16)', () => {
    const state = play(
      scenario({
        base: 'zeta',
        units: [
          [T.XW, 'delta'],
          [T.RT, 'zeta'],
          [T.AC, 'epsilon'],
          [T.ST, 'epsilon'],
        ],
      }),
      [
        ['rebels', activate('leia', 'zeta')],
        ['rebels', mv(['u-01'], 'delta', 'zeta')],
        ['rebels', FINISH],
        ['empire', ACCEPT],
        ['empire', activate('vader', 'zeta')],
        ['empire', mv(['u-03', 'u-04'], 'epsilon', 'zeta')],
      ],
    );
    expect(
      toSideView(state, 'empire').log.filter((e) => e.type === 'SYSTEM_ACTIVATED')[0]?.payload,
    ).toEqual({
      leaderId: 'leia',
      systemId: null,
    });
    const revealed = ok(state, 'empire', FINISH).state;
    const view = toSideView(revealed, 'empire');
    expect(view.rebelBase).toEqual({ systemId: 'zeta', revealed: true });
    expect(view.units.every((u) => u.location.kind === 'system')).toBe(true);
    expect(view.log.filter((e) => e.type === 'SYSTEM_ACTIVATED')[0]?.payload).toEqual({
      leaderId: 'leia',
      systemId: 'zeta',
    });
    expect(view.log.find((e) => e.type === 'PIECES_MOVED')?.payload).toMatchObject({
      toSystemId: 'zeta',
    });
    expect(view.log.find((e) => e.type === 'BASE_REVEALED')?.payload).toEqual({ systemId: 'zeta' });
    expect(view.contestedSystemIds).toContain('zeta');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Metamorphic invariance to base relocation (plan-backend §5.2 level 1, TC-H-02, TC-H-07)
// ---------------------------------------------------------------------------------------------------------

/**
 * Move the (hidden) base from its system to `to`, together with every Rebel unit / leader / activation
 * standing there and every Rebel event that mentions it. `null` when `to` already carries Rebel traces
 * (then the Empire could legitimately see a difference).
 */
function relocateBase(state: CoreGameState, to: string): CoreGameState | null {
  const from = state.rebelBase.systemId;
  if (to === from) return null;
  const rebelsAt = (id: string | null) => id === to;
  if (state.units.some((u) => u.owner === 'rebels' && rebelsAt(u.systemId))) return null;
  if (state.leaders.some((l) => l.owner === 'rebels' && rebelsAt(l.systemId))) return null;
  if (state.activation?.side === 'rebels' && state.activation.systemId === to) return null;
  const mentions = state.log.some(
    (e) =>
      e.actor === 'rebels' &&
      ((e.type === 'SYSTEM_ACTIVATED' && e.payload.systemId === to) ||
        (e.type === 'PIECES_MOVED' &&
          (e.payload.fromSystemId === to || e.payload.toSystemId === to))),
  );
  if (mentions) return null;
  const swap = (id: string) => (id === from ? to : id);
  return {
    ...state,
    rebelBase: { ...state.rebelBase, systemId: to },
    units: state.units.map((u) =>
      u.owner === 'rebels' ? { ...u, systemId: swap(u.systemId) } : u,
    ),
    leaders: state.leaders.map((l) =>
      l.owner === 'rebels' && l.systemId !== null ? { ...l, systemId: swap(l.systemId) } : l,
    ),
    activation:
      state.activation?.side === 'rebels'
        ? { ...state.activation, systemId: swap(state.activation.systemId) }
        : state.activation,
    log: state.log.map((e) => {
      if (e.actor !== 'rebels') return e;
      if (e.type === 'SYSTEM_ACTIVATED')
        return { ...e, payload: { ...e.payload, systemId: swap(e.payload.systemId) } };
      if (e.type === 'PIECES_MOVED') {
        return {
          ...e,
          payload: {
            ...e.payload,
            fromSystemId: swap(e.payload.fromSystemId),
            toSystemId: swap(e.payload.toSystemId),
          },
        };
      }
      return e;
    }),
  };
}

/** Commands the Empire may send, legal or not (incl. references to the base and to Rebel units). */
function empireProbes(state: CoreGameState): Command[] {
  const probes: Command[] = [PASS, FINISH, ACCEPT];
  for (const leader of ['palpatine', 'vader', 'tarkin', 'tagge', 'leia']) {
    for (const systemId of SYSTEM_IDS) probes.push(activate(leader, systemId));
  }
  const target = state.activation?.systemId ?? 'delta';
  for (const unit of state.units) {
    for (const from of SYSTEM_IDS) probes.push(mv([unit.id], from, target));
  }
  return probes;
}

/** Everything the Empire can observe from `state` (view, events) and from probing it. */
function empireObservation(state: CoreGameState, empireOrigin: 'player' | 'auto') {
  const view = toSideView(state, 'empire');
  const probes = empireProbes(state).map((command) => {
    const result = tryApply(state, 'empire', command, { origin: empireOrigin });
    if (!result.ok) return { ok: false, error: result.error };
    // A FINISH of an Imperial activation with own ground units in the activated system may reveal the
    // base — the one legitimate way to learn it (R-8). Decided from Empire-visible facts only.
    const activation = state.activation;
    const finishAtBase =
      command.type === 'FINISH_ACTIVATION' &&
      activation !== null &&
      state.units.some(
        (u) =>
          u.owner === 'empire' &&
          u.systemId === activation.systemId &&
          u.typeKey.match(/stormtrooper|at-at/) !== null,
      );
    return {
      ok: true,
      view: finishAtBase ? null : toSideView(result.state, 'empire'),
      events: finishAtBase
        ? null
        : toPlayerEvents(result.events, {
            ...result.state,
            activeSide: 'empire',
            handoffPending: false,
          }),
    };
  });
  return { view, legal: getLegalActions(state, 'empire'), probes };
}

function checkInvariance(state: CoreGameState): number {
  if (state.rebelBase.revealed || state.outcome !== null) return 0;
  const origin = originFor(state, 'empire');
  const expected = empireObservation(state, origin);
  expect(leaks(expected.view, state.rebelBase.systemId)).toEqual([]);
  let compared = 0;
  for (const to of SYSTEM_IDS) {
    const moved = relocateBase(state, to);
    if (!moved) continue;
    expect(empireObservation(moved, origin)).toEqual(expected);
    compared += 1;
  }
  return compared;
}

describe('Empire observations are invariant to relocating the hidden base (TC-H-02)', () => {
  it('scripted hot-seat game: Rebel moves into / out of the base, base activation, two refreshes', () => {
    let state = newCore(HOT_SEAT, 'game-0');
    const baseId = state.rebelBase.systemId;
    expect(baseId).toBe('zeta'); // mini data: game-0 → zeta (chooseRebelBase)
    const script: [Faction, Command][] = [
      ['rebels', activate('leia', 'eta')],
      ['rebels', mv(['u-09', 'u-10', 'u-12'], 'theta', 'eta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', activate('vader', 'beta')],
      ['empire', mv(['u-01', 'u-04'], 'alpha', 'beta')],
      ['empire', FINISH],
      ['rebels', ACCEPT],
      ['rebels', activate('dodonna', 'zeta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', PASS],
      ['rebels', ACCEPT],
      ['rebels', PASS],
      // round 2: Rebels first, they passed last → no handoff
      ['rebels', activate('leia', 'delta')],
      ['rebels', mv(['u-14'], 'zeta', 'delta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', activate('vader', 'epsilon')],
      ['empire', FINISH],
      ['rebels', ACCEPT],
      ['rebels', activate('dodonna', 'zeta')],
      ['rebels', mv(['u-09', 'u-12'], 'eta', 'zeta')],
      ['rebels', FINISH],
      ['empire', ACCEPT],
      ['empire', PASS],
      ['rebels', ACCEPT],
      ['rebels', PASS],
    ];
    let compared = checkInvariance(state);
    for (const [actor, command] of script) {
      state = ok(state, actor, command).state;
      compared += checkInvariance(state);
    }
    expect(state.round).toBe(3);
    expect(compared).toBeGreaterThan(script.length);
  });

  /*
   * SWR-005 CODE_REVIEW #1: relocation candidates taken from the REAL data at creation. Every other eligible
   * base must be a valid relocation target (`relocateBase` never skips one because of starting Rebel units —
   * that skip used to hide the Bothawui leak) and the Empire's observation must not change.
   */
  it('at creation, mini data: relocating to every eligible base changes no Empire observation', () => {
    for (const settings of [HOT_SEAT, REBELS_VS_AI, EMPIRE_VS_AI] as RebellionSettings[]) {
      const state = newCore(settings, 'reloc-mini');
      const origin = originFor(state, 'empire');
      const expected = empireObservation(state, origin);
      const candidates = eligibleRebelBaseSystemIds(miniData());
      expect(candidates).toContain(state.rebelBase.systemId);
      for (const to of candidates) {
        if (to === state.rebelBase.systemId) continue;
        const moved = relocateBase(state, to);
        expect(moved, to).not.toBeNull();
        expect(empireObservation(moved!, origin), to).toEqual(expected);
      }
    }
  });

  it('at creation, real base-game data: relocating to every eligible base changes no Empire view / legal actions', () => {
    const candidates = eligibleRebelBaseSystemIds(coreDataBaseV1);
    expect(candidates.length).toBeGreaterThan(1);
    for (const settings of [HOT_SEAT, REBELS_VS_AI, EMPIRE_VS_AI] as RebellionSettings[]) {
      const state = createCoreGame(settings, coreDataBaseV1, {
        gameId: 'reloc-real',
        now: '2026-11-08T10:00:00.000Z',
      });
      const observe = (s: CoreGameState) => ({
        view: toSideView(s, 'empire'),
        legal: getLegalActions(s, 'empire'),
      });
      const expected = observe(state);
      expect(leaks(expected.view, state.rebelBase.systemId)).toEqual([]);
      let compared = 0;
      for (const to of candidates) {
        if (to === state.rebelBase.systemId) continue;
        const moved = relocateBase(state, to);
        expect(moved, to).not.toBeNull();
        expect(observe(moved!), to).toEqual(expected);
        compared += 1;
      }
      expect(compared).toBe(candidates.length - 1);
    }
  });

  for (const [name, settings] of [
    ['hot-seat', HOT_SEAT],
    ['Rebels vs AI', REBELS_VS_AI],
    ['Empire vs AI', EMPIRE_VS_AI],
  ] as const) {
    it(`seeded random games before the reveal: ${name}`, () => {
      let compared = 0;
      for (let seed = 1; seed <= 4; seed += 1) {
        const rng = mulberry32(seed * 104_729);
        let state = newCore(settings, `meta-${name}-${seed}`);
        for (
          let step = 0;
          step < 40 && !state.rebelBase.revealed && state.outcome === null;
          step += 1
        ) {
          compared += checkInvariance(state);
          state = randomStep(state, rng, 0.1).state;
        }
      }
      expect(compared).toBeGreaterThan(50);
    });
  }
});
