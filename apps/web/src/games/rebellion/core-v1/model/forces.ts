import type { FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import { hiddenZone } from './viewModel';

/**
 * Forces of the map grouped for markers and the Unit Manifest (SWR-009 K-5, plan §3.1). Pure functions of the
 * server `PlayerView` only — nothing is inferred (§3.5): a system's forces are exactly the units / leaders whose
 * `location` is that system; the hidden rebel-base zone has its own set (`zoneForces`) and never leaks into a system.
 */

/** QD-4: everything that is not `space` is ground (structures included). */
export type Arena = 'space' | 'ground';

export interface TypeCount {
  typeKey: string;
  count: number;
}

/** One marker: side × arena with the number of figures and the per-type breakdown. */
export interface ForceGroup {
  owner: FactionId;
  arena: Arena;
  count: number;
  unitIds: string[];
  types: TypeCount[];
}

export interface ForceLeader {
  id: string;
  owner: FactionId;
}

/** Groups in the order empire/space, empire/ground, rebels/space, rebels/ground; empty groups are omitted. */
export interface ForceSet {
  groups: ForceGroup[];
  leaders: ForceLeader[];
}

type View = PlayerViewCore;
type Unit = View['units'][number];
type Leader = View['leaders'][number];

const SIDES: readonly FactionId[] = ['empire', 'rebels'];
const ARENAS: readonly Arena[] = ['space', 'ground'];

/** Arena of a unit type from `view.unitTypes`; an unknown type is ground (like the map's `unitShape`). */
export function arenaOf(view: View, typeKey: string): Arena {
  return view.unitTypes.find((t) => t.typeKey === typeKey)?.arena === 'space' ? 'space' : 'ground';
}

function buildSet(view: View, units: readonly Unit[], leaders: readonly Leader[]): ForceSet {
  const groups: ForceGroup[] = [];
  for (const owner of SIDES) {
    for (const arena of ARENAS) {
      const mine = units.filter((u) => u.owner === owner && arenaOf(view, u.typeKey) === arena);
      if (mine.length === 0) continue;
      const types: TypeCount[] = [];
      for (const u of mine) {
        const row = types.find((t) => t.typeKey === u.typeKey);
        if (row) row.count += 1;
        else types.push({ typeKey: u.typeKey, count: 1 });
      }
      groups.push({ owner, arena, count: mine.length, unitIds: mine.map((u) => u.id), types });
    }
  }
  const sorted = SIDES.flatMap((owner) =>
    leaders.filter((l) => l.owner === owner).map((l) => ({ id: l.id, owner: l.owner })),
  );
  return { groups, leaders: sorted };
}

/**
 * Forces per system id — ONLY units / leaders with `location.kind === 'system'` (§3.5); systems without forces are
 * absent from the map.
 */
export function forcesBySystem(view: View): ReadonlyMap<string, ForceSet> {
  const unitsAt = new Map<string, Unit[]>();
  const leadersAt = new Map<string, Leader[]>();
  for (const u of view.units) {
    if (u.location.kind !== 'system') continue;
    const list = unitsAt.get(u.location.systemId) ?? [];
    list.push(u);
    unitsAt.set(u.location.systemId, list);
  }
  for (const l of view.leaders) {
    if (l.location.kind !== 'system') continue;
    const list = leadersAt.get(l.location.systemId) ?? [];
    list.push(l);
    leadersAt.set(l.location.systemId, list);
  }
  const result = new Map<string, ForceSet>();
  const ids = [...new Set([...unitsAt.keys(), ...leadersAt.keys()])];
  for (const id of ids) {
    result.set(id, buildSet(view, unitsAt.get(id) ?? [], leadersAt.get(id) ?? []));
  }
  return result;
}

/** Forces of the hidden rebel-base zone (only while the server hides the base: `hiddenZone(view)`), else `null`. */
export function zoneForces(view: View): ForceSet | null {
  if (hiddenZone(view) === null) return null;
  return buildSet(
    view,
    view.units.filter((u) => u.location.kind === 'rebelBase'),
    view.leaders.filter((l) => l.location.kind === 'rebelBase'),
  );
}

/** Per-side totals of a set (compact LOD: one marker per side); sides with nothing are omitted. */
export function sideTotals(
  set: ForceSet,
): Array<{ owner: FactionId; units: number; leaders: number }> {
  return SIDES.map((owner) => ({
    owner,
    units: set.groups.filter((g) => g.owner === owner).reduce((n, g) => n + g.count, 0),
    leaders: set.leaders.filter((l) => l.owner === owner).length,
  })).filter((s) => s.units > 0 || s.leaders > 0);
}
