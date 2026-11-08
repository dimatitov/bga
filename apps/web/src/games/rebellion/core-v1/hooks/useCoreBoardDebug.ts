import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import type Konva from 'konva';
import { type RefObject, useEffect, useRef } from 'react';
import type { Bounds } from '../../board/model/geometry';
import type { LabelBox } from '../geometry/labelLayout';
import type { Scene } from '../geometry/sceneModel';

export interface CoreBoardDebugSnapshot {
  view: PlayerViewCore;
  scene: Scene;
  bounds: Bounds | null;
  /** Label box of every system (same numbers as the drawn labels). */
  labelBoxes: ReadonlyMap<string, LabelBox>;
}

/**
 * Installs the read-only test hook of the `core-v1` map only in DEV or when `VITE_E2E === '1'` (R-11, plan-frontend
 * §9). The implementation is imported dynamically inside the condition, so a production build without the flag
 * drops it entirely (TC-ARCH-08, `check:bundle`). Not installed under the hot-seat handoff screen (the stage is not
 * mounted there).
 */
export function useCoreBoardDebug(
  stage: RefObject<Konva.Stage | null>,
  snapshot: CoreBoardDebugSnapshot,
): void {
  const latest = useRef(snapshot);
  useEffect(() => {
    latest.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E === '1')) return;
    let uninstall: (() => void) | undefined;
    let cancelled = false;
    void import('./coreBoardDebugImpl').then((m) => {
      if (cancelled) return;
      uninstall = m.installCoreBoardDebug(() => ({
        container: stage.current?.container() ?? null,
        ...latest.current,
      }));
    });
    return () => {
      cancelled = true;
      uninstall?.();
    };
  }, [stage]);
}
