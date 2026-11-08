/**
 * SWR-005 W2 — base-game data of `core-v1` (AC-01, AC-02; TC-D-01..04, TC-D-06, TC-D-09..11).
 * Every expected value below is copied by hand from `docs/game-rules/rebellion-reference.md`
 * (§1.2 regions/remote, §1.5 edges, §2 units, §3 leaders, §4.2 first-game setup), independently of the data files.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CORE_LEADER_IDS,
  CORE_REGION_IDS,
  CORE_SYSTEM_IDS,
  CORE_UNIT_TYPE_KEYS,
  CoreDataSchema,
  eligibleRebelBaseSystemIds,
  unitTypeRevealsRebelBase,
  type CoreLeaderId,
  type CoreRegionId,
  type CoreSystemId,
  type CoreUnitTypeKey,
} from '../../src/schema';
import { CORE_DATA_BASE_V1_ID, coreDataBaseV1 } from '../../src/scenario';

const data = coreDataBaseV1;
const systemsById = new Map(data.systems.map((s) => [s.id, s]));
const typesByKey = new Map(data.unitTypes.map((t) => [t.typeKey, t]));

/** Reference §1.2 (membership). */
const REGIONS: Record<CoreRegionId, readonly CoreSystemId[]> = {
  r1: ['felucia', 'mon-calamari', 'saleucami', 'yavin'],
  r2: ['bothawui', 'kessel', 'nal-hutta', 'toydaria'],
  r3: ['geonosis', 'rodia', 'ryloth', 'tatooine'],
  r4: ['dagobah', 'naboo', 'sullust', 'utapau'],
  r5: ['bespin', 'endor', 'hoth', 'mustafar'],
  r6: ['alderaan', 'cato-neimoidia', 'corellia', 'coruscant'],
  r7: ['dathomir', 'kashyyyk', 'malastare', 'mandalore'],
  r8: ['dantooine', 'ilum', 'mygeeto', 'ord-mantell'],
};

/** Reference §1.2 "Remote systems (8)". */
const REMOTE: readonly CoreSystemId[] = [
  'dagobah',
  'dantooine',
  'dathomir',
  'endor',
  'hoth',
  'ilum',
  'tatooine',
  'yavin',
];

/** Reference §1.5 — the 69 undirected edges, in the reference's order. */
const EDGES: readonly (readonly [CoreSystemId, CoreSystemId])[] = [
  ['alderaan', 'cato-neimoidia'],
  ['alderaan', 'corellia'],
  ['alderaan', 'coruscant'],
  ['alderaan', 'kashyyyk'],
  ['alderaan', 'mandalore'],
  ['alderaan', 'ord-mantell'],
  ['bespin', 'endor'],
  ['bespin', 'hoth'],
  ['bespin', 'mustafar'],
  ['bespin', 'sullust'],
  ['bothawui', 'malastare'],
  ['bothawui', 'nal-hutta'],
  ['bothawui', 'rodia'],
  ['bothawui', 'tatooine'],
  ['bothawui', 'toydaria'],
  ['cato-neimoidia', 'corellia'],
  ['cato-neimoidia', 'kashyyyk'],
  ['cato-neimoidia', 'malastare'],
  ['cato-neimoidia', 'sullust'],
  ['corellia', 'coruscant'],
  ['corellia', 'sullust'],
  ['coruscant', 'ord-mantell'],
  ['dagobah', 'mustafar'],
  ['dagobah', 'naboo'],
  ['dagobah', 'sullust'],
  ['dagobah', 'utapau'],
  ['dantooine', 'dathomir'],
  ['dantooine', 'mygeeto'],
  ['dathomir', 'mandalore'],
  ['dathomir', 'mygeeto'],
  ['dathomir', 'yavin'],
  ['endor', 'hoth'],
  ['felucia', 'mandalore'],
  ['felucia', 'mon-calamari'],
  ['felucia', 'saleucami'],
  ['felucia', 'yavin'],
  ['geonosis', 'naboo'],
  ['geonosis', 'rodia'],
  ['geonosis', 'ryloth'],
  ['geonosis', 'tatooine'],
  ['geonosis', 'utapau'],
  ['hoth', 'mustafar'],
  ['ilum', 'mygeeto'],
  ['ilum', 'ord-mantell'],
  ['kashyyyk', 'malastare'],
  ['kashyyyk', 'mandalore'],
  ['kashyyyk', 'saleucami'],
  ['kashyyyk', 'toydaria'],
  ['kessel', 'nal-hutta'],
  ['kessel', 'saleucami'],
  ['kessel', 'toydaria'],
  ['malastare', 'naboo'],
  ['malastare', 'rodia'],
  ['malastare', 'sullust'],
  ['malastare', 'toydaria'],
  ['mandalore', 'mygeeto'],
  ['mandalore', 'ord-mantell'],
  ['mandalore', 'saleucami'],
  ['mandalore', 'yavin'],
  ['mon-calamari', 'saleucami'],
  ['mustafar', 'sullust'],
  ['mygeeto', 'ord-mantell'],
  ['naboo', 'rodia'],
  ['naboo', 'sullust'],
  ['naboo', 'utapau'],
  ['nal-hutta', 'toydaria'],
  ['rodia', 'tatooine'],
  ['ryloth', 'tatooine'],
  ['saleucami', 'toydaria'],
];

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function dataEdges(): Set<string> {
  const edges = new Set<string>();
  for (const s of data.systems) for (const n of s.adjacentSystemIds) edges.add(edgeKey(s.id, n));
  return edges;
}

describe('coreDataBaseV1 — identity and schema', () => {
  it('passes CoreDataSchema and has id rebellion-base-v1', () => {
    expect(CoreDataSchema.parse(data)).toEqual(data);
    expect(data.id).toBe('rebellion-base-v1');
    expect(CORE_DATA_BASE_V1_ID).toBe('rebellion-base-v1');
  });
});

describe('coreDataBaseV1 — map (reference §1.2–§1.6)', () => {
  it('has exactly 32 systems with unique kebab-case ids equal to CORE_SYSTEM_IDS', () => {
    const ids = data.systems.map((s) => s.id);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(ids).toEqual([...CORE_SYSTEM_IDS]);
    expect(ids).toEqual(expect.arrayContaining(['mon-calamari', 'cato-neimoidia', 'alderaan']));
  });

  it('has 8 regions r1..r8, 4 systems each, membership as in §1.2', () => {
    expect(data.regions.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
    expect(data.regions.map((r) => r.id)).toEqual([...CORE_REGION_IDS]);
    for (const region of CORE_REGION_IDS) {
      const members = data.systems.filter((s) => s.regionId === region).map((s) => s.id);
      expect(members.sort(), region).toEqual([...REGIONS[region]].sort());
    }
    expect(Object.values(REGIONS).flat().sort()).toEqual([...CORE_SYSTEM_IDS].sort());
  });

  it('has exactly the 69 undirected edges of §1.5, symmetric, without loops or duplicates', () => {
    expect(EDGES).toHaveLength(69);
    const expected = new Set(EDGES.map(([a, b]) => edgeKey(a, b)));
    expect(expected.size).toBe(69);
    expect([...dataEdges()].sort()).toEqual([...expected].sort());
    let directed = 0;
    for (const s of data.systems) {
      expect(new Set(s.adjacentSystemIds).size, s.id).toBe(s.adjacentSystemIds.length);
      expect(s.adjacentSystemIds, s.id).not.toContain(s.id);
      for (const n of s.adjacentSystemIds) {
        expect(systemsById.get(n)?.adjacentSystemIds, `${s.id} → ${n}`).toContain(s.id);
        directed += 1;
      }
    }
    expect(directed).toBe(138);
  });

  it('does not connect Mustafar and Utapau (§1.4)', () => {
    expect(systemsById.get('mustafar')?.adjacentSystemIds).not.toContain('utapau');
    expect(systemsById.get('utapau')?.adjacentSystemIds).not.toContain('mustafar');
  });

  it('is connected (BFS reaches all 32 systems)', () => {
    const seen = new Set<string>(['coruscant']);
    const queue = ['coruscant'];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const n of systemsById.get(id)?.adjacentSystemIds ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(32);
  });

  it('marks exactly the 8 remote systems of §1.2', () => {
    const remote = data.systems.filter((s) => s.remote).map((s) => s.id);
    expect(remote.sort()).toEqual([...REMOTE].sort());
    expect(data.systems.filter((s) => !s.remote)).toHaveLength(24);
  });
});

describe('coreDataBaseV1 — unit catalogue (reference §2)', () => {
  it('has 18 types (9 per side, incl. the Super Star Destroyer) equal to CORE_UNIT_TYPE_KEYS', () => {
    const keys = data.unitTypes.map((t) => t.typeKey);
    expect(keys).toEqual([...CORE_UNIT_TYPE_KEYS]);
    expect(new Set(keys).size).toBe(18);
    expect(data.unitTypes.filter((t) => t.owner === 'empire')).toHaveLength(9);
    expect(data.unitTypes.filter((t) => t.owner === 'rebels')).toHaveLength(9);
    expect(keys).toContain('unit.empire.super-star-destroyer');
  });

  const CAPACITY: Record<CoreUnitTypeKey, number> = {
    'unit.empire.star-destroyer': 6,
    'unit.empire.assault-carrier': 4,
    'unit.empire.super-star-destroyer': 8,
    'unit.empire.death-star': 8,
    'unit.empire.death-star-under-construction': 0,
    'unit.empire.tie-fighter': 0,
    'unit.empire.stormtrooper': 0,
    'unit.empire.at-st': 0,
    'unit.empire.at-at': 0,
    'unit.rebels.corellian-corvette': 2,
    'unit.rebels.rebel-transport': 4,
    'unit.rebels.mon-calamari-cruiser': 4,
    'unit.rebels.x-wing': 0,
    'unit.rebels.y-wing': 0,
    'unit.rebels.rebel-trooper': 0,
    'unit.rebels.airspeeder': 0,
    'unit.rebels.shield-generator': 0,
    'unit.rebels.ion-cannon': 0,
  };
  const GROUND = new Set<CoreUnitTypeKey>([
    'unit.empire.stormtrooper',
    'unit.empire.at-st',
    'unit.empire.at-at',
    'unit.rebels.rebel-trooper',
    'unit.rebels.airspeeder',
    'unit.rebels.shield-generator',
    'unit.rebels.ion-cannon',
  ]);
  const IMMOBILE = new Set<CoreUnitTypeKey>([
    'unit.rebels.shield-generator',
    'unit.rebels.ion-cannon',
    'unit.empire.death-star-under-construction',
  ]);
  const REQUIRES_TRANSPORT = new Set<CoreUnitTypeKey>([
    'unit.empire.stormtrooper',
    'unit.empire.at-st',
    'unit.empire.at-at',
    'unit.rebels.rebel-trooper',
    'unit.rebels.airspeeder',
    'unit.empire.tie-fighter',
  ]);

  it('sets capacity, arena, mobility and the transport restriction as in §2 / Q-21', () => {
    for (const key of CORE_UNIT_TYPE_KEYS) {
      const t = typesByKey.get(key);
      expect(t, key).toBeDefined();
      expect(t?.transportCapacity, key).toBe(CAPACITY[key]);
      expect(t?.arena, key).toBe(GROUND.has(key) ? 'ground' : 'space');
      expect(t?.mobility, key).toBe(IMMOBILE.has(key) ? 'immobile' : 'mobile');
      expect(t?.requiresTransport, key).toBe(REQUIRES_TRANSPORT.has(key));
      expect(t?.owner, key).toBe(key.startsWith('unit.empire.') ? 'empire' : 'rebels');
    }
    expect(typesByKey.get('unit.empire.death-star')?.mobility).toBe('mobile');
  });

  it('derives base reveal only for Imperial ground units (R-8)', () => {
    const revealing = data.unitTypes
      .filter((t) => unitTypeRevealsRebelBase(t))
      .map((t) => t.typeKey);
    expect(revealing.sort()).toEqual(
      ['unit.empire.at-at', 'unit.empire.at-st', 'unit.empire.stormtrooper'].sort(),
    );
  });
});

describe('coreDataBaseV1 — leaders (reference §3)', () => {
  it('has the 8 starting leaders; only Mon Mothma cannot activate', () => {
    expect(data.leaders.map((l) => l.id)).toEqual([...CORE_LEADER_IDS]);
    const byOwner = (owner: string) =>
      data.leaders
        .filter((l) => l.owner === owner)
        .map((l) => l.id)
        .sort();
    expect(byOwner('empire')).toEqual(['palpatine', 'tagge', 'tarkin', 'vader']);
    expect(byOwner('rebels')).toEqual(['dodonna', 'leia', 'mon-mothma', 'rieekan']);
    expect(data.leaders.filter((l) => !l.canActivate).map((l) => l.id)).toEqual(['mon-mothma']);
    expect([...data.startSetup.leaders].sort()).toEqual([...CORE_LEADER_IDS].sort());
  });
});

describe('coreDataBaseV1 — first-game start setup (reference §4.2)', () => {
  const setup = data.startSetup;

  it('starts with time 1 and reputation 14', () => {
    expect(setup.startingTime).toBe(1);
    expect(setup.startingReputation).toBe(14);
  });

  function countsAt(where: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const u of setup.units) {
      const at = u.at.kind === 'system' ? u.at.systemId : 'rebelBase';
      if (at === where) counts[u.typeKey] = (counts[u.typeKey] ?? 0) + 1;
    }
    return counts;
  }

  /** §4.2, per system and the "Rebel Base" space (loyalty markers are not modelled, D-5). */
  const PLACEMENT: Record<string, Partial<Record<CoreUnitTypeKey, number>>> = {
    bothawui: {
      'unit.rebels.corellian-corvette': 1,
      'unit.rebels.rebel-transport': 1,
      'unit.rebels.x-wing': 1,
      'unit.rebels.y-wing': 1,
      'unit.rebels.rebel-trooper': 3,
      'unit.rebels.airspeeder': 1,
    },
    rebelBase: {
      'unit.rebels.x-wing': 1,
      'unit.rebels.y-wing': 1,
      'unit.rebels.rebel-trooper': 3,
      'unit.rebels.airspeeder': 1,
    },
    saleucami: {
      'unit.empire.star-destroyer': 1,
      'unit.empire.tie-fighter': 2,
      'unit.empire.stormtrooper': 2,
      'unit.empire.at-st': 1,
    },
    mandalore: {
      'unit.empire.death-star': 1,
      'unit.empire.tie-fighter': 4,
      'unit.empire.stormtrooper': 2,
      'unit.empire.at-st': 1,
    },
    coruscant: {
      'unit.empire.star-destroyer': 1,
      'unit.empire.assault-carrier': 1,
      'unit.empire.tie-fighter': 2,
      'unit.empire.stormtrooper': 3,
      'unit.empire.at-at': 1,
      'unit.empire.at-st': 1,
    },
    corellia: { 'unit.empire.assault-carrier': 1, 'unit.empire.stormtrooper': 1 },
    sullust: {
      'unit.empire.star-destroyer': 1,
      'unit.empire.tie-fighter': 2,
      'unit.empire.stormtrooper': 2,
      'unit.empire.at-st': 1,
    },
    mustafar: {
      'unit.empire.assault-carrier': 1,
      'unit.empire.tie-fighter': 2,
      'unit.empire.stormtrooper': 2,
      'unit.empire.at-st': 1,
    },
  };

  it('places units exactly as §4.2, including the "on the base" group, and nowhere else', () => {
    for (const [where, expected] of Object.entries(PLACEMENT)) {
      expect(countsAt(where), where).toEqual(expected);
    }
    const places = new Set(
      setup.units.map((u) => (u.at.kind === 'system' ? u.at.systemId : 'rebelBase')),
    );
    expect([...places].sort()).toEqual(Object.keys(PLACEMENT).sort());
  });

  it('matches the §4.2 totals of both sides', () => {
    const totals = (owner: 'empire' | 'rebels') => {
      const out: Record<string, number> = {};
      for (const u of setup.units) {
        if (typesByKey.get(u.typeKey)?.owner === owner) out[u.typeKey] = (out[u.typeKey] ?? 0) + 1;
      }
      return out;
    };
    expect(totals('empire')).toEqual({
      'unit.empire.star-destroyer': 3,
      'unit.empire.assault-carrier': 3,
      'unit.empire.tie-fighter': 12,
      'unit.empire.stormtrooper': 12,
      'unit.empire.at-st': 5,
      'unit.empire.at-at': 1,
      'unit.empire.death-star': 1,
    });
    expect(totals('rebels')).toEqual({
      'unit.rebels.corellian-corvette': 1,
      'unit.rebels.rebel-transport': 1,
      'unit.rebels.x-wing': 2,
      'unit.rebels.y-wing': 2,
      'unit.rebels.rebel-trooper': 6,
      'unit.rebels.airspeeder': 2,
    });
    expect(setup.units).toHaveLength(37 + 14);
  });

  it('lists Coruscant and the 5 removed probe cards as base-ineligible', () => {
    expect([...setup.baseIneligibleSystemIds].sort()).toEqual(
      ['corellia', 'coruscant', 'mandalore', 'mustafar', 'saleucami', 'sullust'].sort(),
    );
  });

  it('derives the eligible rebel base systems (R-10), computed by hand from §1.3/§4.2', () => {
    // Bothawui holds starting Rebel units (§4.2) → excluded (SWR-005 CODE_REVIEW #1, D-6): 9 candidates.
    expect(eligibleRebelBaseSystemIds(data)).toEqual([
      'dantooine',
      'endor',
      'geonosis',
      'ilum',
      'nal-hutta',
      'rodia',
      'ryloth',
      'tatooine',
      'utapau',
    ]);
  });
});

describe('core-ids (web-safe lists)', () => {
  it('are frozen, unique and match the data at runtime', () => {
    for (const list of [CORE_SYSTEM_IDS, CORE_REGION_IDS, CORE_LEADER_IDS, CORE_UNIT_TYPE_KEYS]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(CORE_SYSTEM_IDS).toHaveLength(32);
    expect(CORE_REGION_IDS).toHaveLength(8);
    expect(CORE_LEADER_IDS).toHaveLength(8);
    expect(CORE_UNIT_TYPE_KEYS).toHaveLength(18);
  });

  it('match the data at the type level', () => {
    // The hand-written expectations above are typed with the id unions (a typo is a tsc error) and,
    // conversely, the Records below must name every id of each union.
    expectTypeOf(REGIONS).toEqualTypeOf<Record<CoreRegionId, readonly CoreSystemId[]>>();
    expectTypeOf<keyof typeof REGIONS>().toEqualTypeOf<CoreRegionId>();
    expectTypeOf<(typeof CORE_LEADER_IDS)[number]>().toEqualTypeOf<CoreLeaderId>();
    expectTypeOf<CoreSystemId>().toEqualTypeOf<
      | 'alderaan'
      | 'bespin'
      | 'bothawui'
      | 'cato-neimoidia'
      | 'corellia'
      | 'coruscant'
      | 'dagobah'
      | 'dantooine'
      | 'dathomir'
      | 'endor'
      | 'felucia'
      | 'geonosis'
      | 'hoth'
      | 'ilum'
      | 'kashyyyk'
      | 'kessel'
      | 'malastare'
      | 'mandalore'
      | 'mon-calamari'
      | 'mustafar'
      | 'mygeeto'
      | 'naboo'
      | 'nal-hutta'
      | 'ord-mantell'
      | 'rodia'
      | 'ryloth'
      | 'saleucami'
      | 'sullust'
      | 'tatooine'
      | 'toydaria'
      | 'utapau'
      | 'yavin'
    >();
    expectTypeOf<CoreUnitTypeKey>().toExtend<`unit.${'empire' | 'rebels'}.${string}`>();
  });
});
