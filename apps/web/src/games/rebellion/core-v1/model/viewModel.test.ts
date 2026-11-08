import { PlayerViewSchema, type PlayerViewCore } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import {
  CORE_SYSTEM_IDS_FIXTURE,
  CS_ALDERAAN,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  L_DODONNA,
  L_LEIA,
  L_MOTHMA,
  L_RIEEKAN,
  L_VADER,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreHandoffView,
  makeCoreOutcomeView,
  makeCoreView,
  U_RT_BASE,
  U_RT_SULLUST,
  U_SD,
  U_SHIELD,
  U_TRANSPORT,
  U_XWING,
} from '../../test/coreFixtures';
import * as vm from './viewModel';

describe('core fixtures follow the frozen schema', () => {
  it.each([
    ['makeCoreView', makeCoreView()],
    ['makeCoreActivationView', makeCoreActivationView()],
    ['makeCoreEmpireView', makeCoreEmpireView()],
    ['makeCoreOutcomeView rebels', makeCoreOutcomeView('rebels')],
    ['makeCoreOutcomeView empire', makeCoreOutcomeView('empire')],
    ['makeCoreHandoffView', makeCoreHandoffView()],
  ])('%s parses with PlayerViewSchema', (_, view) => {
    const parsed = PlayerViewSchema.safeParse(view);
    expect(parsed.error).toBeUndefined();
    expect(parsed.data).toEqual(view);
  });
});

describe('viewModel — legal actions are the only source of what the viewer may do (AC-04..06)', () => {
  it('ACTIVATE_SYSTEM: activatable leaders and targets come from leaderIds / systemIds', () => {
    const view = makeCoreView();
    expect(vm.isMyTurn(view)).toBe(true);
    expect(vm.activatableLeaders(view)).toEqual([L_LEIA, L_DODONNA, L_RIEEKAN]);
    expect(vm.canActivateLeader(view, L_LEIA)).toBe(true);
    // Mon Mothma is in the pool but cannot activate (not listed by the server).
    expect(vm.canActivateLeader(view, L_MOTHMA)).toBe(false);
    expect(vm.activationTargets(view, L_LEIA)).toEqual([...CORE_SYSTEM_IDS_FIXTURE]);
    expect(vm.activationTargets(view, L_MOTHMA)).toEqual([]);
    expect(vm.activationTargets(view, null)).toEqual([]);
    // The opponent's leader is never activatable for the viewer.
    expect(vm.activationTargets(view, L_VADER)).toEqual([]);
    expect(vm.canActivate(view, L_LEIA, CS_HOTH)).toBe(true);
    expect(vm.canActivate(view, L_LEIA, 'nowhere')).toBe(false);
    expect(vm.canActivate(view, null, CS_HOTH)).toBe(false);
  });

  it('the server may restrict targets per action — the UI never widens them', () => {
    const view = makeCoreView({
      legalActions: [{ type: 'ACTIVATE_SYSTEM', leaderIds: [L_LEIA], systemIds: [CS_SULLUST] }],
    });
    expect(vm.activationTargets(view, L_LEIA)).toEqual([CS_SULLUST]);
    expect(vm.canActivate(view, L_LEIA, CS_CORUSCANT)).toBe(false);
    expect(vm.canPass(view)).toBe(false);
  });

  it('no ACTIVATE_SYSTEM → no leader is activatable (pool inactive)', () => {
    const view = makeCoreView({ legalActions: [{ type: 'PASS' }] });
    expect(vm.activatableLeaders(view)).toEqual([]);
    expect(vm.activationTargets(view, L_LEIA)).toEqual([]);
    expect(vm.canPass(view)).toBe(true);
    expect(vm.turnState(view)).toBe('idle');
  });

  it('MOVE_PIECES: one source per action, candidates with capacity numbers; immobile units are absent', () => {
    const view = makeCoreActivationView();
    const sources = vm.moveSources(view);
    expect(sources.map((s) => [s.fromSystemId, s.toSystemId])).toEqual([
      [CS_SULLUST, CS_CORELLIA],
      [CS_YAVIN, CS_CORELLIA],
    ]);
    expect(vm.moveSourceFrom(view, CS_YAVIN)?.pieces.map((p) => p.pieceId)).toEqual([
      U_XWING,
      U_RT_BASE,
    ]);
    expect(vm.moveSourceFrom(view, CS_CORUSCANT)).toBeUndefined();
    expect(vm.movableInDetail(view, U_RT_SULLUST)).toEqual({
      fromSystemId: CS_SULLUST,
      toSystemId: CS_CORELLIA,
      candidate: { pieceId: U_RT_SULLUST, transportCapacity: 0, requiresTransport: true },
    });
    expect(vm.movableInDetail(view, U_SHIELD)).toBeNull();
    expect(vm.isMovable(view, U_XWING)).toBe(true);
    expect(vm.isMovable(view, U_SD)).toBe(false);
    expect(vm.canFinish(view)).toBe(true);
    expect(vm.canPass(view)).toBe(false);
    expect(vm.activatableLeaders(view)).toEqual([]);
  });

  it('no MOVE_PIECES outside an activation', () => {
    expect(vm.moveSources(makeCoreView())).toEqual([]);
    expect(vm.movableInDetail(makeCoreView(), U_TRANSPORT)).toBeNull();
    expect(vm.canFinish(makeCoreView())).toBe(false);
  });

  it('capacityPreview sums the server numbers of the selected candidates only (Q-FE-2)', () => {
    const sullust = vm.moveSourceFrom(makeCoreActivationView(), CS_SULLUST)!;
    expect(vm.capacityPreview(sullust, [])).toEqual({ capacity: 0, required: 0, fits: true });
    expect(vm.capacityPreview(sullust, [U_RT_SULLUST])).toEqual({
      capacity: 0,
      required: 1,
      fits: false,
    });
    expect(vm.capacityPreview(sullust, [U_RT_SULLUST, U_TRANSPORT, 'not-a-candidate'])).toEqual({
      capacity: 4,
      required: 1,
      fits: true,
    });
  });

  it('empty legalActions (not the viewer turn) → waiting, nothing enabled', () => {
    const view = makeCoreView({ activeSide: 'empire', legalActions: [] });
    expect(vm.isMyTurn(view)).toBe(false);
    expect(vm.canPass(view)).toBe(false);
    expect(vm.canFinish(view)).toBe(false);
    expect(vm.turnState(view)).toBe('waiting');
  });
});

describe('viewModel — turn, phase, outcome (AC-07)', () => {
  it('turnState: idle / activation / over', () => {
    expect(vm.turnState(makeCoreView())).toBe('idle');
    expect(vm.turnState(makeCoreActivationView())).toBe('activation');
    expect(vm.turnState(makeCoreOutcomeView())).toBe('over');
  });

  it('outcome: game over with winner and reason, no legal actions', () => {
    const over = makeCoreOutcomeView('empire');
    expect(vm.isGameOver(over)).toBe(true);
    expect(vm.outcomeOf(over)).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
    expect(vm.isMyTurn(over)).toBe(false);
    expect(vm.isGameOver(makeCoreView())).toBe(false);
    expect(vm.outcomeOf(makeCoreView())).toBeNull();
  });

  it('passed sides and markers come from the view (R-6, R-1)', () => {
    const view = makeCoreEmpireView();
    expect(vm.hasPassed(view, 'rebels')).toBe(true);
    expect(vm.hasPassed(view, 'empire')).toBe(false);
    expect(vm.markers(view)).toEqual({ time: 1, reputation: 14 });
    expect(vm.opponentOf('rebels')).toBe('empire');
    expect(vm.opponentOf('empire')).toBe('rebels');
  });
});

describe('viewModel — activation', () => {
  it('activation on the map: side, leader, system; own activation; stable key', () => {
    const view = makeCoreActivationView();
    expect(vm.activationOf(view)).toEqual({
      side: 'rebels',
      leaderId: L_LEIA,
      systemId: CS_CORELLIA,
    });
    expect(vm.activatedSystemId(view)).toBe(CS_CORELLIA);
    expect(vm.isOwnActivation(view)).toBe(true);
    expect(vm.activationKey(view)).toBe(`rebels:${L_LEIA}:${CS_CORELLIA}`);
  });

  it('no activation', () => {
    const view = makeCoreView();
    expect(vm.activationOf(view)).toBeNull();
    expect(vm.activatedSystemId(view)).toBeNull();
    expect(vm.isOwnActivation(view)).toBe(false);
    expect(vm.activationKey(view)).toBeNull();
  });

  it("the opponent's activation in the hidden zone: system null, not own", () => {
    const view = makeCoreEmpireView({
      activeSide: 'rebels',
      activation: { side: 'rebels', leaderId: L_RIEEKAN, location: { kind: 'rebelBase' } },
      legalActions: [],
    });
    expect(vm.activationOf(view)).toEqual({ side: 'rebels', leaderId: L_RIEEKAN, systemId: null });
    expect(vm.activatedSystemId(view)).toBeNull();
    expect(vm.isOwnActivation(view)).toBe(false);
    expect(vm.activationKey(view)).toBe(`rebels:${L_RIEEKAN}:#rebelBase`);
    expect(vm.hiddenZone(view)?.activated).toBe(true);
  });

  it('shownAt maps a view location to a system id or null', () => {
    expect(vm.shownAt({ kind: 'system', systemId: CS_HOTH })).toBe(CS_HOTH);
    expect(vm.shownAt({ kind: 'rebelBase' })).toBeNull();
  });
});

describe('viewModel — leaders, units, map', () => {
  it('pools of both sides are public; leaders on the map; leaders at a system', () => {
    const view = makeCoreActivationView();
    expect(vm.poolOf(view, 'rebels').map((l) => l.id)).toEqual([L_MOTHMA, L_DODONNA, L_RIEEKAN]);
    expect(vm.poolOf(view, 'empire')).toHaveLength(4);
    expect(vm.leadersOnMap(view).map((l) => l.id)).toEqual([L_LEIA]);
    expect(vm.leadersAt(view, CS_CORELLIA).map((l) => l.id)).toEqual([L_LEIA]);
    expect(vm.leadersAt(view, CS_SULLUST)).toEqual([]);
    expect(vm.leaderById(view, L_MOTHMA)?.canActivate).toBe(false);
    expect(vm.leaderById(view, 'nobody')).toBeUndefined();
  });

  it('leaderLocationLabel: pool / rebelBase / system id (leader-item data-location)', () => {
    const view = makeCoreActivationView();
    expect(vm.leaderLocationLabel(vm.leaderById(view, L_LEIA)!)).toBe(CS_CORELLIA);
    expect(vm.leaderLocationLabel(vm.leaderById(view, L_DODONNA)!)).toBe('pool');
    expect(
      vm.leaderLocationLabel({
        id: L_RIEEKAN,
        owner: 'rebels',
        canActivate: true,
        location: { kind: 'rebelBase' },
      }),
    ).toBe('rebelBase');
  });

  it('units at a system, by id, and their static type', () => {
    const view = makeCoreView();
    expect(vm.unitsAt(view, CS_YAVIN).map((u) => u.id)).toEqual([U_XWING, U_RT_BASE, U_SHIELD]);
    expect(vm.unitsAt(view, CS_HOTH)).toEqual([]);
    expect(vm.unitById(view, U_SD)?.owner).toBe('empire');
    expect(vm.unitById(view, 'none')).toBeUndefined();
    expect(vm.unitTypeOf(view, 'unit.rebels.shield-generator')?.mobility).toBe('immobile');
    expect(vm.unitTypeOf(view, 'unit.rebels.none')).toBeUndefined();
  });

  it('systems by id and grouped by region in region order', () => {
    const view = makeCoreView();
    expect(vm.systemById(view, CS_ALDERAAN)?.regionId).toBe('r1');
    expect(vm.systemById(view, 'none')).toBeUndefined();
    expect(
      vm.systemsByRegion(view).map((g) => [g.regionId, g.nameKey, g.systems.map((s) => s.id)]),
    ).toEqual([
      ['r1', 'regions.r1', [CS_CORUSCANT, CS_CORELLIA, CS_ALDERAAN]],
      ['r2', 'regions.r2', [CS_SULLUST, CS_YAVIN, CS_HOTH]],
    ]);
  });

  it('contested systems are read from the server field, never derived from units (D-1)', () => {
    // Coruscant holds only Imperial units, Yavin only Rebel ones: the server says what is contested.
    const view = makeCoreView({ contestedSystemIds: [CS_HOTH] });
    expect(vm.contestedSystemIds(view)).toEqual([CS_HOTH]);
    expect(vm.isContested(view, CS_HOTH)).toBe(true);
    expect(vm.isContested(view, CS_CORUSCANT)).toBe(false);
    expect(vm.contestedSystemIds(makeCoreView())).toEqual([]);
  });

  it('remote systems come from map.systems[].remote', () => {
    const view = makeCoreView();
    expect(vm.remoteSystemIds(view)).toEqual([CS_YAVIN, CS_HOTH]);
    expect(vm.isRemote(view, CS_HOTH)).toBe(true);
    expect(vm.isRemote(view, CS_CORUSCANT)).toBe(false);
    expect(vm.isRemote(view, 'none')).toBe(false);
  });
});

describe('viewModel — rebel base and the hidden zone (AC-10)', () => {
  it('Rebels: the base system is visible, no hidden zone', () => {
    const view = makeCoreView();
    expect(vm.visibleRebelBaseSystemId(view)).toBe(CS_YAVIN);
    expect(vm.hiddenZone(view)).toBeNull();
  });

  it('Empire before the reveal: zone = exactly what the server placed at rebelBase', () => {
    const view = makeCoreEmpireView({
      leaders: makeCoreEmpireView().leaders.map((l) =>
        l.id === L_RIEEKAN ? { ...l, location: { kind: 'rebelBase' as const } } : l,
      ),
    });
    expect(vm.visibleRebelBaseSystemId(view)).toBeNull();
    expect(vm.hiddenZone(view)).toEqual({
      unitIds: [U_XWING, U_RT_BASE, U_SHIELD],
      leaderIds: [L_RIEEKAN],
      activated: false,
    });
    // Nothing in the zone is reported as being on the map.
    expect(vm.unitsAt(view, CS_YAVIN)).toEqual([]);
    expect(vm.leadersOnMap(view)).toEqual([]);
  });

  it('an empty zone is still a zone while the base is hidden', () => {
    const base: PlayerViewCore = makeCoreEmpireView();
    const view = makeCoreEmpireView({
      units: base.units.filter((u) => u.location.kind === 'system'),
    });
    expect(vm.hiddenZone(view)).toEqual({ unitIds: [], leaderIds: [], activated: false });
  });

  it('after the end of the game the base is visible to the Empire (Q-14): no zone', () => {
    const view = makeCoreOutcomeView('rebels', 'timeReachedReputation', { viewer: 'empire' });
    expect(vm.visibleRebelBaseSystemId(view)).toBe(CS_YAVIN);
    expect(vm.hiddenZone(view)).toBeNull();
  });
});
