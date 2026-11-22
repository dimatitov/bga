/**
 * `window.__boardDebug` for the `core-v1` map (R-11; SWR-005 plan-frontend §6 criterion, §9; SWR-009 plan §5.3).
 * Read-only: returns copies, cannot change game state. Same base methods as the `mock-v1` hook (zoom/pan/drag e2e keep
 * working) plus the core methods. Loaded only via dynamic import from `useCoreBoardDebug` under
 * `DEV || VITE_E2E === '1'`. Page coordinates = stage-relative screen point + the canvas container rect + page scroll.
 * Hidden information (§3.5): every method reads the redacted scene / view only — zone markers carry `systemId: null`,
 * AI marks come from the redacted events, nothing derives the rebel base system.
 */
import type { MapPoint } from '@bga/game-rebellion/board';
import { MAX_SCALE } from '../../board/model/constants';
import { useDragStore } from '../../board/model/dragStore';
import { type Bounds, worldToScreen } from '../../board/model/geometry';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useViewportStore } from '../../board/model/viewportStore';
import { type Rect, systemLabelRect } from '../geometry/labelLayout';
import { type Lod, lodFor } from '../geometry/lod';
import { markerScreenRect, rectCenter } from '../geometry/markerLayout';
import type { GroupMarkerScene } from '../geometry/sceneModel';
import { mapStats } from '../model/mapStats';
import { useCoreUiStore } from '../model/coreUiStore';
import { visibleRebelBaseSystemId } from '../model/viewModel';
import type { CoreBoardDebugSnapshot } from './useCoreBoardDebug';

export interface CoreBoardDebug {
  getViewport(): { scale: number; x: number; y: number };
  /** `min` = the effective minimum (`min(MIN_SCALE, fit scale)`), `max` = MAX_SCALE. */
  getZoomLimits(): { min: number; max: number };
  getSystemScreenPos(systemId: string): MapPoint | null;
  /**
   * SWR-009 §5.3: detail LOD — the unit's move handle when it is listed in `MOVE_PIECES` of the viewer's activation,
   * otherwise the centre of its group marker; compact — the side marker; hidden zone — the zone group marker.
   */
  getPieceScreenPos(pieceId: string): MapPoint | null;
  getSelection(): { kind: 'system' | 'piece' | 'leader' | 'zone' | null; id: string | null };
  /** Activation targets of the armed leader (`ACTIVATE_SYSTEM.systemIds`). */
  getHighlightedSystemIds(): string[];
  /** `MOVE_PIECES` sources of the viewer's activation. */
  getMoveSourceIds(): string[];
  isDragging(): boolean;
  /** Leader diamond (detail LOD / hidden zone) or its side marker (compact LOD); `null` for leaders in the pool. */
  getLeaderScreenPos(leaderId: string): MapPoint | null;
  /**
   * Page rect of a system label (screen-constant, below the system); `null` when the label is culled at low zoom
   * (collision culling, SWR-009 fix round 1) — the system's `data-label="hidden"` in `core-map-state`.
   */
  getSystemLabelRect(systemId: string): Rect | null;
  /** World bounds of the drawn content (what «вписать карту» fits). */
  getContentBounds(): Bounds | null;
  getLod(): Lod;
  getActivatedSystemId(): string | null;
  getArmedLeaderId(): string | null;
  getRulesEngine(): 'core-v1';
  /** Rebel base system as shown to the viewer (`null` while hidden, Q-37). */
  getRebelBaseSystemId(): string | null;
  getContestedSystemIds(): string[];
  hasHiddenZone(): boolean;
  /** Every group counter marker on the map (`systemId: null` = the hidden zone), page centre of each. */
  getGroupMarkers(): DebugGroupMarker[];
  /** Systems marked as touched by the AI in its last run (order of first appearance). */
  getAiRecentSystemIds(): string[];
  /** Undirected routes of `view.map` (base game: 69). */
  getRouteCount(): number;
  getRegionCount(): number;
}

export interface DebugGroupMarker {
  systemId: string | null;
  side: 'empire' | 'rebels';
  arena: 'space' | 'ground' | 'all';
  count: number;
  screen: MapPoint;
}

export interface CoreBoardDebugContext extends CoreBoardDebugSnapshot {
  container: HTMLElement | null;
}

/** The global is typed by the mock hook; the core API is a superset with wider `getSelection` kinds. */
type DebugHost = { __boardDebug?: unknown };

export function installCoreBoardDebug(get: () => CoreBoardDebugContext): () => void {
  const origin = () => {
    const { container } = get();
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
  };
  const toPage = (world: MapPoint | undefined) => {
    const o = origin();
    if (!world || !o) return null;
    const p = worldToScreen(useViewportStore.getState().viewport, world);
    return { x: o.x + p.x, y: o.y + p.y };
  };
  const markerCenter = (m: GroupMarkerScene | undefined) => {
    const o = origin();
    if (!o || !m) return null;
    const c = rectCenter(markerScreenRect(m.anchor, m.box, useViewportStore.getState().viewport));
    return { x: o.x + c.x, y: o.y + c.y };
  };
  const allMarkers = () => {
    const { scene } = get();
    return [...scene.markers, ...(scene.zone?.markers ?? [])];
  };

  const api: CoreBoardDebug = {
    getViewport: () => ({ ...useViewportStore.getState().viewport }),
    getZoomLimits: () => ({ min: useViewportStore.getState().minScale, max: MAX_SCALE }),
    getSystemScreenPos: (id) => toPage(get().scene.centers.get(id)),
    getPieceScreenPos: (id) => {
      const handle = get().scene.handles.find((u) => u.id === id);
      if (handle) return toPage(handle.pos);
      return markerCenter(allMarkers().find((m) => m.unitIds.includes(id)));
    },
    getSelection: () => {
      const s = useSelectionStore.getState().selection;
      switch (s.kind) {
        case 'system':
          return { kind: 'system', id: s.systemId };
        case 'piece':
          return { kind: 'piece', id: s.pieceId };
        case 'leader':
          return { kind: 'leader', id: s.leaderId };
        case 'zone':
          return { kind: 'zone', id: null };
        default:
          return { kind: null, id: null };
      }
    },
    getHighlightedSystemIds: () => [...get().scene.targetIds],
    getMoveSourceIds: () => [...get().scene.sourceIds],
    isDragging: () => useDragStore.getState().drag !== null,
    getLeaderScreenPos: (id) => {
      const { scene } = get();
      const badge =
        scene.leaders.find((l) => l.id === id) ?? scene.zone?.leaders.find((l) => l.id === id);
      if (badge) return toPage(badge.pos);
      return markerCenter(scene.markers.find((m) => m.leaderIds.includes(id)));
    },
    getSystemLabelRect: (id) => {
      const { scene, labelBoxes, shownLabels } = get();
      if (shownLabels && !shownLabels.systems.has(id)) return null; // culled (fix round 1): not drawn
      const center = scene.centers.get(id);
      const box = labelBoxes.get(id);
      const o = origin();
      if (!center || !box || !o) return null;
      const r = systemLabelRect(center, box, useViewportStore.getState().viewport);
      return { x: o.x + r.x, y: o.y + r.y, width: r.width, height: r.height };
    },
    getContentBounds: () => {
      const b = get().bounds;
      return b ? { ...b } : null;
    },
    getLod: () => lodFor(useViewportStore.getState().viewport.scale),
    getActivatedSystemId: () => get().scene.activatedSystemId,
    getArmedLeaderId: () => useCoreUiStore.getState().armedLeaderId,
    getRulesEngine: () => 'core-v1',
    getRebelBaseSystemId: () => visibleRebelBaseSystemId(get().view),
    getContestedSystemIds: () => [...get().view.contestedSystemIds],
    hasHiddenZone: () => get().scene.zone !== null,
    getGroupMarkers: () =>
      allMarkers().flatMap((m) => {
        const screen = markerCenter(m);
        return screen
          ? [{ systemId: m.systemId, side: m.owner, arena: m.arena, count: m.count, screen }]
          : [];
      }),
    getAiRecentSystemIds: () => [...get().scene.aiRecentIds],
    getRouteCount: () => mapStats(get().view.map).routes,
    getRegionCount: () => mapStats(get().view.map).regions,
  };
  const w = window as unknown as DebugHost;
  w.__boardDebug = api;
  return () => {
    if (w.__boardDebug === api) delete w.__boardDebug;
  };
}
