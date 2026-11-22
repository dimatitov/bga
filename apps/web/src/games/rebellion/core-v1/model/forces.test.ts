import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import {
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_YAVIN,
  CORE_SYSTEM_IDS_FIXTURE,
  empireRedactedView,
  L_DODONNA,
  L_LEIA,
  makeCoreActivationView,
  makeCoreView,
  U_RT_BASE,
  U_SD,
  U_SHIELD,
  U_ST1,
  U_ST2,
  U_TIE,
  U_XWING,
  withUnits,
} from '../../test/coreFixtures';
import { arenaOf, forcesBySystem, sideTotals, zoneForces } from './forces';

/** The same view without anything in the hidden zone (§3.5 (a)). */
function withoutZone(view: PlayerViewCore): PlayerViewCore {
  return withUnits(
    view,
    view.units.filter((u) => u.location.kind !== 'rebelBase'),
    view.leaders.filter((l) => l.location.kind !== 'rebelBase'),
  );
}

describe('forces — groups side × arena (SWR-009 K-5, AC-6, QD-4)', () => {
  it('arenaOf: from unitTypes; unknown and non-space types are ground', () => {
    const view = makeCoreView();
    expect(arenaOf(view, 'unit.empire.star-destroyer')).toBe('space');
    expect(arenaOf(view, 'unit.rebels.shield-generator')).toBe('ground');
    expect(arenaOf(view, 'unit.unknown')).toBe('ground');
  });

  it('Coruscant: Empire fleet 2 (SD + TIE) and ground 2 (stormtroopers), with per-type rows', () => {
    const set = forcesBySystem(makeCoreView()).get(CS_CORUSCANT)!;
    expect(set.groups).toEqual([
      {
        owner: 'empire',
        arena: 'space',
        count: 2,
        unitIds: [U_SD, U_TIE],
        types: [
          { typeKey: 'unit.empire.star-destroyer', count: 1 },
          { typeKey: 'unit.empire.tie-fighter', count: 1 },
        ],
      },
      {
        owner: 'empire',
        arena: 'ground',
        count: 2,
        unitIds: [U_ST1, U_ST2],
        types: [{ typeKey: 'unit.empire.stormtrooper', count: 2 }],
      },
    ]);
    expect(set.leaders).toEqual([]);
  });

  it('Yavin (Rebels see the base): fleet 1, ground 2 (structure counts as ground, QD-4)', () => {
    const set = forcesBySystem(makeCoreView()).get(CS_YAVIN)!;
    expect(set.groups.map((g) => [g.owner, g.arena, g.count])).toEqual([
      ['rebels', 'space', 1],
      ['rebels', 'ground', 2],
    ]);
    expect(set.groups[0]!.unitIds).toEqual([U_XWING]);
    expect(set.groups[1]!.unitIds).toEqual([U_RT_BASE, U_SHIELD]);
  });

  it('counts equal the number of units with that location (oracle over every system)', () => {
    const view = makeCoreView();
    const byId = forcesBySystem(view);
    for (const id of CORE_SYSTEM_IDS_FIXTURE) {
      const expected = view.units.filter(
        (u) => u.location.kind === 'system' && u.location.systemId === id,
      ).length;
      const got = (byId.get(id)?.groups ?? []).reduce((n, g) => n + g.count, 0);
      expect(got, id).toBe(expected);
    }
    expect(byId.has(CS_CORELLIA)).toBe(false);
  });

  it('leaders on the map belong to their system; pool leaders are nowhere', () => {
    const byId = forcesBySystem(makeCoreActivationView());
    expect(byId.get(CS_CORELLIA)).toEqual({
      groups: [],
      leaders: [{ id: L_LEIA, owner: 'rebels' }],
    });
    const all = [...byId.values()].flatMap((s) => s.leaders.map((l) => l.id));
    expect(all).toEqual([L_LEIA]);
  });

  it('mixed system: groups ordered empire/space, empire/ground, rebels/space, rebels/ground', () => {
    const view = makeCoreView();
    const mixed = withUnits(
      view,
      view.units.map((u) =>
        u.owner === 'rebels' ? { ...u, location: { kind: 'system', systemId: CS_CORUSCANT } } : u,
      ),
    );
    const set = forcesBySystem(mixed).get(CS_CORUSCANT)!;
    expect(set.groups.map((g) => `${g.owner}:${g.arena}:${g.count}`)).toEqual([
      'empire:space:2',
      'empire:ground:2',
      'rebels:space:2',
      'rebels:ground:3',
    ]);
    expect(sideTotals(set)).toEqual([
      { owner: 'empire', units: 4, leaders: 0 },
      { owner: 'rebels', units: 5, leaders: 0 },
    ]);
  });

  it('sideTotals omits sides without units or leaders', () => {
    expect(sideTotals({ groups: [], leaders: [{ id: L_LEIA, owner: 'rebels' }] })).toEqual([
      { owner: 'rebels', units: 0, leaders: 1 },
    ]);
    expect(sideTotals({ groups: [], leaders: [] })).toEqual([]);
  });
});

describe('forces — hidden information (SWR-009 §3.5, AC-8)', () => {
  it('no hidden zone while the base is known (Rebels view): zoneForces = null', () => {
    expect(zoneForces(makeCoreView())).toBeNull();
  });

  it('(a) Empire redacted view: forcesBySystem ≡ forcesBySystem of the view without the zone contents', () => {
    const view = empireRedactedView();
    expect(view.rebelBase.systemId).toBeNull();
    expect(view.units.some((u) => u.location.kind === 'rebelBase')).toBe(true);
    expect(view.leaders.some((l) => l.location.kind === 'rebelBase')).toBe(true);
    expect(forcesBySystem(view)).toEqual(forcesBySystem(withoutZone(view)));
    // The base system (Yavin) has no forces at all in the Empire's view.
    expect(forcesBySystem(view).has(CS_YAVIN)).toBe(false);
  });

  it('the zone set holds exactly what the server put in the zone', () => {
    const zone = zoneForces(empireRedactedView())!;
    expect(zone.groups.map((g) => `${g.owner}:${g.arena}:${g.count}`)).toEqual([
      'rebels:space:1',
      'rebels:ground:2',
    ]);
    expect(zone.leaders).toEqual([{ id: L_DODONNA, owner: 'rebels' }]);
  });

  it('(c) the zone model names no system or region (no systemId key, no system/region ids or name keys)', () => {
    const view = empireRedactedView();
    const json = JSON.stringify(zoneForces(view));
    expect(json).not.toContain('systemId');
    for (const s of view.map.systems) {
      expect(json).not.toContain(`"${s.id}"`);
      expect(json).not.toContain(s.nameKey);
    }
    for (const r of view.map.regions) {
      expect(json).not.toContain(`"${r.id}"`);
      expect(json).not.toContain(r.nameKey);
    }
  });
});
