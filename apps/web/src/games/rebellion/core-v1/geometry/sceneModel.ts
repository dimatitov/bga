/**
 * `view` + local UI state → props of the `core-v1` Konva nodes (SWR-005 plan-frontend §4). Pure, no React/Konva.
 *
 * Invariant (plan-frontend §0): nothing here evaluates game rules. Highlights come from `legalActions` via
 * `viewModel` (activation targets of the armed leader, move sources, movable units), markers from explicit view
 * fields (`remote`, `contestedSystemIds`, `activation`, `rebelBase.systemId`). The hidden rebel-base zone is drawn
 * exactly when `viewModel.hiddenZone(view)` says the server hides the base; its content is what the server put in
 * `location.kind === 'rebelBase'`.
 */
import type { CoreUnitView, Faction, FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import {
  HIDDEN_BASE_ZONE_RECT,
  type MapPoint,
  coreMapLayout,
  coreRegionShapes,
} from '@bga/game-rebellion/board';
import { layoutPiecesInSystem, overflowChipPosition } from '../../board/model/pieceLayout';
import type { Selection } from '../../board/model/selectionStore';
import {
  activatedSystemId,
  activationOf,
  activationTargets,
  hiddenZone,
  isContested,
  isMovable,
  moveSources,
  unitTypeOf,
  visibleRebelBaseSystemId,
} from '../model/viewModel';
import {
  LEADER_ARC_RADIUS,
  LEADER_STEP_DEG,
  ZONE_PADDING,
  ZONE_STEP,
  ZONE_TITLE_HEIGHT,
} from './constants';
import type { Lod } from './lod';

export interface SystemScene {
  id: string;
  nameKey: string;
  regionId: string;
  center: MapPoint;
  remote: boolean;
  contested: boolean;
  /** Activation target of the armed leader (`ACTIVATE_SYSTEM.systemIds`). */
  target: boolean;
  /** Side of the current activation when this is the activated system. */
  activatedBy: FactionId | null;
  /** `MOVE_PIECES` source of the viewer's activation. */
  source: boolean;
  selected: boolean;
  /** Rebel base shown here (only when the server sent `rebelBase.systemId`, Q-37). */
  isBase: boolean;
  /** A unit is dragged over this system and it is the move target. */
  dropTarget: boolean;
}

export interface UnitScene {
  id: string;
  owner: Faction;
  typeKey: string;
  arena: 'space' | 'ground';
  immobile: boolean;
  /** `null` = hidden rebel-base zone. */
  systemId: string | null;
  pos: MapPoint;
  movable: boolean;
  selected: boolean;
}

export interface LeaderScene {
  id: string;
  owner: Faction;
  /** `null` = hidden rebel-base zone. */
  systemId: string | null;
  pos: MapPoint;
  selected: boolean;
  /** Leader of the current activation. */
  activating: boolean;
}

export interface OverflowScene {
  systemId: string;
  owner: Faction;
  count: number;
  pos: MapPoint;
}

/** Compact LOD: one chip per side and system (units + leaders of that side). */
export interface ChipScene {
  systemId: string;
  owner: Faction;
  units: number;
  leaders: number;
  /** World centre of the system; the chip is offset in screen px (left for the Empire, right for the Rebels). */
  anchor: MapPoint;
}

export interface ZoneScene {
  rect: { x: number; y: number; width: number; height: number };
  units: UnitScene[];
  leaders: LeaderScene[];
  activated: boolean;
  selected: boolean;
}

export interface LinkScene {
  a: string;
  b: string;
  from: MapPoint;
  to: MapPoint;
}

export interface MoveLineScene {
  fromSystemId: string;
  toSystemId: string;
  from: MapPoint;
  to: MapPoint;
}

export interface Scene {
  lod: Lod;
  centers: Map<string, MapPoint>;
  regions: Array<{ id: string; nameKey: string; polygon: readonly MapPoint[]; label: MapPoint }>;
  links: LinkScene[];
  systems: SystemScene[];
  /** Detail LOD only (empty in compact). */
  units: UnitScene[];
  overflow: OverflowScene[];
  /** Compact LOD only (empty in detail). */
  chips: ChipScene[];
  /** Detail LOD only (in compact the leaders are counted in the chips). */
  leaders: LeaderScene[];
  zone: ZoneScene | null;
  moveLines: MoveLineScene[];
  targetIds: string[];
  sourceIds: string[];
  activatedSystemId: string | null;
}

export interface SceneInput {
  view: PlayerViewCore;
  armedLeaderId: string | null;
  selection: Selection;
  lod: Lod;
  /** Unit drag in progress (`overSystemId` = system under the pointer). */
  drag?: { pieceId: string; overSystemId: string | null } | null;
  layout?: Readonly<Record<string, MapPoint>>;
  /** Precomputed `buildMapStatics(view.map)` (memoised by the stage). */
  statics?: Pick<Scene, 'centers' | 'regions' | 'links'>;
}

const SIDES: readonly Faction[] = ['empire', 'rebels'];

function unitShape(view: PlayerViewCore, u: CoreUnitView) {
  const t = unitTypeOf(view, u.typeKey);
  return { arena: t?.arena ?? 'ground', immobile: t?.mobility === 'immobile' };
}

function arcPoint(center: MapPoint, deg: number, radius: number): MapPoint {
  const rad = (deg * Math.PI) / 180;
  return { x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) };
}

/** Leader badge slots on the outer arc above a system: Empire to the left of the top, Rebels to the right. */
export function leaderSlots(
  center: MapPoint,
  leaders: ReadonlyArray<{ id: string; owner: Faction }>,
): Map<string, MapPoint> {
  const slots = new Map<string, MapPoint>();
  const used: Record<Faction, number> = { empire: 0, rebels: 0 };
  const sorted = [...leaders].sort(
    (a, b) =>
      SIDES.indexOf(a.owner) - SIDES.indexOf(b.owner) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const l of sorted) {
    const n = used[l.owner]++;
    const offset = (n + 0.5) * LEADER_STEP_DEG;
    const deg = l.owner === 'empire' ? 270 - offset : 270 + offset;
    slots.set(l.id, arcPoint(center, deg, LEADER_ARC_RADIUS));
  }
  return slots;
}

/** Grid positions inside the hidden zone (below its title), row by row. */
export function zoneSlots(count: number, startIndex = 0): MapPoint[] {
  const z = HIDDEN_BASE_ZONE_RECT;
  const perRow = Math.max(1, Math.floor((z.width - ZONE_PADDING * 2) / ZONE_STEP) + 1);
  return Array.from({ length: count }, (_, i) => {
    const k = i + startIndex;
    return {
      x: z.x + ZONE_PADDING + (k % perRow) * ZONE_STEP,
      y: z.y + ZONE_TITLE_HEIGHT + Math.floor(k / perRow) * ZONE_STEP,
    };
  });
}

/** Static part of the scene (centres, region outlines, adjacency): depends on `view.map` only. */
export function buildMapStatics(
  map: PlayerViewCore['map'],
  layout: Readonly<Record<string, MapPoint>> = coreMapLayout,
): Pick<Scene, 'centers' | 'regions' | 'links'> {
  const centers = new Map<string, MapPoint>();
  for (const s of map.systems) {
    const p = layout[s.id];
    if (p) centers.set(s.id, p);
  }
  const regions = map.regions.flatMap((r) => {
    const shape = coreRegionShapes[r.id];
    return shape
      ? [{ id: r.id, nameKey: r.nameKey, polygon: shape.polygon, label: shape.label }]
      : [];
  });
  const links: LinkScene[] = [];
  for (const s of map.systems) {
    for (const n of s.adjacentSystemIds) {
      if (s.id >= n) continue; // each undirected edge once
      const from = centers.get(s.id);
      const to = centers.get(n);
      if (from && to) links.push({ a: s.id, b: n, from, to });
    }
  }
  return { centers, regions, links };
}

export function buildScene({
  view,
  armedLeaderId,
  selection,
  lod,
  drag = null,
  layout = coreMapLayout,
  statics = buildMapStatics(view.map, layout),
}: SceneInput): Scene {
  const { centers, regions, links } = statics;

  const targetIds = activationTargets(view, armedLeaderId);
  const targets = new Set(targetIds);
  const sources = moveSources(view);
  const sourceIds = sources.map((m) => m.fromSystemId);
  const activation = activationOf(view);
  const activated = activatedSystemId(view);
  const baseId = visibleRebelBaseSystemId(view);
  const dragTarget =
    drag && drag.overSystemId !== null && drag.overSystemId === activated ? activated : null;

  const systems: SystemScene[] = view.map.systems.flatMap((s) => {
    const center = centers.get(s.id);
    if (!center) return [];
    return [
      {
        id: s.id,
        nameKey: s.nameKey,
        regionId: s.regionId,
        center,
        remote: s.remote,
        contested: isContested(view, s.id),
        target: targets.has(s.id),
        activatedBy: activated === s.id && activation ? activation.side : null,
        source: sourceIds.includes(s.id),
        selected: selection.kind === 'system' && selection.systemId === s.id,
        isBase: baseId === s.id,
        dropTarget: dragTarget === s.id,
      },
    ];
  });

  const isSelectedUnit = (id: string) => selection.kind === 'piece' && selection.pieceId === id;
  const isSelectedLeader = (id: string) => selection.kind === 'leader' && selection.leaderId === id;

  // Units and leaders on the map, per system.
  const unitsBySystem = new Map<string, CoreUnitView[]>();
  for (const u of view.units) {
    if (u.location.kind !== 'system') continue;
    const list = unitsBySystem.get(u.location.systemId);
    if (list) list.push(u);
    else unitsBySystem.set(u.location.systemId, [u]);
  }
  const leadersBySystem = new Map<string, PlayerViewCore['leaders']>();
  for (const l of view.leaders) {
    if (l.location.kind !== 'system') continue;
    const list = leadersBySystem.get(l.location.systemId);
    if (list) list.push(l);
    else leadersBySystem.set(l.location.systemId, [l]);
  }

  const units: UnitScene[] = [];
  const overflow: OverflowScene[] = [];
  const chips: ChipScene[] = [];
  const leaders: LeaderScene[] = [];

  for (const [systemId, center] of centers) {
    const here = unitsBySystem.get(systemId) ?? [];
    const leadersHere = leadersBySystem.get(systemId) ?? [];
    if (lod === 'compact') {
      for (const owner of SIDES) {
        const u = here.filter((x) => x.owner === owner).length;
        const l = leadersHere.filter((x) => x.owner === owner).length;
        if (u + l > 0) chips.push({ systemId, owner, units: u, leaders: l, anchor: center });
      }
      continue;
    }
    const { slots, overflow: over } = layoutPiecesInSystem(
      center,
      here.map((u) => ({ id: u.id, kind: 'unit' as const, owner: u.owner })),
    );
    for (const u of here) {
      const pos = slots.get(u.id);
      if (!pos) continue;
      units.push({
        id: u.id,
        owner: u.owner,
        typeKey: u.typeKey,
        ...unitShape(view, u),
        systemId,
        pos,
        movable: isMovable(view, u.id),
        selected: isSelectedUnit(u.id),
      });
    }
    for (const owner of SIDES) {
      if (over[owner] > 0) {
        overflow.push({
          systemId,
          owner,
          count: over[owner],
          pos: overflowChipPosition(center, owner),
        });
      }
    }
    const lslots = leaderSlots(center, leadersHere);
    for (const l of leadersHere) {
      leaders.push({
        id: l.id,
        owner: l.owner,
        systemId,
        pos: lslots.get(l.id)!,
        selected: isSelectedLeader(l.id),
        activating: activation?.leaderId === l.id,
      });
    }
  }

  // Hidden rebel-base zone: exactly what the server placed there.
  const hz = hiddenZone(view);
  let zone: ZoneScene | null = null;
  if (hz) {
    const zoneUnits = hz.unitIds.flatMap((id) => {
      const u = view.units.find((x) => x.id === id);
      return u ? [u] : [];
    });
    const zoneLeaders = hz.leaderIds.flatMap((id) => {
      const l = view.leaders.find((x) => x.id === id);
      return l ? [l] : [];
    });
    const leaderPos = zoneSlots(zoneLeaders.length);
    const unitPos = zoneSlots(zoneUnits.length, zoneLeaders.length);
    zone = {
      rect: { ...HIDDEN_BASE_ZONE_RECT },
      leaders: zoneLeaders.map((l, i) => ({
        id: l.id,
        owner: l.owner,
        systemId: null,
        pos: leaderPos[i]!,
        selected: isSelectedLeader(l.id),
        activating: activation?.leaderId === l.id,
      })),
      units: zoneUnits.map((u, i) => ({
        id: u.id,
        owner: u.owner,
        typeKey: u.typeKey,
        ...unitShape(view, u),
        systemId: null,
        pos: unitPos[i]!,
        movable: false,
        selected: isSelectedUnit(u.id),
      })),
      activated: hz.activated,
      selected: selection.kind === 'zone',
    };
  }

  const moveLines: MoveLineScene[] = sources.flatMap((m) => {
    const from = centers.get(m.fromSystemId);
    const to = centers.get(m.toSystemId);
    return from && to ? [{ fromSystemId: m.fromSystemId, toSystemId: m.toSystemId, from, to }] : [];
  });

  return {
    lod,
    centers,
    regions,
    links,
    systems,
    units,
    overflow,
    chips,
    leaders,
    zone,
    moveLines,
    targetIds,
    sourceIds,
    activatedSystemId: activated,
  };
}
