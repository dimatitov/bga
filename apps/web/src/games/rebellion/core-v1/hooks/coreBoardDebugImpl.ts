/**
 * `window.__boardDebug` for the `core-v1` map (R-11; SWR-005 plan-frontend §6 criterion, §9). Read-only: returns
 * copies, cannot change game state. Same base methods as the `mock-v1` hook (zoom/pan/drag e2e keep working) plus the
 * core methods. Loaded only via dynamic import from `useCoreBoardDebug` under `DEV || VITE_E2E === '1'`.
 * Page coordinates = stage-relative screen point + the canvas container rect + page scroll.
 */
import type { MapPoint } from '@bga/game-rebellion/board';
import { MAX_SCALE } from '../../board/model/constants';
import { useDragStore } from '../../board/model/dragStore';
import { type Bounds, worldToScreen } from '../../board/model/geometry';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useViewportStore } from '../../board/model/viewportStore';
import { chipBox, chipRect, type Rect, systemLabelRect } from '../geometry/labelLayout';
import { type Lod, lodFor } from '../geometry/lod';
import { useCoreUiStore } from '../model/coreUiStore';
import { visibleRebelBaseSystemId } from '../model/viewModel';
import type { CoreBoardDebugSnapshot } from './useCoreBoardDebug';

export interface CoreBoardDebug {
  getViewport(): { scale: number; x: number; y: number };
  /** `min` = the effective minimum (`min(MIN_SCALE, fit scale)`), `max` = MAX_SCALE. */
  getZoomLimits(): { min: number; max: number };
  getSystemScreenPos(systemId: string): MapPoint | null;
  /** Unit glyph (detail LOD) or its side chip (compact LOD); units in the hidden zone — their zone slot. */
  getPieceScreenPos(pieceId: string): MapPoint | null;
  getSelection(): { kind: 'system' | 'piece' | 'leader' | 'zone' | null; id: string | null };
  /** Activation targets of the armed leader (`ACTIVATE_SYSTEM.systemIds`). */
  getHighlightedSystemIds(): string[];
  /** `MOVE_PIECES` sources of the viewer's activation. */
  getMoveSourceIds(): string[];
  isDragging(): boolean;
  /** Leader badge (detail LOD) or its side chip (compact LOD); `null` for leaders in the pool. */
  getLeaderScreenPos(leaderId: string): MapPoint | null;
  /** Page rect of a system label (screen-constant, below the system). */
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
  const chipCenter = (systemId: string, owner: 'empire' | 'rebels') => {
    const o = origin();
    const chip = get().scene.chips.find((c) => c.systemId === systemId && c.owner === owner);
    if (!o || !chip) return null;
    const r = chipRect(
      chip.anchor,
      owner,
      chipBox(chip.units, chip.leaders),
      useViewportStore.getState().viewport,
    );
    return { x: o.x + r.x + r.width / 2, y: o.y + r.y + r.height / 2 };
  };

  const api: CoreBoardDebug = {
    getViewport: () => ({ ...useViewportStore.getState().viewport }),
    getZoomLimits: () => ({ min: useViewportStore.getState().minScale, max: MAX_SCALE }),
    getSystemScreenPos: (id) => toPage(get().scene.centers.get(id)),
    getPieceScreenPos: (id) => {
      const { scene, view } = get();
      const glyph =
        scene.units.find((u) => u.id === id) ?? scene.zone?.units.find((u) => u.id === id);
      if (glyph) return toPage(glyph.pos);
      const unit = view.units.find((u) => u.id === id);
      if (unit?.location.kind === 'system') return chipCenter(unit.location.systemId, unit.owner);
      return null;
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
      const { scene, view } = get();
      const badge =
        scene.leaders.find((l) => l.id === id) ?? scene.zone?.leaders.find((l) => l.id === id);
      if (badge) return toPage(badge.pos);
      const leader = view.leaders.find((l) => l.id === id);
      if (leader?.location.kind === 'system')
        return chipCenter(leader.location.systemId, leader.owner);
      return null;
    },
    getSystemLabelRect: (id) => {
      const { scene, labelBoxes } = get();
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
  };
  const w = window as unknown as DebugHost;
  w.__boardDebug = api;
  return () => {
    if (w.__boardDebug === api) delete w.__boardDebug;
  };
}
