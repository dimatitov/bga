import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import {
  CORE_SYSTEM_IDS_FIXTURE,
  CS_ALDERAAN,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  empireRedactedView,
  L_DODONNA,
  L_LEIA,
  makeCoreActivationView,
  makeCoreView,
  U_RT_BASE,
  U_SD,
  U_SHIELD,
  U_XWING,
  withUnits,
} from '../../test/coreFixtures';
import {
  isGroupSelected,
  isSystemManifest,
  manifestModel,
  requestMatchesSelection,
} from './manifestModel';

const sys = (systemId: string) => ({ kind: 'system' as const, systemId });

/** The same view without anything in the hidden zone (§3.5 (b)). */
function withoutZone(view: PlayerViewCore): PlayerViewCore {
  return withUnits(
    view,
    view.units.filter((u) => u.location.kind !== 'rebelBase'),
    view.leaders.filter((l) => l.location.kind !== 'rebelBase'),
  );
}

describe('manifestModel — six states (SWR-009 MF, AC-7, plan §3.3)', () => {
  it('fleet: one side, one arena (fleet only); data-arenas distinguishes it', () => {
    const base = makeCoreView();
    const view = withUnits(base, [
      { ...base.units.find((u) => u.id === U_SD)!, location: sys(CS_ALDERAAN) },
    ]);
    const vm = manifestModel(view, sys(CS_ALDERAAN))!;
    expect(vm.state).toBe('fleet');
    expect(vm.arenas).toEqual(['space']);
    expect(vm.factions).toEqual(['empire']);
    expect(vm.total).toBe(1);
    expect(vm.groups.map((g) => [g.owner, g.arena, g.count])).toEqual([['empire', 'space', 1]]);
  });

  it('fleet (ground only): one side, one arena — state fleet, arenas [ground]', () => {
    const base = makeCoreView();
    const view = withUnits(base, [
      { ...base.units.find((u) => u.id === U_SHIELD)!, location: sys(CS_HOTH) },
    ]);
    const vm = manifestModel(view, sys(CS_HOTH))!;
    expect(vm.state).toBe('fleet');
    expect(vm.arenas).toEqual(['ground']);
  });

  it('fleetGround: Coruscant — Empire fleet 2 + ground 2, rows per type, total 4', () => {
    const vm = manifestModel(makeCoreView(), sys(CS_CORUSCANT))!;
    expect(vm.state).toBe('fleetGround');
    expect(vm.factions).toEqual(['empire']);
    expect(vm.total).toBe(4);
    expect(vm.groups.map((g) => [g.arena, g.count, g.types])).toEqual([
      [
        'space',
        2,
        [
          { typeKey: 'unit.empire.star-destroyer', count: 1 },
          { typeKey: 'unit.empire.tie-fighter', count: 1 },
        ],
      ],
      ['ground', 2, [{ typeKey: 'unit.empire.stormtrooper', count: 2 }]],
    ]);
  });

  it('both: units of both sides in one system', () => {
    const base = makeCoreView();
    const view = withUnits(
      base,
      base.units.map((u) => (u.id === U_XWING ? { ...u, location: sys(CS_CORUSCANT) } : u)),
    );
    const vm = manifestModel(view, sys(CS_CORUSCANT))!;
    expect(vm.state).toBe('both');
    expect(vm.factions).toEqual(['empire', 'rebels']);
    expect(vm.total).toBe(5);
  });

  it('leader: only a leader (Leia activated Corellia), total 0', () => {
    const vm = manifestModel(makeCoreActivationView(), sys(CS_CORELLIA))!;
    expect(vm.state).toBe('leader');
    expect(vm.leaders).toEqual([{ id: L_LEIA, owner: 'rebels' }]);
    expect(vm.factions).toEqual(['rebels']);
    expect(vm.total).toBe(0);
  });

  it('empty: no units, no leaders; the system is still named', () => {
    const vm = manifestModel(makeCoreView(), sys(CS_CORELLIA))!;
    expect(vm.state).toBe('empty');
    expect(vm.total).toBe(0);
    expect(vm.factions).toEqual([]);
    expect(isSystemManifest(vm) && vm.systemNameKey).toBe(`systems.${CS_CORELLIA}`);
    expect(isSystemManifest(vm) && vm.regionNameKey).toBe('regions.r1');
  });

  it('restricted: the hidden zone (Empire before the reveal) — exactly the server zone forces', () => {
    const vm = manifestModel(empireRedactedView(), { kind: 'zone' })!;
    expect(vm.state).toBe('restricted');
    expect(vm.total).toBe(3);
    expect(vm.groups.flatMap((g) => g.unitIds).sort()).toEqual(
      [U_RT_BASE, U_SHIELD, U_XWING].sort(),
    );
    expect(vm.leaders).toEqual([{ id: L_DODONNA, owner: 'rebels' }]);
  });

  it('isBase only from visibleRebelBaseSystemId: Rebels see Yavin as the base; the Empire sees no base', () => {
    const rebels = manifestModel(makeCoreView(), sys(CS_YAVIN))!;
    expect(isSystemManifest(rebels) && rebels.isBase).toBe(true);
    const empire = manifestModel(empireRedactedView(), sys(CS_YAVIN))!;
    expect(isSystemManifest(empire) && empire.isBase).toBe(false);
    expect(empire.state).toBe('empty');
  });

  it('missing target → null (unknown system; zone when the base is visible)', () => {
    expect(manifestModel(makeCoreView(), sys('nowhere'))).toBeNull();
    expect(manifestModel(makeCoreView(), { kind: 'zone' })).toBeNull();
  });
});

describe('manifestModel — group selection and request matching', () => {
  it('selected group: the requested side × arena; «all» selects every group of the side', () => {
    const view = makeCoreView();
    const one = manifestModel(view, sys(CS_CORUSCANT), { owner: 'empire', arena: 'ground' })!;
    expect(one.selectedGroup).toEqual({ owner: 'empire', arena: 'ground' });
    expect(one.groups.map((g) => isGroupSelected(one, g))).toEqual([false, true]);
    const all = manifestModel(view, sys(CS_CORUSCANT), { owner: 'empire', arena: 'all' })!;
    expect(all.groups.map((g) => isGroupSelected(all, g))).toEqual([true, true]);
  });

  it('a group that is not shown is never selected', () => {
    const vm = manifestModel(makeCoreView(), sys(CS_CORUSCANT), {
      owner: 'rebels',
      arena: 'space',
    })!;
    expect(vm.selectedGroup).toBeNull();
  });

  it('requestMatchesSelection: same system / the zone only', () => {
    const req = { target: sys(CS_SULLUST), group: null };
    expect(requestMatchesSelection(req, { kind: 'system', systemId: CS_SULLUST })).toBe(true);
    expect(requestMatchesSelection(req, { kind: 'system', systemId: CS_HOTH })).toBe(false);
    expect(requestMatchesSelection(req, { kind: 'zone' })).toBe(false);
    expect(
      requestMatchesSelection({ target: { kind: 'zone' }, group: null }, { kind: 'zone' }),
    ).toBe(true);
    expect(requestMatchesSelection(null, { kind: 'zone' })).toBe(false);
  });
});

describe('manifestModel — hidden information (AC-8, plan §3.5 (b)(c))', () => {
  it('(b) Empire redacted view: the manifest of every system equals the one without rebelBase units/leaders', () => {
    const view = empireRedactedView();
    const clean = withoutZone(view);
    for (const id of CORE_SYSTEM_IDS_FIXTURE) {
      expect(manifestModel(view, sys(id)), id).toEqual(manifestModel(clean, sys(id)));
    }
  });

  it('(c) the zone model has no systemId key and no system / region id or nameKey', () => {
    const view = empireRedactedView();
    const json = JSON.stringify(manifestModel(view, { kind: 'zone' }));
    expect(json).not.toMatch(/systemId/);
    expect(json).not.toMatch(/regionId|NameKey/);
    for (const s of view.map.systems) {
      expect(json, s.id).not.toContain(`"${s.id}"`);
      expect(json, s.nameKey).not.toContain(s.nameKey);
    }
    for (const r of view.map.regions) {
      expect(json, r.id).not.toContain(`"${r.id}"`);
      expect(json, r.nameKey).not.toContain(r.nameKey);
    }
  });
});
