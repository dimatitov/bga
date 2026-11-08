import { type RefObject, useLayoutEffect } from 'react';
import { useViewportStore } from '../model/viewportStore';

/** Tracks the board container size (ResizeObserver) into the viewport store. */
export function useStageSize(ref: RefObject<HTMLElement | null>): void {
  const setStageSize = useViewportStore((s) => s.setStageSize);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setStageSize({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, setStageSize]);
}
