import { create } from 'zustand';
import { BUTTON_STEP } from './constants';
import {
  type Bounds,
  type Size,
  type Viewport,
  fitViewport,
  panBy,
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
  /** In-memory view per game for this browser session (D-I-12). */
  byGame: Record<string, Viewport>;
  setViewport(vp: Viewport, animate?: boolean): void;
  setStageSize(size: Size): void;
  setBounds(bounds: Bounds | null): void;
  zoomAtPointer(pointer: { x: number; y: number }, factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  pan(dx: number, dy: number, animate?: boolean): void;
  fit(animate?: boolean): void;
  /** Switch to a game: restore its remembered viewport or fit once bounds and stage size are known. */
  activateGame(gameId: string): void;
  /**
   * Forgets a game's remembered viewport and deactivates it (hot-seat handoff, SWR-004 plan-frontend §5.3):
   * the next `activateGame` fits the map again instead of restoring the previous player's zoom/pan.
   */
  forget(gameId: string): void;
}

export const useViewportStore = create<ViewportState>()((set, get) => ({
  gameId: null,
  viewport: DEFAULT_VIEWPORT,
  animate: false,
  stageSize: { width: 0, height: 0 },
  bounds: null,
  byGame: {},
  setViewport: (viewport, animate = false) => {
    const { gameId, byGame } = get();
    set({ viewport, animate, byGame: gameId ? { ...byGame, [gameId]: viewport } : byGame });
  },
  setStageSize: (stageSize) => {
    const prev = get().stageSize;
    if (prev.width === stageSize.width && prev.height === stageSize.height) return;
    set({ stageSize });
    const { gameId, byGame } = get();
    if (prev.width === 0 && gameId && !byGame[gameId]) get().fit(false);
  },
  setBounds: (bounds) => {
    set({ bounds });
    const { gameId, byGame, stageSize } = get();
    if (bounds && stageSize.width > 0 && gameId && !byGame[gameId]) get().fit(false);
  },
  zoomAtPointer: (pointer, factor) => get().setViewport(zoomAt(get().viewport, pointer, factor)),
  zoomIn: () => get().setViewport(zoomAtCenter(get().viewport, get().stageSize, BUTTON_STEP), true),
  zoomOut: () =>
    get().setViewport(zoomAtCenter(get().viewport, get().stageSize, 1 / BUTTON_STEP), true),
  pan: (dx, dy, animate = false) => get().setViewport(panBy(get().viewport, dx, dy), animate),
  fit: (animate = true) => {
    const { bounds, stageSize } = get();
    if (!bounds || stageSize.width <= 0 || stageSize.height <= 0) return;
    get().setViewport(fitViewport(bounds, stageSize), animate);
  },
  activateGame: (gameId) => {
    if (get().gameId === gameId) return;
    const saved = get().byGame[gameId];
    set({ gameId, bounds: null, viewport: saved ?? DEFAULT_VIEWPORT, animate: false });
  },
  forget: (gameId) => {
    const { [gameId]: _dropped, ...byGame } = get().byGame;
    set({ byGame, gameId: null, bounds: null, viewport: DEFAULT_VIEWPORT, animate: false });
  },
}));
