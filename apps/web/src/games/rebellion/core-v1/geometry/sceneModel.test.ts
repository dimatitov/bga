/**
 * SWR-005 Worker M — scene model (plan-frontend §4, §12; AC-10, AC-12). Highlights only from `legalActions` /
 * explicit view fields; the hidden zone only when the server hides the base.
 * SWR-009 M (AC-4, AC-6, AC-8, AC-11; TC-MAP-01, TC-MK-01…03): the real map geometry, group counters = the `COUNT`
 * oracle, compact per-side markers, zone markers without system ids, move handles only for `MOVE_PIECES`, AI marks.
 */
import { coreMapLayout, coreRegionShapes } from '@bga/game-rebellion/board';
import { CORE_REGION_IDS, CORE_SYSTEM_IDS, type PlayerViewCore } from '@bga/game-rebellion/schema';
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
  L_DODONNA,
  L_VADER,
  U_RT_BASE,
  U_RT_SULLUST,
  U_SD,
  U_SHIELD,
  U_TRANSPORT,
  U_XWING,
  aiRunEventsRedacted,
  empireRedactedView,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
  withLastRun,
} from '../../test/coreFixtures';
import { aiRecentMarks } from '../model/aiRecent';
import { arenaOf } from '../model/forces';
import { LOD_THRESHOLD } from './constants';
import { labelScreenFactor, lodFor, screenFixedScale } from './lod';
import { compactParts } from './markerLayout';
import { type Scene, buildMapStatics, buildScene, handleSlots, leaderSlots } from './sceneModel';

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
    // move handles: exactly the MOVE_PIECES candidates (no immobile shield, no enemy), at their source
    const handles = new Map(scene.handles.map((u) => [u.id, u]));
    expect([...handles.keys()].sort()).toEqual(
      [U_TRANSPORT, U_RT_SULLUST, U_XWING, U_RT_BASE].sort(),
    );
    expect(handles.get(U_TRANSPORT)).toMatchObject({ systemId: CS_SULLUST, arena: 'space' });
    expect(handles.get(U_RT_BASE)).toMatchObject({ systemId: CS_YAVIN, arena: 'ground' });
    expect(handles.has(U_SHIELD)).toBe(false);
    expect(handles.has(U_SD)).toBe(false);
    for (const h of scene.handles) expect(h.pos.y).toBeLessThan(coreMapLayout[h.systemId]!.y);
    // the group counters still show the full composition (handles are extra)
    const yavin = scene.markers.filter((m) => m.systemId === CS_YAVIN);
    expect(yavin.map((m) => [m.owner, m.arena, m.count])).toEqual([
      ['rebels', 'space', 1],
      ['rebels', 'ground', 2],
    ]);
    // compact LOD: no handles
    expect(buildScene({ ...base, view, lod: 'compact' }).handles).toEqual([]);
    // no own activation → no handles
    expect(buildScene({ ...base, view: makeCoreView() }).handles).toEqual([]);
    // the activating leader is on the map, flagged
    expect(scene.leaders.find((l) => l.id === L_LEIA)).toMatchObject({
      systemId: CS_CORELLIA,
      activating: true,
    });
  });

  it('drop target = activated system under a dragged unit only; illegal drop state elsewhere', () => {
    const view = makeCoreActivationView();
    const over = (id: string | null, overState: 'legal' | 'illegal' | 'none' = 'legal') =>
      buildScene({ ...base, view, drag: { pieceId: U_XWING, overSystemId: id, overState } })
        .systems;
    expect(
      over(CS_CORELLIA)
        .filter((s) => s.dropTarget)
        .map((s) => s.id),
    ).toEqual([CS_CORELLIA]);
    expect(over(CS_SULLUST).filter((s) => s.dropTarget)).toEqual([]);
    expect(over(null).filter((s) => s.dropTarget || s.dropIllegal)).toEqual([]);
    expect(
      over(CS_HOTH, 'illegal')
        .filter((s) => s.dropIllegal)
        .map((s) => s.id),
    ).toEqual([CS_HOTH]);
    expect(over(CS_CORELLIA, 'legal').some((s) => s.dropIllegal)).toBe(false);
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
    expect(scene.zone!.unitIds.sort()).toEqual([U_RT_BASE, U_SHIELD, U_XWING].sort());
    // zone markers: Rebels per arena, no system id
    expect(scene.zone!.markers.map((m) => [m.systemId, m.owner, m.arena, m.count])).toEqual([
      [null, 'rebels', 'space', 1],
      [null, 'rebels', 'ground', 2],
    ]);
    // nothing of the zone is counted at a system, and no system is marked as the base
    const counted = scene.markers.flatMap((m) => m.unitIds);
    expect(counted.some((id) => [U_RT_BASE, U_SHIELD, U_XWING].includes(id))).toBe(false);
    expect(scene.markers.some((m) => m.systemId === CS_YAVIN)).toBe(false);
    expect(scene.systems.some((s) => s.isBase)).toBe(false);
    // an empty zone is still drawn while the base is hidden
    const empty = buildScene({
      ...base,
      view: makeCoreEmpireView({ units: view.units.filter((u) => u.location.kind === 'system') }),
    });
    expect(empty.zone).not.toBeNull();
    expect(empty.zone!.markers).toEqual([]);
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

  it('compact LOD: one marker per side with unit and leader counts (A-8)', () => {
    const view = makeCoreView({
      leaders: makeCoreView().leaders.map((l) =>
        l.id === L_VADER ? { ...l, location: { kind: 'system', systemId: CS_CORUSCANT } } : l,
      ),
    });
    const scene = buildScene({ ...base, view, lod: 'compact' });
    expect(scene.handles).toEqual([]);
    expect(scene.leaders).toEqual([]);
    const coruscant = scene.markers.filter((m) => m.systemId === CS_CORUSCANT);
    expect(coruscant).toHaveLength(1);
    expect(coruscant[0]).toMatchObject({
      owner: 'empire',
      arena: 'all',
      count: 4,
      leaders: 1,
      leaderIds: [L_VADER],
      anchor: coreMapLayout[CS_CORUSCANT],
    });
    expect(coruscant[0]!.box.dx).toBeLessThan(0); // Empire on the left
    // fix round 1: the plate carries the arena split «▲2 ■2 ◆1», not one ambiguous glyph
    expect(coruscant[0]).toMatchObject({ space: 2, ground: 2 });
    expect(compactParts(coruscant[0]!)).toEqual([
      { kind: 'space', n: 2 },
      { kind: 'ground', n: 2 },
      { kind: 'leader', n: 1 },
    ]);
    const yavin = scene.markers.filter((m) => m.systemId === CS_YAVIN);
    expect(yavin.map((m) => [m.owner, m.count, m.leaders])).toEqual([['rebels', 3, 0]]);
    expect(yavin[0]!.box.dx).toBeGreaterThan(0); // Rebels on the right
    // detail LOD: side × arena markers and leader diamonds
    const detail = buildScene({ ...base, view });
    expect(detail.markers.filter((m) => m.systemId === CS_CORUSCANT).map((m) => m.arena)).toEqual([
      'space',
      'ground',
    ]);
    expect(detail.leaders.map((l) => l.id)).toEqual([L_VADER]);
  });

  it('selection flags systems, the marker of a selected unit, leaders, the manifest group', () => {
    const view = makeCoreActivationView();
    expect(
      buildScene({ ...base, view, selection: { kind: 'system', systemId: CS_HOTH } }).systems.find(
        (s) => s.selected,
      )?.id,
    ).toBe(CS_HOTH);
    const piece = buildScene({ ...base, view, selection: { kind: 'piece', pieceId: U_XWING } });
    expect(piece.markers.filter((m) => m.selected).map((m) => m.key)).toEqual([
      `${CS_YAVIN}-rebels-space`,
    ]);
    expect(piece.handles.find((u) => u.selected)?.id).toBe(U_XWING);
    expect(
      buildScene({ ...base, view, selection: { kind: 'leader', leaderId: L_LEIA } }).leaders.find(
        (l) => l.selected,
      )?.id,
    ).toBe(L_LEIA);
    const manifest = buildScene({
      ...base,
      view,
      manifest: {
        target: { kind: 'system', systemId: CS_CORUSCANT },
        group: { owner: 'empire', arena: 'ground' },
      },
    });
    expect(manifest.markers.filter((m) => m.selected).map((m) => m.key)).toEqual([
      `${CS_CORUSCANT}-empire-ground`,
    ]);
  });

  it('outcome view: no highlights (no legal actions)', () => {
    const scene = buildScene({ ...base, view: makeCoreOutcomeView(), armedLeaderId: L_LEIA });
    expect(scene.targetIds).toEqual([]);
    expect(scene.sourceIds).toEqual([]);
    expect(scene.handles).toEqual([]);
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

describe('real map geometry (SWR-009 TC-MAP-01, AC-4)', () => {
  /** A view with the 32 base-game systems and 8 regions (ids from `./schema`; adjacency is server data, not here). */
  function realMapView(): PlayerViewCore {
    const regionOf = (id: string) =>
      CORE_REGION_IDS.find((r) => {
        const poly = coreRegionShapes[r]!.polygon;
        const p = coreMapLayout[id]!;
        // ray casting: is the centre inside the region polygon?
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[i]!;
          const b = poly[j]!;
          if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
            inside = !inside;
        }
        return inside;
      }) ?? CORE_REGION_IDS[0]!;
    return makeCoreView({
      map: {
        regions: CORE_REGION_IDS.map((id) => ({ id, nameKey: `regions.${id}` })),
        systems: CORE_SYSTEM_IDS.map((id) => ({
          id,
          nameKey: `systems.${id}`,
          regionId: regionOf(id),
          adjacentSystemIds: [],
          remote: false,
        })),
      },
    });
  }

  it('32 nodes at the unchanged coreMapLayout centres, 8 region outlines from coreRegionShapes', () => {
    const view = realMapView();
    const statics = buildMapStatics(view.map);
    expect(statics.centers.size).toBe(32);
    for (const id of CORE_SYSTEM_IDS) expect(statics.centers.get(id)).toEqual(coreMapLayout[id]);
    expect(statics.regions).toHaveLength(8);
    for (const r of statics.regions) expect(r.polygon).toBe(coreRegionShapes[r.id]!.polygon);
    // every system lies in exactly one of the 8 drawn regions (8 distinct data-region values)
    expect(new Set(view.map.systems.map((s) => s.regionId)).size).toBe(8);
    expect(buildScene({ ...base, view }).systems).toHaveLength(32);
  });

  it('routes: each undirected adjacency once (69 on the real map is checked through the API/e2e)', () => {
    const view = makeCoreView();
    const pairs = new Set(
      view.map.systems.flatMap((s) => s.adjacentSystemIds.map((n) => [s.id, n].sort().join('|'))),
    );
    expect(buildMapStatics(view.map).links).toHaveLength(pairs.size);
  });
});

describe('group counter markers (SWR-009 AC-6, TC-MK-01…03)', () => {
  /** Oracle: COUNT(x, side, arena) straight from `view.units` (location.kind === 'system'). */
  function count(view: PlayerViewCore, x: string, side: string, arena: string): number {
    return view.units.filter(
      (u) =>
        u.owner === side &&
        u.location.kind === 'system' &&
        u.location.systemId === x &&
        arenaOf(view, u.typeKey) === arena,
    ).length;
  }

  function detailMarkers(scene: Scene) {
    return scene.markers.map((m) => [m.systemId, m.owner, m.arena, m.count] as const);
  }

  it('one marker per non-empty side × arena with the COUNT oracle; fleet and ground are separate', () => {
    const view = makeCoreView();
    const scene = buildScene({ ...base, view });
    for (const [x, side, arena, n] of detailMarkers(scene)) {
      expect(n, `${x} ${side} ${arena}`).toBe(count(view, x!, side, arena));
      expect(n).toBeGreaterThan(0);
    }
    expect(detailMarkers(scene).filter(([x]) => x === CS_CORUSCANT)).toEqual([
      [CS_CORUSCANT, 'empire', 'space', 2],
      [CS_CORUSCANT, 'empire', 'ground', 2],
    ]);
    // the sum over all markers = units on the map
    const total = scene.markers.reduce((n, m) => n + m.count, 0);
    expect(total).toBe(view.units.filter((u) => u.location.kind === 'system').length);
    // geometry: Empire left / Rebels right, fleet on the upper row, ground on the lower row
    for (const m of scene.markers) {
      expect(m.box.dx < 0).toBe(m.owner === 'empire');
      expect(m.box.dy < 0).toBe(m.arena === 'space');
    }
  });

  it('both sides in one system: 3 markers (A fleet 2 + ground 3, B fleet 1)', () => {
    const v = makeCoreView();
    const at = { kind: 'system' as const, systemId: CS_SULLUST };
    const units = [
      ...v.units.filter((u) => u.location.kind !== 'system' || u.location.systemId !== CS_SULLUST),
      { id: 'a1', owner: 'empire' as const, typeKey: 'unit.empire.star-destroyer', location: at },
      { id: 'a2', owner: 'empire' as const, typeKey: 'unit.empire.tie-fighter', location: at },
      { id: 'a3', owner: 'empire' as const, typeKey: 'unit.empire.stormtrooper', location: at },
      { id: 'a4', owner: 'empire' as const, typeKey: 'unit.empire.stormtrooper', location: at },
      { id: 'a5', owner: 'empire' as const, typeKey: 'unit.empire.stormtrooper', location: at },
      { id: 'b1', owner: 'rebels' as const, typeKey: 'unit.rebels.x-wing', location: at },
    ];
    const scene = buildScene({ ...base, view: makeCoreView({ units }) });
    expect(detailMarkers(scene).filter(([x]) => x === CS_SULLUST)).toEqual([
      [CS_SULLUST, 'empire', 'space', 2],
      [CS_SULLUST, 'empire', 'ground', 3],
      [CS_SULLUST, 'rebels', 'space', 1],
    ]);
  });

  it('empty system — no markers; only a leader — only the diamond; 10+ figures widen the plate', () => {
    const v = makeCoreView();
    const leaders = v.leaders.map((l) =>
      l.id === L_VADER ? { ...l, location: { kind: 'system' as const, systemId: CS_HOTH } } : l,
    );
    const scene = buildScene({ ...base, view: makeCoreView({ leaders }) });
    expect(scene.markers.some((m) => m.systemId === CS_ALDERAAN)).toBe(false);
    expect(scene.markers.some((m) => m.systemId === CS_HOTH)).toBe(false);
    expect(scene.leaders.map((l) => [l.id, l.systemId])).toEqual([[L_VADER, CS_HOTH]]);
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `st-${i}`,
      owner: 'empire' as const,
      typeKey: 'unit.empire.stormtrooper',
      location: { kind: 'system' as const, systemId: CS_ALDERAAN },
    }));
    const big = buildScene({ ...base, view: makeCoreView({ units: [...v.units, ...many] }) });
    const m = big.markers.find((x) => x.systemId === CS_ALDERAAN)!;
    expect(m.count).toBe(12);
    expect(m.box.width).toBeGreaterThanOrEqual(34);
  });

  it('hidden information (§3.5 a): base units never reach a system marker', () => {
    const view = empireRedactedView();
    const without = {
      ...view,
      units: view.units.filter((u) => u.location.kind !== 'rebelBase'),
      leaders: view.leaders.filter((l) => l.location.kind !== 'rebelBase'),
    };
    const a = buildScene({ ...base, view }).markers;
    const b = buildScene({ ...base, view: without }).markers;
    expect(a).toEqual(b);
    const zone = buildScene({ ...base, view }).zone!;
    expect(JSON.stringify(zone.markers)).not.toMatch(/systemId":"/);
    for (const id of CORE_SYSTEM_IDS) expect(JSON.stringify(zone)).not.toContain(`"${id}"`);
    expect(zone.leaders.map((l) => l.id)).toEqual([L_DODONNA]);
  });
});

describe('AI recent marks (SWR-009 AC-11, QD-3)', () => {
  it('systems of the redacted AI events in first-appearance order; the zone for a null system', () => {
    const view = empireRedactedView();
    const aiRecent = aiRecentMarks(withLastRun(aiRunEventsRedacted()), view);
    const scene = buildScene({ ...base, view, aiRecent });
    expect(scene.aiRecentIds).toEqual([CS_SULLUST, CS_HOTH]);
    const by = new Map(scene.systems.map((s) => [s.id, s.aiRecent]));
    expect(by.get(CS_SULLUST)).toBe(1);
    expect(by.get(CS_HOTH)).toBe(2);
    expect(by.get(CS_YAVIN)).toBeNull(); // the base system is never marked
    expect(scene.zone!.aiRecent).toBe(true);
  });

  it('no last run — no marks', () => {
    const scene = buildScene({ ...base, view: makeCoreView(), aiRecent: null });
    expect(scene.aiRecentIds).toEqual([]);
    expect(scene.systems.every((s) => s.aiRecent === null)).toBe(true);
  });
});

describe('handleSlots', () => {
  it('fans out above the source system, inside the leader arc', () => {
    const c = { x: 500, y: 500 };
    const slots = handleSlots(c, ['a', 'b', 'c']);
    expect(slots.size).toBe(3);
    for (const p of slots.values()) {
      expect(p.y).toBeLessThan(c.y);
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThan(92);
    }
  });
});
