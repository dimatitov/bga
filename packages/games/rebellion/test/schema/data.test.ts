/**
 * SWR-005 W1: static data schemas of `core-v1` (`src/schema/data.ts`) — generic integrity on synthetic data
 * (the real base-game data and its 32/8 counts are tested by W2).
 */
import { describe, expect, it } from 'vitest';
import {
  CoreDataSchema,
  LeaderDataSchema,
  StartPlacementSchema,
  SystemDataSchema,
  UnitTypeSchema,
  eligibleRebelBaseSystemIds,
  unitTypeRevealsRebelBase,
  type CoreData,
} from '../../src/schema';
import { miniData } from './core-sample';

function issues(data: unknown): string[] {
  const parsed = CoreDataSchema.safeParse(data);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
}

function withData(change: (d: CoreData) => void): CoreData {
  const d = structuredClone(miniData());
  change(d);
  return d;
}

describe('CoreDataSchema integrity (SWR-005 plan-backend §1.1)', () => {
  it('accepts consistent data and returns an equal copy', () => {
    const data = miniData();
    expect(CoreDataSchema.parse(data)).toEqual(data);
  });

  it('asymmetric adjacency → error', () => {
    const data = withData((d) => {
      d.systems[0]!.adjacentSystemIds = ['b', 'c'];
    });
    expect(issues(data)).toContain('asymmetric adjacency a → c');
  });

  it('self loop, duplicate neighbour and unknown neighbour → errors', () => {
    expect(issues(withData((d) => d.systems[0]!.adjacentSystemIds.push('a')))).toContain(
      'a is adjacent to itself',
    );
    expect(issues(withData((d) => d.systems[0]!.adjacentSystemIds.push('b')))).toContain(
      'duplicate neighbour b',
    );
    expect(issues(withData((d) => d.systems[0]!.adjacentSystemIds.push('zz')))).toContain(
      'unknown system zz',
    );
  });

  it('broken references → errors (region, start unit type/system, start leader, ineligible system)', () => {
    expect(issues(withData((d) => (d.systems[1]!.regionId = 'r9')))).toContain('unknown region r9');
    expect(
      issues(withData((d) => (d.startSetup.units[0]!.typeKey = 'unit.empire.nope'))),
    ).toContain('unknown unit type unit.empire.nope');
    expect(
      issues(withData((d) => (d.startSetup.units[0]!.at = { kind: 'system', systemId: 'zz' }))),
    ).toContain('unknown system zz');
    expect(issues(withData((d) => d.startSetup.leaders.push('palpatine')))).toContain(
      'unknown leader palpatine',
    );
    expect(issues(withData((d) => d.startSetup.baseIneligibleSystemIds.push('zz')))).toContain(
      'unknown system zz',
    );
  });

  it('duplicate ids / typeKeys → errors', () => {
    expect(issues(withData((d) => d.regions.push({ id: 'r1' })))).toContain('duplicate id r1');
    expect(issues(withData((d) => d.unitTypes.push({ ...d.unitTypes[0]! })))).toContain(
      'duplicate id unit.empire.trooper',
    );
    expect(issues(withData((d) => d.leaders.push({ ...d.leaders[0]! })))).toContain(
      'duplicate id vader',
    );
    expect(issues(withData((d) => d.startSetup.leaders.push('vader')))).toContain(
      'duplicate vader',
    );
  });

  it('typeKey prefix must match the owner; unit type consistency (R-5)', () => {
    expect(issues(withData((d) => (d.unitTypes[0]!.owner = 'rebels')))).toContain(
      'typeKey prefix does not match owner rebels',
    );
    expect(issues(withData((d) => (d.unitTypes[0]!.requiresTransport = false)))).toContain(
      'a mobile ground unit requires transport (R-5)',
    );
    expect(issues(withData((d) => (d.unitTypes[2]!.transportCapacity = 2)))).toContain(
      'a unit that requires transport cannot carry others',
    );
    expect(issues(withData((d) => (d.unitTypes[5]!.transportCapacity = 1)))).toContain(
      'an immobile unit neither carries nor requires transport',
    );
  });

  it('only Rebel units start on the Rebel base; time below reputation', () => {
    expect(issues(withData((d) => (d.startSetup.units[0]!.at = { kind: 'rebelBase' })))).toContain(
      'only Rebel units start on the Rebel base',
    );
    expect(issues(withData((d) => (d.startSetup.startingTime = 14)))).toContain(
      'startingTime must be below startingReputation',
    );
  });

  it('eligible base systems (R-10): no ineligible, no Imperial start system, no neighbour of one, no Rebel start system; sorted', () => {
    expect(eligibleRebelBaseSystemIds(miniData())).toEqual(['d']);
    // `c` holds a starting Rebel transport (kind 'system') → still not eligible without the ineligible list
    // (D-6 would move it into the hidden zone and reveal the base, SWR-005 CODE_REVIEW #1).
    expect(
      eligibleRebelBaseSystemIds(withData((d) => (d.startSetup.baseIneligibleSystemIds = []))),
    ).toEqual(['d']);
    // Without that Rebel unit `c` becomes eligible; units "on the base" (kind 'rebelBase') never exclude anything.
    expect(
      eligibleRebelBaseSystemIds(
        withData((d) => {
          d.startSetup.baseIneligibleSystemIds = [];
          d.startSetup.units = d.startSetup.units.filter(
            (u) => u.typeKey !== 'unit.rebels.transport',
          );
        }),
      ),
    ).toEqual(['c', 'd']);
    // A Rebel unit placed in a system excludes that system alone, not its neighbours.
    const rebelInD = withData((d) =>
      d.startSetup.units.push({
        typeKey: 'unit.rebels.trooper',
        at: { kind: 'system', systemId: 'd' },
      }),
    );
    expect(eligibleRebelBaseSystemIds(rebelInD)).toEqual([]);
    expect(issues(rebelInD)).toContain('no system is eligible for the rebel base (R-10)');
    // A candidate with a starting Imperial unit (or next to one) is never eligible → none left → error.
    const imperialEverywhere = withData((d) =>
      d.startSetup.units.push({
        typeKey: 'unit.empire.tie',
        at: { kind: 'system', systemId: 'd' },
      }),
    );
    expect(eligibleRebelBaseSystemIds(imperialEverywhere)).toEqual([]);
    expect(issues(imperialEverywhere)).toContain('no system is eligible for the rebel base (R-10)');
  });

  it('strict element schemas; StartPlacement is a discriminated union', () => {
    expect(
      SystemDataSchema.safeParse({ id: 'a', regionId: 'r', adjacentSystemIds: [] }).success,
    ).toBe(false);
    expect(
      LeaderDataSchema.safeParse({ id: 'x', owner: 'empire', canActivate: true, extra: 1 }).success,
    ).toBe(false);
    expect(
      UnitTypeSchema.safeParse({ ...miniData().unitTypes[0]!, revealsRebelBase: true }).success,
    ).toBe(false);
    expect(UnitTypeSchema.safeParse({ ...miniData().unitTypes[0]!, typeKey: 'tie' }).success).toBe(
      false,
    );
    expect(StartPlacementSchema.safeParse({ kind: 'rebelBase' }).success).toBe(true);
    expect(StartPlacementSchema.safeParse({ kind: 'rebelBase', systemId: 'd' }).success).toBe(
      false,
    );
  });

  it('reveal of the base is derived: only Imperial ground units (R-8, Q-BE-4)', () => {
    const byKey = new Map(miniData().unitTypes.map((t) => [t.typeKey, t]));
    expect(unitTypeRevealsRebelBase(byKey.get('unit.empire.trooper')!)).toBe(true);
    expect(unitTypeRevealsRebelBase(byKey.get('unit.empire.destroyer')!)).toBe(false);
    expect(unitTypeRevealsRebelBase(byKey.get('unit.empire.tie')!)).toBe(false);
    expect(unitTypeRevealsRebelBase(byKey.get('unit.rebels.trooper')!)).toBe(false);
  });
});
