/**
 * `view` + local UI state → props of the `core-v1` Konva nodes (SWR-005 plan-frontend §4; SWR-009 plan §2 M). Pure, no
 * React/Konva.
 *
 * Invariant (plan-frontend §0, SWR-009 §3.5): nothing here evaluates game rules or infers hidden information.
 * Highlights come from `legalActions` via `viewModel` (activation targets of the armed leader, move sources, movable
 * units), state marks from explicit view fields (`remote`, `contestedSystemIds`, `activation`, `rebelBase.systemId`),
 * AI marks from `aiRecentMarks` (redacted events of the last run), group counters from `forcesBySystem` (only
 * `location.kind === 'system'`) and the hidden-zone counters from `zoneForces` — the zone carries no system id.
 */
import type { FactionId, PlayerViewCore } from '@bga/game-rebellion/schema';
import {
  HIDDEN_BASE_ZONE_RECT,
  type MapPoint,
  coreMapLayout,
  coreRegionShapes,
} from '@bga/game-rebellion/board';
import type { Selection } from '../../board/model/selectionStore';
import type { AiRecentMarks } from '../model/aiRecent';
import type { ManifestRequest } from '../model/coreUiStore';
import { type Arena, arenaOf, forcesBySystem, sideTotals, zoneForces } from '../model/forces';
import {
  activatedSystemId,
  activationOf,
  activationTargets,
  hiddenZone,
  isContested,
  moveSources,
  visibleRebelBaseSystemId,
} from '../model/viewModel';
import {
  HANDLE_ARC_RADIUS,
  HANDLE_STEP_DEG,
  LEADER_ARC_RADIUS,
  LEADER_STEP_DEG,
  ZONE_PADDING,
  ZONE_STEP,
  ZONE_TITLE_HEIGHT,
} from './constants';
import type { Lod } from './lod';
import {
  type MarkerBox,
  compactMarkerBox,
  groupMarkerBox,
  groupMarkerWidth,
  zoneMarkerBox,
} from './markerLayout';

type Faction = FactionId;

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
  activatedBy: Faction | null;
  /** `MOVE_PIECES` source of the viewer's activation. */
  source: boolean;
  selected: boolean;
  /** Rebel base shown here (only when the server sent `rebelBase.systemId`, Q-37). */
  isBase: boolean;
  /** A unit is dragged over this system and it is the move target. */
  dropTarget: boolean;
  /** A unit is dragged over this system and it is NOT the move target. */
  dropIllegal: boolean;
  /** Touched by the AI in its last run: 1-based order of first appearance («AI · 01»), else `null`. */
  aiRecent: number | null;
}

/** A single-unit move handle (detail LOD, own activation): a unit listed in `MOVE_PIECES.pieces`. */
export interface UnitScene {
  id: string;
  owner: Faction;
  typeKey: string;
  arena: Arena;
  systemId: string;
  pos: MapPoint;
  /** Always true for a handle (listed by the server); kept for the node props. */
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

/**
 * Counter marker of one group (SWR-009 AC-6, QD-4): detail — side × arena; compact — one per side (`arena: 'all'`,
 * leaders counted too); hidden zone — Rebel side × arena with `systemId: null`. Screen-constant box (`markerLayout`).
 */
export interface GroupMarkerScene {
  key: string;
  /** `null` = the hidden rebel-base zone (never a system id there, §3.5). */
  systemId: string | null;
  owner: Faction;
  arena: Arena | 'all';
  /** Number of units (figures) of the group (compact: all units of the side). */
  count: number;
  /** Fleet / ground split of `count` (detail: the group's own arena; compact: both, drawn «▲n ■m»). */
  space: number;
  ground: number;
  /** Compact LOD only: leaders of the side at the system (0 otherwise). */
  leaders: number;
  unitIds: string[];
  leaderIds: string[];
  /** World anchor (system centre / zone point); `box` is relative to it in screen px at factor 1. */
  anchor: MapPoint;
  box: MarkerBox;
  /** Contains the selected unit, or is the group of the open Unit Manifest. */
  selected: boolean;
}

export interface ZoneScene {
  rect: { x: number; y: number; width: number; height: number };
  /** Unit ids the server placed in the zone (counted by `markers`). */
  unitIds: string[];
  markers: GroupMarkerScene[];
  leaders: LeaderScene[];
  activated: boolean;
  selected: boolean;
  /** The AI's last run touched the zone (a `null` system in the redacted events). */
  aiRecent: boolean;
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
  /** Group counter markers of the systems (detail: side × arena; compact: per side). */
  markers: GroupMarkerScene[];
  /** Detail LOD, own activation only: single-unit drag handles (empty otherwise). */
  handles: UnitScene[];
  /** Detail LOD only (in compact the leaders are counted in the markers). */
  leaders: LeaderScene[];
  zone: ZoneScene | null;
  moveLines: MoveLineScene[];
  targetIds: string[];
  sourceIds: string[];
  activatedSystemId: string | null;
  /** Systems of the AI's last run, in order of first appearance. */
  aiRecentIds: string[];
}

export interface SceneInput {
  view: PlayerViewCore;
  armedLeaderId: string | null;
  selection: Selection;
  lod: Lod;
  /** Unit drag in progress (`overSystemId` = system under the pointer, `overState` from `useCoreMoveDrag`). */
  drag?: {
    pieceId: string;
    overSystemId: string | null;
    overState?: 'legal' | 'illegal' | 'none';
  } | null;
  /** AI marks of the last automation run (`aiRecentMarks`), `null` = none. */
  aiRecent?: AiRecentMarks | null;
  /** The open Unit Manifest (highlights its group's marker). */
  manifest?: ManifestRequest | null;
  layout?: Readonly<Record<string, MapPoint>>;
  /** Precomputed `buildMapStatics(view.map)` (memoised by the stage). */
  statics?: Pick<Scene, 'centers' | 'regions' | 'links'>;
}

const SIDES: readonly Faction[] = ['empire', 'rebels'];

function arcPoint(center: MapPoint, deg: number, radius: number): MapPoint {
  const rad = (deg * Math.PI) / 180;
  return { x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) };
}

/** Slot offset (in steps) for the n-th item: 0, +1, −1, +2, −2 … */
function slotOffset(n: number): number {
  return n === 0 ? 0 : n % 2 === 1 ? (n + 1) / 2 : -(n / 2);
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

/** Move-handle slots on the inner upper arc of a source system (centred on the top, alternating sides). */
export function handleSlots(center: MapPoint, ids: readonly string[]): Map<string, MapPoint> {
  const slots = new Map<string, MapPoint>();
  [...ids].sort().forEach((id, n) => {
    slots.set(id, arcPoint(center, 270 + slotOffset(n) * HANDLE_STEP_DEG, HANDLE_ARC_RADIUS));
  });
  return slots;
}

/** World anchor of the hidden-zone markers (below the zone title, left). */
export function zoneMarkerAnchor(): MapPoint {
  const z = HIDDEN_BASE_ZONE_RECT;
  return { x: z.x + ZONE_PADDING, y: z.y + ZONE_TITLE_HEIGHT };
}

/** Leader diamonds of the hidden zone: a row from the right edge, below the title. */
export function zoneLeaderSlots(count: number): MapPoint[] {
  const z = HIDDEN_BASE_ZONE_RECT;
  return Array.from({ length: count }, (_, i) => ({
    x: z.x + z.width - ZONE_PADDING - i * ZONE_STEP,
    y: z.y + ZONE_TITLE_HEIGHT + ZONE_STEP / 2,
  }));
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

function manifestGroupSelected(
  manifest: ManifestRequest | null,
  systemId: string | null,
  owner: Faction,
  arena: Arena | 'all',
): boolean {
  if (!manifest?.group) return false;
  const t = manifest.target;
  const sameTarget =
    systemId === null ? t.kind === 'zone' : t.kind === 'system' && t.systemId === systemId;
  return (
    sameTarget &&
    manifest.group.owner === owner &&
    (manifest.group.arena === arena || manifest.group.arena === 'all' || arena === 'all')
  );
}

export function buildScene({
  view,
  armedLeaderId,
  selection,
  lod,
  drag = null,
  aiRecent = null,
  manifest = null,
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
  const over = drag?.overSystemId ?? null;
  const dragTarget = over !== null && over === activated ? activated : null;
  const dragIllegal =
    over !== null && over !== activated && drag?.overState === 'illegal' ? over : null;
  const aiRecentIds = aiRecent?.systemIds ?? [];

  const systems: SystemScene[] = view.map.systems.flatMap((s) => {
    const center = centers.get(s.id);
    if (!center) return [];
    const aiIndex = aiRecentIds.indexOf(s.id);
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
        dropIllegal: dragIllegal === s.id,
        aiRecent: aiIndex >= 0 ? aiIndex + 1 : null,
      },
    ];
  });

  const selectedPiece = selection.kind === 'piece' ? selection.pieceId : null;
  const isSelectedLeader = (id: string) => selection.kind === 'leader' && selection.leaderId === id;

  // Group counters: ONLY units / leaders whose location is the system (§3.5).
  const forces = forcesBySystem(view);
  const markers: GroupMarkerScene[] = [];
  const leaders: LeaderScene[] = [];
  for (const [systemId, center] of centers) {
    const set = forces.get(systemId);
    if (!set) continue;
    if (lod === 'compact') {
      for (const side of sideTotals(set)) {
        const unitIds = set.groups.filter((g) => g.owner === side.owner).flatMap((g) => g.unitIds);
        const leaderIds = set.leaders.filter((l) => l.owner === side.owner).map((l) => l.id);
        const arenaCount = (arena: Arena) =>
          set.groups.find((g) => g.owner === side.owner && g.arena === arena)?.count ?? 0;
        const split = { space: arenaCount('space'), ground: arenaCount('ground') };
        markers.push({
          key: `${systemId}-${side.owner}-all`,
          systemId,
          owner: side.owner,
          arena: 'all',
          count: side.units,
          ...split,
          leaders: side.leaders,
          unitIds,
          leaderIds,
          anchor: center,
          box: compactMarkerBox(side.owner, { ...split, leaders: side.leaders }),
          selected:
            (selectedPiece !== null && unitIds.includes(selectedPiece)) ||
            manifestGroupSelected(manifest, systemId, side.owner, 'all'),
        });
      }
      continue;
    }
    for (const g of set.groups) {
      markers.push({
        key: `${systemId}-${g.owner}-${g.arena}`,
        systemId,
        owner: g.owner,
        arena: g.arena,
        count: g.count,
        space: g.arena === 'space' ? g.count : 0,
        ground: g.arena === 'ground' ? g.count : 0,
        leaders: 0,
        unitIds: [...g.unitIds],
        leaderIds: [],
        anchor: center,
        box: groupMarkerBox(g.owner, g.arena, g.count),
        selected:
          (selectedPiece !== null && g.unitIds.includes(selectedPiece)) ||
          manifestGroupSelected(manifest, systemId, g.owner, g.arena),
      });
    }
    const lslots = leaderSlots(center, set.leaders);
    for (const l of set.leaders) {
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

  // Single-unit move handles: detail LOD, units the server lists in MOVE_PIECES of the viewer's activation.
  const handles: UnitScene[] = [];
  if (lod === 'detail') {
    for (const source of sources) {
      const center = centers.get(source.fromSystemId);
      if (!center) continue;
      const ids = source.pieces
        .map((p) => p.pieceId)
        .filter((id) => {
          const u = view.units.find((x) => x.id === id);
          return u?.location.kind === 'system' && u.location.systemId === source.fromSystemId;
        });
      const slots = handleSlots(center, ids);
      for (const id of ids) {
        const u = view.units.find((x) => x.id === id)!;
        handles.push({
          id,
          owner: u.owner,
          typeKey: u.typeKey,
          arena: arenaOf(view, u.typeKey),
          systemId: source.fromSystemId,
          pos: slots.get(id)!,
          movable: true,
          selected: selectedPiece === id,
        });
      }
    }
  }

  // Hidden rebel-base zone: exactly what the server placed there; no system id anywhere in it.
  const hz = hiddenZone(view);
  const zf = zoneForces(view);
  let zone: ZoneScene | null = null;
  if (hz && zf) {
    const anchor = zoneMarkerAnchor();
    const spaceGroup = zf.groups.find((g) => g.arena === 'space');
    const spaceWidth = spaceGroup ? groupMarkerWidth(spaceGroup.count) : 0;
    const zoneMarkers = zf.groups.map((g): GroupMarkerScene => ({
      key: `zone-${g.owner}-${g.arena}`,
      systemId: null,
      owner: g.owner,
      arena: g.arena,
      count: g.count,
      space: g.arena === 'space' ? g.count : 0,
      ground: g.arena === 'ground' ? g.count : 0,
      leaders: 0,
      unitIds: [...g.unitIds],
      leaderIds: [],
      anchor,
      box: zoneMarkerBox(g.arena, g.count, spaceGroup ? spaceWidth : -6),
      selected:
        (selectedPiece !== null && g.unitIds.includes(selectedPiece)) ||
        manifestGroupSelected(manifest, null, g.owner, g.arena),
    }));
    const leaderPos = zoneLeaderSlots(zf.leaders.length);
    zone = {
      rect: { ...HIDDEN_BASE_ZONE_RECT },
      unitIds: [...hz.unitIds],
      markers: zoneMarkers,
      leaders: zf.leaders.map((l, i) => ({
        id: l.id,
        owner: l.owner,
        systemId: null,
        pos: leaderPos[i]!,
        selected: isSelectedLeader(l.id),
        activating: activation?.leaderId === l.id,
      })),
      activated: hz.activated,
      selected: selection.kind === 'zone',
      aiRecent: aiRecent?.zone ?? false,
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
    markers,
    handles,
    leaders,
    zone,
    moveLines,
    targetIds,
    sourceIds,
    activatedSystemId: activated,
    aiRecentIds: aiRecentIds.filter((id) => centers.has(id)),
  };
}
