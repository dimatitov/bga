import { type KeyboardEvent, useCallback, useEffect } from 'react';
import { KEY_PAN } from '../model/constants';
import { activeDragNode, useDragStore } from '../model/dragStore';
import { useSelectionStore } from '../model/selectionStore';
import { useViewportStore } from '../model/viewportStore';

/** Cancels an in-progress drag (the drop handler then rolls the piece back). Returns true if a drag was active. */
export function cancelActiveDrag(): boolean {
  const node = activeDragNode.current;
  if (!node || !useDragStore.getState().drag) return false;
  useDragStore.getState().over(null, 'none');
  node.stopDrag();
  return true;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    !!el.closest('[role="menu"]')
  );
}

/** D-I-9: global Esc — cancel a drag, otherwise clear the selection (unless focus is in an input/menu). */
export function useGlobalEscape(): void {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (cancelActiveDrag()) return;
      if (isTypingTarget(document.activeElement)) return;
      useSelectionStore.getState().clearSelection();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** D-I-10: keys on the focused map container — arrows pan, +/=/− zoom, 0 fits. Esc is handled globally. */
export function useBoardKeyboard() {
  return useCallback((e: KeyboardEvent<HTMLElement>) => {
    const vp = useViewportStore.getState();
    switch (e.key) {
      case 'ArrowLeft':
        vp.pan(KEY_PAN, 0, true);
        break;
      case 'ArrowRight':
        vp.pan(-KEY_PAN, 0, true);
        break;
      case 'ArrowUp':
        vp.pan(0, KEY_PAN, true);
        break;
      case 'ArrowDown':
        vp.pan(0, -KEY_PAN, true);
        break;
      case '+':
      case '=':
        vp.zoomIn();
        break;
      case '-':
      case '_':
      case '−':
        vp.zoomOut();
        break;
      case '0':
        vp.fit(true);
        break;
      default:
        return;
    }
    e.preventDefault();
  }, []);
}
