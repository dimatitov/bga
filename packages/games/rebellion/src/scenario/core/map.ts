/**
 * Base-game map for `core-v1`: 8 regions, 32 systems, adjacency, remote flag.
 * Source: `docs/game-rules/rebellion-reference.md`
 * - regions and membership — §1.2 (membership: confidence high; there are no official region names, ids r1..r8);
 * - adjacency — §1.3 table (69 undirected edges, §1.5; confidence high per edge);
 *   Mustafar–Utapau is NOT adjacent (§1.4, confidence medium-high: red no-travel stripe, owner to confirm);
 * - remote systems (8) — §1.2 (confidence high).
 * Region order in the comments follows §1.2: r1 Mon Calamari, r2 Nal Hutta, r3 Rodia, r4 Utapau, r5 Mustafar,
 * r6 Coruscant, r7 Kashyyyk, r8 Mygeeto (fan labels, not official).
 */
import {
  CORE_REGION_IDS,
  CORE_SYSTEM_IDS,
  type CoreRegionId,
  type CoreSystemId,
  type RegionData,
  type SystemData,
} from '../../schema';

interface CoreSystemEntry {
  readonly regionId: CoreRegionId;
  readonly remote: boolean;
  readonly adjacent: readonly CoreSystemId[];
}

/** `Record` over all ids: a missing or unknown system is a tsc error. Neighbours as in reference §1.3. */
const SYSTEMS: Readonly<Record<CoreSystemId, CoreSystemEntry>> = {
  // r1 — Mon Calamari region
  felucia: {
    regionId: 'r1',
    remote: false,
    adjacent: ['mandalore', 'mon-calamari', 'saleucami', 'yavin'],
  },
  'mon-calamari': { regionId: 'r1', remote: false, adjacent: ['felucia', 'saleucami'] },
  saleucami: {
    regionId: 'r1',
    remote: false,
    adjacent: ['felucia', 'kashyyyk', 'kessel', 'mandalore', 'mon-calamari', 'toydaria'],
  },
  yavin: { regionId: 'r1', remote: true, adjacent: ['dathomir', 'felucia', 'mandalore'] },
  // r2 — Nal Hutta region
  bothawui: {
    regionId: 'r2',
    remote: false,
    adjacent: ['malastare', 'nal-hutta', 'rodia', 'tatooine', 'toydaria'],
  },
  kessel: { regionId: 'r2', remote: false, adjacent: ['nal-hutta', 'saleucami', 'toydaria'] },
  'nal-hutta': { regionId: 'r2', remote: false, adjacent: ['bothawui', 'kessel', 'toydaria'] },
  toydaria: {
    regionId: 'r2',
    remote: false,
    adjacent: ['bothawui', 'kashyyyk', 'kessel', 'malastare', 'nal-hutta', 'saleucami'],
  },
  // r3 — Rodia region
  geonosis: {
    regionId: 'r3',
    remote: false,
    adjacent: ['naboo', 'rodia', 'ryloth', 'tatooine', 'utapau'],
  },
  rodia: {
    regionId: 'r3',
    remote: false,
    adjacent: ['bothawui', 'geonosis', 'malastare', 'naboo', 'tatooine'],
  },
  ryloth: { regionId: 'r3', remote: false, adjacent: ['geonosis', 'tatooine'] },
  tatooine: { regionId: 'r3', remote: true, adjacent: ['bothawui', 'geonosis', 'rodia', 'ryloth'] },
  // r4 — Utapau region
  dagobah: { regionId: 'r4', remote: true, adjacent: ['mustafar', 'naboo', 'sullust', 'utapau'] },
  naboo: {
    regionId: 'r4',
    remote: false,
    adjacent: ['dagobah', 'geonosis', 'malastare', 'rodia', 'sullust', 'utapau'],
  },
  sullust: {
    regionId: 'r4',
    remote: false,
    adjacent: ['bespin', 'cato-neimoidia', 'corellia', 'dagobah', 'malastare', 'mustafar', 'naboo'],
  },
  utapau: { regionId: 'r4', remote: false, adjacent: ['dagobah', 'geonosis', 'naboo'] },
  // r5 — Mustafar region
  bespin: { regionId: 'r5', remote: false, adjacent: ['endor', 'hoth', 'mustafar', 'sullust'] },
  endor: { regionId: 'r5', remote: true, adjacent: ['bespin', 'hoth'] },
  hoth: { regionId: 'r5', remote: true, adjacent: ['bespin', 'endor', 'mustafar'] },
  mustafar: { regionId: 'r5', remote: false, adjacent: ['bespin', 'dagobah', 'hoth', 'sullust'] },
  // r6 — Coruscant region
  alderaan: {
    regionId: 'r6',
    remote: false,
    adjacent: ['cato-neimoidia', 'corellia', 'coruscant', 'kashyyyk', 'mandalore', 'ord-mantell'],
  },
  'cato-neimoidia': {
    regionId: 'r6',
    remote: false,
    adjacent: ['alderaan', 'corellia', 'kashyyyk', 'malastare', 'sullust'],
  },
  corellia: {
    regionId: 'r6',
    remote: false,
    adjacent: ['alderaan', 'cato-neimoidia', 'coruscant', 'sullust'],
  },
  coruscant: { regionId: 'r6', remote: false, adjacent: ['alderaan', 'corellia', 'ord-mantell'] },
  // r7 — Kashyyyk region
  dathomir: {
    regionId: 'r7',
    remote: true,
    adjacent: ['dantooine', 'mandalore', 'mygeeto', 'yavin'],
  },
  kashyyyk: {
    regionId: 'r7',
    remote: false,
    adjacent: ['alderaan', 'cato-neimoidia', 'malastare', 'mandalore', 'saleucami', 'toydaria'],
  },
  malastare: {
    regionId: 'r7',
    remote: false,
    adjacent: ['bothawui', 'cato-neimoidia', 'kashyyyk', 'naboo', 'rodia', 'sullust', 'toydaria'],
  },
  mandalore: {
    regionId: 'r7',
    remote: false,
    adjacent: [
      'alderaan',
      'dathomir',
      'felucia',
      'kashyyyk',
      'mygeeto',
      'ord-mantell',
      'saleucami',
      'yavin',
    ],
  },
  // r8 — Mygeeto region
  dantooine: { regionId: 'r8', remote: true, adjacent: ['dathomir', 'mygeeto'] },
  ilum: { regionId: 'r8', remote: true, adjacent: ['mygeeto', 'ord-mantell'] },
  mygeeto: {
    regionId: 'r8',
    remote: false,
    adjacent: ['dantooine', 'dathomir', 'ilum', 'mandalore', 'ord-mantell'],
  },
  'ord-mantell': {
    regionId: 'r8',
    remote: false,
    adjacent: ['alderaan', 'coruscant', 'ilum', 'mandalore', 'mygeeto'],
  },
};

export const coreRegions: RegionData[] = CORE_REGION_IDS.map((id) => ({ id }));

/** In `CORE_SYSTEM_IDS` order (alphabetical). */
export const coreSystems: SystemData[] = CORE_SYSTEM_IDS.map((id) => {
  const s = SYSTEMS[id];
  return { id, regionId: s.regionId, adjacentSystemIds: [...s.adjacent], remote: s.remote };
});
