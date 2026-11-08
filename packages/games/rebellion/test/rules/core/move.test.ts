/** R-5 `MOVE_PIECES` + transport capacity (TC-U-32..TC-U-56). Activation in `delta` (adjacent: beta, gamma, zeta). */
import { describe, expect, it } from 'vitest';
import { REBELLION_ERROR_MESSAGE_KEYS as K, type Faction } from '../../../src/schema';
import { toSideView } from '../../../src/rules';
import { T, type TypeKey } from './fixtures/mini-data';
import { errorKey, idsAt, mv, ok, rejected, scenario, type Scenario } from './helpers';

/** `side` is activating `delta`; base in `eta` (not involved). */
function activeIn(side: Faction, units: [TypeKey, string][], extra: Partial<Scenario> = {}) {
  return scenario({
    base: 'eta',
    units,
    activeSide: side,
    activation: { leaderId: side === 'empire' ? 'vader' : 'leia', systemId: 'delta' },
    ...extra,
  });
}

const times = <V>(n: number, v: V): V[] => Array.from({ length: n }, () => v);

describe('MOVE_PIECES: legal moves', () => {
  it('moves own units into the activated system; the activation continues (TC-U-32, TC-U-33)', () => {
    const state = activeIn('rebels', [
      [T.XW, 'beta'],
      [T.YW, 'zeta'],
    ]);
    const first = ok(state, 'rebels', mv(['u-01'], 'beta', 'delta'));
    expect(first.state.units.find((u) => u.id === 'u-01')?.systemId).toBe('delta');
    expect(first.state.activation).toEqual(state.activation);
    expect(first.state.version).toBe(state.version + 1);
    expect(first.events).toMatchObject([
      {
        type: 'PIECES_MOVED',
        actor: 'rebels',
        payload: { pieceIds: ['u-01'], fromSystemId: 'beta', toSystemId: 'delta' },
      },
    ]);
    const second = ok(first.state, 'rebels', mv(['u-02'], 'zeta', 'delta'));
    expect(idsAt(second.state, 'delta')).toEqual(['u-01', 'u-02']);
  });

  it('an enemy leader in the source system does not pin (TC-U-39)', () => {
    const state = activeIn('rebels', [[T.XW, 'beta']], { leadersAt: { vader: 'beta' } });
    ok(state, 'rebels', mv(['u-01'], 'beta', 'delta'));
  });

  it('into a system with enemy units: allowed, contested, no combat (TC-U-52, D-1)', () => {
    const state = activeIn('rebels', [
      [T.XW, 'beta'],
      [T.SD, 'delta'],
    ]);
    const next = ok(state, 'rebels', mv(['u-01'], 'beta', 'delta')).state;
    expect(next.units.find((u) => u.id === 'u-02')?.systemId).toBe('delta');
    expect(toSideView(next, 'rebels').contestedSystemIds).toEqual(['delta']);
    expect(toSideView(next, 'empire').contestedSystemIds).toEqual(['delta']);
  });

  it('from the base system by the same rules (TC-U-53, D-6)', () => {
    const state = scenario({
      base: 'zeta',
      units: [
        [T.CC, 'zeta'],
        [T.RT, 'zeta'],
        [T.SG, 'zeta'],
      ],
      activation: { leaderId: 'leia', systemId: 'delta' },
    });
    ok(state, 'rebels', mv(['u-01', 'u-02'], 'zeta', 'delta'));
  });
});

describe('MOVE_PIECES: transport capacity (one shared limit per command)', () => {
  it('SD (6) + exactly 6 units needing a place → legal (TC-U-42)', () => {
    const units: [TypeKey, string][] = [
      [T.SD, 'gamma'],
      ...times(3, [T.ST, 'gamma'] as [TypeKey, string]),
      [T.ATAT, 'gamma'],
      [T.TIE, 'gamma'],
      [T.TIE, 'gamma'],
    ];
    const state = activeIn('empire', units);
    ok(state, 'empire', mv(idsAt(state, 'gamma'), 'gamma', 'delta'));
  });

  it('SD + 7 → insufficientCapacity {fromSystemId, required 7, available 6}; nothing moved (TC-U-43)', () => {
    const state = activeIn('empire', [
      [T.SD, 'gamma'],
      ...times(7, [T.ST, 'gamma'] as [TypeKey, string]),
    ]);
    expect(
      rejected(state, 'empire', mv(idsAt(state, 'gamma'), 'gamma', 'delta'), K.insufficientCapacity)
        .details,
    ).toEqual({ fromSystemId: 'gamma', required: 7, available: 6 });
  });

  it('a ship staying behind gives no capacity (TC-U-44)', () => {
    const state = activeIn('empire', [
      [T.SD, 'gamma'],
      [T.ST, 'gamma'],
    ]);
    expect(
      rejected(state, 'empire', mv(['u-02'], 'gamma', 'delta'), K.insufficientCapacity).details,
    ).toEqual({
      fromSystemId: 'gamma',
      required: 1,
      available: 0,
    });
  });

  it('capacities of the ships of one command add up: SD + AC + 10 legal, + 11 not (TC-U-45)', () => {
    const ten = activeIn('empire', [
      [T.SD, 'gamma'],
      [T.AC, 'gamma'],
      ...times(10, [T.ST, 'gamma'] as [TypeKey, string]),
    ]);
    ok(ten, 'empire', mv(idsAt(ten, 'gamma'), 'gamma', 'delta'));
    const eleven = activeIn('empire', [
      [T.SD, 'gamma'],
      [T.AC, 'gamma'],
      ...times(11, [T.TIE, 'gamma'] as [TypeKey, string]),
    ]);
    rejected(
      eleven,
      'empire',
      mv(idsAt(eleven, 'gamma'), 'gamma', 'delta'),
      K.insufficientCapacity,
    );
  });

  it('ground units and TIE fighters share the places: AC + 2 ST + 2 TIE legal, AC + 3 ST + 2 TIE not (TC-U-46)', () => {
    const state = activeIn('empire', [
      [T.AC, 'gamma'],
      [T.ST, 'gamma'],
      [T.ST, 'gamma'],
      [T.ST, 'gamma'],
      [T.TIE, 'gamma'],
      [T.TIE, 'gamma'],
    ]);
    ok(state, 'empire', mv(['u-01', 'u-02', 'u-03', 'u-05', 'u-06'], 'gamma', 'delta'));
    rejected(state, 'empire', mv(idsAt(state, 'gamma'), 'gamma', 'delta'), K.insufficientCapacity);
  });

  it('Rebel catalogue: CC (2) + 2 RT legal; CC + 2 RT + AS not; TR (4) + 3 RT + AS legal (TC-U-46a)', () => {
    const state = activeIn('rebels', [
      [T.CC, 'gamma'],
      [T.RT, 'gamma'],
      [T.RT, 'gamma'],
      [T.AS, 'gamma'],
      [T.TR, 'beta'],
      [T.RT, 'beta'],
      [T.RT, 'beta'],
      [T.RT, 'beta'],
      [T.AS, 'beta'],
    ]);
    ok(state, 'rebels', mv(['u-01', 'u-02', 'u-03'], 'gamma', 'delta'));
    rejected(
      state,
      'rebels',
      mv(['u-01', 'u-02', 'u-03', 'u-04'], 'gamma', 'delta'),
      K.insufficientCapacity,
    );
    ok(state, 'rebels', mv(idsAt(state, 'beta'), 'beta', 'delta'));
  });

  it('X-wing / Y-wing need no place; a lone TIE does (TC-U-46b, TC-U-46c)', () => {
    const rebels = activeIn('rebels', [
      [T.XW, 'beta'],
      [T.YW, 'beta'],
    ]);
    ok(rebels, 'rebels', mv(['u-01', 'u-02'], 'beta', 'delta'));
    const empire = activeIn('empire', [[T.TIE, 'beta']]);
    rejected(empire, 'empire', mv(['u-01'], 'beta', 'delta'), K.insufficientCapacity);
  });

  it('the Death Star is mobile with capacity 8 (TC-U-46d); ships alone always move (TC-U-47)', () => {
    const state = activeIn('empire', [
      [T.DS, 'zeta'],
      ...times(4, [T.ST, 'zeta'] as [TypeKey, string]),
      ...times(4, [T.TIE, 'zeta'] as [TypeKey, string]),
      [T.SD, 'beta'],
      [T.AC, 'beta'],
    ]);
    ok(state, 'empire', mv(idsAt(state, 'zeta'), 'zeta', 'delta'));
    ok(state, 'empire', mv(idsAt(state, 'beta'), 'beta', 'delta'));
  });

  it('a ship that arrived earlier gives no capacity to a later move (TC-U-47a)', () => {
    const state = activeIn('empire', [
      [T.SD, 'beta'],
      [T.ST, 'gamma'],
    ]);
    const arrived = ok(state, 'empire', mv(['u-01'], 'beta', 'delta')).state;
    rejected(arrived, 'empire', mv(['u-02'], 'gamma', 'delta'), K.insufficientCapacity);
  });
});

describe('MOVE_PIECES: rejections (state unchanged)', () => {
  const base: [TypeKey, string][] = [
    [T.XW, 'beta'], // u-01
    [T.SG, 'beta'], // u-02
    [T.SD, 'beta'], // u-03 Empire
    [T.XW, 'gamma'], // u-04
    [T.XW, 'alpha'], // u-05 (not adjacent to delta)
  ];

  it('noActivation (TC-U-34)', () => {
    const state = scenario({ base: 'eta', units: base });
    expect(
      rejected(state, 'rebels', mv(['u-01'], 'beta', 'delta'), K.noActivation).details,
    ).toEqual({
      actor: 'rebels',
    });
  });

  it('unknownSystem (from, then to), notActivatedSystem, sameSystem, notAdjacent (TC-U-35..U-37, U-50)', () => {
    const state = activeIn('rebels', base);
    expect(
      rejected(state, 'rebels', mv(['u-01'], 'nowhere', 'delta'), K.unknownSystem).details,
    ).toEqual({
      systemId: 'nowhere',
    });
    expect(
      rejected(state, 'rebels', mv(['u-01'], 'beta', 'nowhere'), K.unknownSystem).details,
    ).toEqual({
      systemId: 'nowhere',
    });
    expect(
      rejected(state, 'rebels', mv(['u-01'], 'alpha', 'beta'), K.notActivatedSystem).details,
    ).toEqual({
      toSystemId: 'beta',
    });
    expect(rejected(state, 'rebels', mv(['u-01'], 'delta', 'delta'), K.sameSystem).details).toEqual(
      {
        fromSystemId: 'delta',
        toSystemId: 'delta',
      },
    );
    expect(
      rejected(state, 'rebels', mv(['u-05'], 'alpha', 'delta'), K.notAdjacent).details,
    ).toEqual({
      fromSystemId: 'alpha',
      toSystemId: 'delta',
    });
  });

  it('pinnedByLeader: own leader in the source system, also from a previous activation (TC-U-38, TC-U-40)', () => {
    const state = activeIn('rebels', base, { leadersAt: { dodonna: 'beta' } });
    expect(
      rejected(state, 'rebels', mv(['u-01'], 'beta', 'delta'), K.pinnedByLeader).details,
    ).toEqual({
      fromSystemId: 'beta',
    });
    // Previous activation left Leia in beta; now Dodonna activates delta (adjacent).
    const earlier = scenario({
      base: 'eta',
      units: base,
      leadersAt: { leia: 'beta' },
      activation: { leaderId: 'dodonna', systemId: 'delta' },
    });
    rejected(earlier, 'rebels', mv(['u-01'], 'beta', 'delta'), K.pinnedByLeader);
  });

  it('unknownPiece, notOwner, notInFromSystem, immobileUnit with request-only details (TC-U-41, U-49, U-50)', () => {
    const state = activeIn('rebels', base);
    expect(
      rejected(state, 'rebels', mv(['u-99'], 'beta', 'delta'), K.unknownPiece).details,
    ).toEqual({ pieceId: 'u-99' });
    expect(rejected(state, 'rebels', mv(['u-03'], 'beta', 'delta'), K.notOwner).details).toEqual({
      pieceId: 'u-03',
    });
    expect(
      rejected(state, 'rebels', mv(['u-04'], 'beta', 'delta'), K.notInFromSystem).details,
    ).toEqual({
      pieceId: 'u-04',
      fromSystemId: 'beta',
    });
    expect(
      rejected(state, 'rebels', mv(['u-02'], 'beta', 'delta'), K.immobileUnit).details,
    ).toEqual({ pieceId: 'u-02' });
    const dsuc = activeIn('empire', [[T.DSUC, 'beta']]);
    rejected(dsuc, 'empire', mv(['u-01'], 'beta', 'delta'), K.immobileUnit);
  });

  it('all or nothing: legal units + one illegal → rejected, nothing moved (TC-U-48)', () => {
    const state = activeIn('rebels', [...base, [T.YW, 'beta'], [T.RT, 'beta']]);
    rejected(state, 'rebels', mv(['u-01', 'u-06', 'u-03'], 'beta', 'delta'), K.notOwner);
    rejected(state, 'rebels', mv(['u-01', 'u-06', 'u-02'], 'beta', 'delta'), K.immobileUnit);
    rejected(state, 'rebels', mv(['u-01', 'u-06', 'u-04'], 'beta', 'delta'), K.notInFromSystem);
    rejected(
      state,
      'rebels',
      mv(['u-01', 'u-06', 'u-07'], 'beta', 'delta'),
      K.insufficientCapacity,
    );
  });

  it('check order (TC-U-56)', () => {
    const state = activeIn('rebels', base, { leadersAt: { dodonna: 'beta' } });
    // (a) notActivatedSystem before notAdjacent
    expect(errorKey(state, 'rebels', mv(['u-05'], 'alpha', 'gamma'))).toBe(K.notActivatedSystem);
    // sameSystem before notAdjacent / pieces
    expect(errorKey(state, 'rebels', mv(['u-99'], 'delta', 'delta'))).toBe(K.sameSystem);
    // (b) pinnedByLeader before piece checks
    expect(errorKey(state, 'rebels', mv(['u-03'], 'beta', 'delta'))).toBe(K.pinnedByLeader);
    const free = activeIn('rebels', base);
    // (c) first piece in request order decides: [enemy, immobile] → notOwner
    expect(errorKey(free, 'rebels', mv(['u-03', 'u-02'], 'beta', 'delta'))).toBe(K.notOwner);
    expect(errorKey(free, 'rebels', mv(['u-02', 'u-03'], 'beta', 'delta'))).toBe(K.immobileUnit);
    // (d) enemy unit elsewhere → notOwner (owner before location)
    const enemyElsewhere = activeIn('rebels', [...base, [T.SD, 'zeta']]);
    expect(errorKey(enemyElsewhere, 'rebels', mv(['u-06'], 'beta', 'delta'))).toBe(K.notOwner);
    // unknownPiece before capacity
    expect(errorKey(free, 'rebels', mv(['u-01', 'u-99'], 'beta', 'delta'))).toBe(K.unknownPiece);
  });
});
