import type Konva from 'konva';
import { type RefObject, useEffect, useRef } from 'react';
import { useBoard } from '../model/boardContext';
import type { BoardLayout } from '../model/boardLayout';

export interface BoardDebugSource {
  stage: RefObject<Konva.Stage | null>;
  layout: BoardLayout;
}

/**
 * Installs the read-only test hook (R-11) only in DEV or when `VITE_E2E === '1'`. The implementation is imported
 * dynamically inside the condition, so a production build without the flag drops it entirely (TC-ARCH-08).
 */
export function useBoardDebug(stage: BoardDebugSource['stage'], layout: BoardLayout): void {
  const { view } = useBoard();
  const latest = useRef({ layout, view });
  useEffect(() => {
    latest.current = { layout, view };
  }, [layout, view]);

  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E === '1')) return;
    let uninstall: (() => void) | undefined;
    let cancelled = false;
    void import('./boardDebugImpl').then((m) => {
      if (cancelled) return;
      uninstall = m.installBoardDebug(() => ({
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
