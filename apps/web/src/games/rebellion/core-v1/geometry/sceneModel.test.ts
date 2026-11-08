/**
 * SWR-005 Worker M — scene model (plan-frontend §4, §12; AC-10, AC-12). Highlights only from `legalActions` /
 * explicit view fields; the hidden zone only when the server hides the base.
 */
import { coreMapLayout } from '@bga/game-rebellion/board';
import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '../../board/model/selectionStore';
import {
  CS_ALDERAAN,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  L_LEIA,
  L_MOTHMA,
  L_VADER,
  U_RT_BASE,
  U_SD,
  U_SHIELD,
  U_TRANSPORT,
  U_XWING,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
} from '../../test/coreFixtures';
import { LOD_THRESHOLD } from './constants';
import { labelScreenFactor, lodFor, screenFixedScale } from './lod';
import { buildScene, leaderSlots } from './sceneModel';

const base = { armedLeaderId: null, selection: NO_SELECTION, lod: 'detail' as const };

describe('lod', () => {
  it('switches to compact below 65 %', () => {
    expect(lodFor(LOD_THRESHOLD)).toBe('detail');
    expect(lodFor(LOD_THRESHOLD - 0.001)).toBe('compact');
    expect(lodFor(2)).toBe('detail');
  });

  it('screen-constant text: factor 1 up to 100 %, then grows up to 1.6×', () => {
    expect(labelScreenFactor(0.3)).toBe(1);
    expect(screenFixedScale(0.5)).toBe(2);
    expect(labelScreenFactor(2.5)).toBe(1.6);
    expect(screenFixedScale(2)).toBeCloseTo(0.8);
  });
});

describe('buildScene', () => {
  it('places systems at the core layout and links each adjacency once', () => {
    const view = makeCoreView();
    const scene = buildScene({ ...base, view });
    expect(scene.systems.map((s) => s.id)).toEqual(view.map.systems.map((s) => s.id));
    expect(scene.centers.get(CS_CORUSCANT)).toEqual(coreMapLayout[CS_CORUSCANT]);
    const pairs = scene.links.map((l) => [l.a, l.b].join('|')).sort();
    expect(pairs).toEqual(
      [
        `${CS_ALDERAAN}|${CS_CORUSCANT}`,
        `${CS_CORELLIA}|${CS_CORUSCANT}`,
        `${CS_CORELLIA}|${CS_SULLUST}`,
        `${CS_CORELLIA}|${CS_YAVIN}`,
        `${CS_HOTH}|${CS_SULLUST}`,
      ].sort(),
    );
    expect(scene.regions.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('remote markers come from map.systems[].remote, contested from contestedSystemIds', () => {
    const view = makeCoreView({ contestedSystemIds: [CS_CORELLIA] });
    const scene = buildScene({ ...base, view });
    const by = new Map(scene.systems.map((s) => [s.id, s]));
    expect(by.get(CS_YAVIN)!.remote).toBe(true);
    expect(by.get(CS_HOTH)!.remote).toBe(true);
    expect(by.get(CS_CORUSCANT)!.remote).toBe(false);
    expect(scene.systems.filter((s) => s.contested).map((s) => s.id)).toEqual([CS_CORELLIA]);
  });

  it('activation targets are exactly ACTIVATE_SYSTEM.systemIds of the armed leader', () => {
    const view = makeCoreView({
      legalActions: [
        { type: 'ACTIVATE_SYSTEM', leaderIds: [L_LEIA], systemIds: [CS_SULLUST, CS_HOTH] },
        { type: 'PASS' },
      ],
    });
    expect(buildScene({ ...base, view }).targetIds).toEqual([]);
    const armed = buildScene({ ...base, view, armedLeaderId: L_LEIA });
    expect(armed.targetIds).toEqual([CS_SULLUST, CS_HOTH]);
    expect(armed.systems.filter((s) => s.target).map((s) => s.id)).toEqual([CS_SULLUST, CS_HOTH]);
    // a leader the server does not list (Mon Mothma, canActivate false) highlights nothing
    expect(buildScene({ ...base, view, armedLeaderId: L_MOTHMA }).targetIds).toEqual([]);
  });

  it('activation: activated system, move sources and lines from MOVE_PIECES, movable units', () => {
    const view = makeCoreActivationView();
    const scene = buildScene({ ...base, view });
    expect(scene.activatedSystemId).toBe(CS_CORELLIA);
    const by = new Map(scene.systems.map((s) => [s.id, s]));
    expect(by.get(CS_CORELLIA)!.activatedBy).toBe('rebels');
    expect(scene.systems.filter((s) => s.source).map((s) => s.id)).toEqual([CS_SULLUST, CS_YAVIN]);
    expect(scene.moveLines.map((m) => [m.fromSystemId, m.toSystemId])).toEqual([
      [CS_SULLUST, CS_CORELLIA],
      [CS_YAVIN, CS_CORELLIA],
    ]);
    const units = new Map(scene.units.map((u) => [u.id, u]));
    expect(units.get(U_TRANSPORT)!.movable).toBe(true);
    expect(units.get(U_XWING)!.movable).toBe(true);
    expect(units.get(U_SHIELD)!.movable).toBe(false); // immobile — not a candidate
    expect(units.get(U_SHIELD)!.immobile).toBe(true);
    expect(units.get(U_SD)!.movable).toBe(false); // enemy
    expect(units.get(U_SD)!.arena).toBe('space');
    // the activating leader is on the map, flagged
    expect(scene.leaders.find((l) => l.id === L_LEIA)).toMatchObject({
      systemId: CS_CORELLIA,
      activating: true,
    });
  });

  it('drop target = activated system under a dragged unit only', () => {
    const view = makeCoreActivationView();
    const over = (id: string | null) =>
      buildScene({ ...base, view, drag: { pieceId: U_XWING, overSystemId: id } }).systems.filter(
        (s) => s.dropTarget,
      );
    expect(over(CS_CORELLIA).map((s) => s.id)).toEqual([CS_CORELLIA]);
    expect(over(CS_SULLUST)).toEqual([]);
    expect(over(null)).toEqual([]);
  });

  it('rebel base marker only where the server shows the base (Q-37)', () => {
    expect(
      buildScene({ ...base, view: makeCoreView() })
        .systems.filter((s) => s.isBase)
        .map((s) => s.id),
    ).toEqual([CS_YAVIN]);
    expect(buildScene({ ...base, view: makeCoreEmpireView() }).systems.some((s) => s.isBase)).toBe(
      false,
    );
    expect(
      buildScene({ ...base, view: makeCoreOutcomeView('empire') })
        .systems.filter((s) => s.isBase)
        .map((s) => s.id),
    ).toEqual([CS_YAVIN]);
  });

  it('hidden zone only for a hidden base; its content is what the server put there (AC-10)', () => {
    expect(buildScene({ ...base, view: makeCoreView() }).zone).toBeNull();
    const view = makeCoreEmpireView();
    const scene = buildScene({ ...base, view });
    expect(scene.zone).not.toBeNull();
    expect(scene.zone!.units.map((u) => u.id).sort()).toEqual(
      [U_RT_BASE, U_SHIELD, U_XWING].sort(),
    );
    expect(scene.zone!.units.every((u) => u.systemId === null && !u.movable)).toBe(true);
    // nothing of the zone is drawn at a system, and no system is marked as the base
    expect(scene.units.some((u) => [U_RT_BASE, U_SHIELD, U_XWING].includes(u.id))).toBe(false);
    expect(scene.systems.some((s) => s.isBase)).toBe(false);
    // an empty zone is still drawn while the base is hidden
    const empty = buildScene({
      ...base,
      view: makeCoreEmpireView({ units: view.units.filter((u) => u.location.kind === 'system') }),
    });
    expect(empty.zone).not.toBeNull();
    expect(empty.zone!.units).toEqual([]);
    expect(buildScene({ ...base, view, selection: { kind: 'zone' } }).zone!.selected).toBe(true);
  });

  it('a rebel activation in the hidden zone marks the zone, not a system', () => {
    const view = makeCoreEmpireView({
      leaders: makeCoreEmpireView().leaders.map((l) =>
        l.id === L_LEIA ? { ...l, location: { kind: 'rebelBase' } } : l,
      ),
      activation: { side: 'rebels', leaderId: L_LEIA, location: { kind: 'rebelBase' } },
      legalActions: [],
    });
    const scene = buildScene({ ...base, view });
    expect(scene.activatedSystemId).toBeNull();
    expect(scene.systems.some((s) => s.activatedBy)).toBe(false);
    expect(scene.zone!.activated).toBe(true);
    expect(scene.zone!.leaders.map((l) => l.id)).toEqual([L_LEIA]);
  });

  it('compact LOD: per-side chips with unit and leader counts instead of glyphs', () => {
    const view = makeCoreView({
      leaders: makeCoreView().leaders.map((l) =>
        l.id === L_VADER ? { ...l, location: { kind: 'system', systemId: CS_CORUSCANT } } : l,
      ),
    });
    const scene = buildScene({ ...base, view, lod: 'compact' });
    expect(scene.units).toEqual([]);
    expect(scene.leaders).toEqual([]);
    const coruscant = scene.chips.filter((c) => c.systemId === CS_CORUSCANT);
    expect(coruscant).toEqual([
      {
        systemId: CS_CORUSCANT,
        owner: 'empire',
        units: 4,
        leaders: 1,
        anchor: coreMapLayout[CS_CORUSCANT],
      },
    ]);
    const yavin = scene.chips.filter((c) => c.systemId === CS_YAVIN);
    expect(yavin.map((c) => [c.owner, c.units, c.leaders])).toEqual([['rebels', 3, 0]]);
    // detail LOD: glyphs and leader badges, no chips
    const detail = buildScene({ ...base, view });
    expect(detail.chips).toEqual([]);
    expect(detail.units.length).toBe(view.units.length);
    expect(detail.leaders.map((l) => l.id)).toEqual([L_VADER]);
  });

  it('selection flags systems, units, leaders', () => {
    const view = makeCoreActivationView();
    expect(
      buildScene({ ...base, view, selection: { kind: 'system', systemId: CS_HOTH } }).systems.find(
        (s) => s.selected,
      )?.id,
    ).toBe(CS_HOTH);
    expect(
      buildScene({ ...base, view, selection: { kind: 'piece', pieceId: U_XWING } }).units.find(
        (u) => u.selected,
      )?.id,
    ).toBe(U_XWING);
    expect(
      buildScene({ ...base, view, selection: { kind: 'leader', leaderId: L_LEIA } }).leaders.find(
        (l) => l.selected,
      )?.id,
    ).toBe(L_LEIA);
  });

  it('outcome view: no highlights (no legal actions)', () => {
    const scene = buildScene({ ...base, view: makeCoreOutcomeView(), armedLeaderId: L_LEIA });
    expect(scene.targetIds).toEqual([]);
    expect(scene.sourceIds).toEqual([]);
    expect(scene.units.every((u) => !u.movable)).toBe(true);
  });
});

describe('leaderSlots', () => {
  it('puts the Empire left of the top and the Rebels right, all above the centre', () => {
    const c = { x: 500, y: 500 };
    const slots = leaderSlots(c, [
      { id: 'r1', owner: 'rebels' },
      { id: 'e1', owner: 'empire' },
      { id: 'e2', owner: 'empire' },
    ]);
    expect(slots.get('e1')!.x).toBeLessThan(c.x);
    expect(slots.get('e2')!.x).toBeLessThan(slots.get('e1')!.x);
    expect(slots.get('r1')!.x).toBeGreaterThan(c.x);
    for (const p of slots.values()) expect(p.y).toBeLessThan(c.y);
  });
});
