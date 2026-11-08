import { create } from 'zustand';
import { BUTTON_STEP } from './constants';
import {
  type Bounds,
  type Insets,
  NO_INSETS,
  type Size,
  type Viewport,
  effectiveMinScale,
  fitInsets,
  fitScale,
  fitViewport,
  panBy,
  sameBounds,
  sameInsets,
  zoomAt,
  zoomAtCenter,
} from './geometry';

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

interface ViewportState {
  gameId: string | null;
  viewport: Viewport;
  /** Whether the last change should be tweened (buttons/keys) or applied instantly (wheel/pan/drag). */
  animate: boolean;
  stageSize: Size;
  bounds: Bounds | null;
  /** Extra screen-pixel insets the content needs beyond the adaptive padding (core: screen-constant labels). */
  contentInsets: Insets;
  /**
   * Effective minimum zoom = `min(MIN_SCALE, fit scale)` (SWR-005 §6): zoom-out / wheel never go below it, so the
   * "whole map" view is always reachable and the zoom-out button disables exactly there.
   */
  minScale: number;
  /**
   * The user moved or zoomed the view since the last fit (or a remembered view was restored). While `false`,
   * a container resize and a bounds change re-fit the map (SWR-005 §6 item 4).
   */
  userAdjusted: boolean;
  /** In-memory view per game for this browser session (D-I-12). */
  byGame: Record<string, Viewport>;
  /** Stage size each remembered view was taken at: the view is restored only for the same size (SWR-005 §6). */
  byGameSize: Record<string, Size>;
  /** A user change of the view (marks `userAdjusted`). */
  setViewport(vp: Viewport, animate?: boolean): void;
  setStageSize(size: Size): void;
  setBounds(bounds: Bounds | null, contentInsets?: Insets): void;
  zoomAtPointer(pointer: { x: number; y: number }, factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  pan(dx: number, dy: number, animate?: boolean): void;
  /** «Вписать карту» / key `0` / automatic refit: shows the whole content and clears `userAdjusted`. */
  fit(animate?: boolean): void;
  /** Switch to a game: restore its remembered viewport (same stage size) or fit once bounds and size are known. */
  activateGame(gameId: string): void;
  /**
   * Forgets a game's remembered viewport and deactivates it (hot-seat handoff, SWR-004 plan-frontend §5.3):
   * the next `activateGame` fits the map again instead of restoring the previous player's zoom/pan.
   */
  forget(gameId: string): void;
}

function sameSize(a: Size | undefined, b: Size): boolean {
  return !!a && a.width === b.width && a.height === b.height;
}

function computeMinScale(bounds: Bounds | null, stage: Size, insets: Insets): number {
  if (!bounds || stage.width <= 0 || stage.height <= 0) return effectiveMinScale(null);
  return effectiveMinScale(fitScale(bounds, stage, fitInsets(stage, insets)));
}

export const useViewportStore = create<ViewportState>()((set, get) => {
  /** Stores a viewport (remembered per game together with the stage size it was taken at). */
  const commit = (viewport: Viewport, animate: boolean, userAdjusted: boolean) => {
    const { gameId, byGame, byGameSize, stageSize } = get();
    set({
      viewport,
      animate,
      userAdjusted,
      byGame: gameId ? { ...byGame, [gameId]: viewport } : byGame,
      byGameSize: gameId ? { ...byGameSize, [gameId]: stageSize } : byGameSize,
    });
  };
  const refreshMinScale = () => {
    const { bounds, stageSize, contentInsets, minScale } = get();
    const next = computeMinScale(bounds, stageSize, contentInsets);
    if (next !== minScale) set({ minScale: next });
  };
  const canFit = () => {
    const { bounds, stageSize } = get();
    return !!bounds && stageSize.width > 0 && stageSize.height > 0;
  };

  return {
    gameId: null,
    viewport: DEFAULT_VIEWPORT,
    animate: false,
    stageSize: { width: 0, height: 0 },
    bounds: null,
    contentInsets: NO_INSETS,
    minScale: effectiveMinScale(null),
    userAdjusted: false,
    byGame: {},
    byGameSize: {},
    setViewport: (viewport, animate = false) => commit(viewport, animate, true),
    setStageSize: (stageSize) => {
      const prev = get().stageSize;
      if (prev.width === stageSize.width && prev.height === stageSize.height) return;
      set({ stageSize });
      refreshMinScale();
      if (!get().userAdjusted && get().gameId && canFit()) get().fit(false);
    },
    setBounds: (bounds, contentInsets = NO_INSETS) => {
      const s = get();
      if (sameBounds(s.bounds, bounds) && sameInsets(s.contentInsets, contentInsets)) return;
      set({ bounds, contentInsets });
      refreshMinScale();
      if (!get().userAdjusted && get().gameId && canFit()) get().fit(false);
    },
    zoomAtPointer: (pointer, factor) =>
      get().setViewport(zoomAt(get().viewport, pointer, factor, get().minScale)),
    zoomIn: () =>
      get().setViewport(
        zoomAtCenter(get().viewport, get().stageSize, BUTTON_STEP, get().minScale),
        true,
      ),
    zoomOut: () =>
      get().setViewport(
        zoomAtCenter(get().viewport, get().stageSize, 1 / BUTTON_STEP, get().minScale),
        true,
      ),
    pan: (dx, dy, animate = false) => get().setViewport(panBy(get().viewport, dx, dy), animate),
    fit: (animate = true) => {
      if (!canFit()) return;
      const { bounds, stageSize, contentInsets } = get();
      refreshMinScale();
      commit(fitViewport(bounds!, stageSize, fitInsets(stageSize, contentInsets)), animate, false);
    },
    activateGame: (gameId) => {
      if (get().gameId === gameId) return;
      const saved = get().byGame[gameId];
      // D-I-12: a remembered view is restored only when the stage has the size it was taken at.
      const restore = !!saved && sameSize(get().byGameSize[gameId], get().stageSize);
      set({
        gameId,
        bounds: null,
        contentInsets: NO_INSETS,
        viewport: restore ? saved : DEFAULT_VIEWPORT,
        minScale: effectiveMinScale(null),
        userAdjusted: restore,
        animate: false,
      });
    },
    forget: (gameId) => {
      const { [gameId]: _dropped, ...byGame } = get().byGame;
      const { [gameId]: _droppedSize, ...byGameSize } = get().byGameSize;
      set({
        byGame,
        byGameSize,
        gameId: null,
        bounds: null,
        contentInsets: NO_INSETS,
        viewport: DEFAULT_VIEWPORT,
        minScale: effectiveMinScale(null),
        userAdjusted: false,
        animate: false,
      });
    },
  };
});
