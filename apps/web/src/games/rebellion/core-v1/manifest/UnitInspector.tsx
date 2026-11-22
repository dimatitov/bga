import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MOBILE_SHEET } from '@/shared/theme';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useCoreUiStore } from '../model/coreUiStore';
import { CoreContextPanel } from '../panels/CoreContextPanel';
import { ManifestSheet } from './ManifestSheet';
import { requestMatchesSelection } from './manifestModel';
import { type ManifestFocus, ManifestFocusContext } from './manifestFocus';
import { UnitManifest } from './UnitManifest';

/** `< 760 px` (plan §4): the manifest is a bottom sheet. */
export const SHEET_QUERY = `(max-width:${MOBILE_SHEET - 0.05}px)`;

/** Where the focus goes after «Close» when the invoking marker is gone (opened from the map). */
const FALLBACK_TARGETS = ['system-panel', 'hidden-zone-panel', 'core-context-panel'];

function focusByTestId(testId: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return false;
  if (!el.matches('button, [href], input, select, textarea, [tabindex]')) el.tabIndex = -1;
  el.focus();
  return document.activeElement === el;
}

/**
 * Inspector slot of the console rail (SWR-009 K-7, MF). Shows the Unit Manifest while `coreUiStore.manifest` points at
 * the current selection (a system or the hidden zone) and no leader is armed (QD-5: the system panel then carries the
 * activation); otherwise the context panel of the selection (`core-context-panel`). Below 760 px the manifest is a
 * bottom sheet over the page and the context panel stays in the rail. «Close» returns the focus to the marker that
 * opened the manifest (or to the panel of the selection).
 */
export function UnitInspector() {
  const manifest = useCoreUiStore((s) => s.manifest);
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const closeManifest = useCoreUiStore((s) => s.closeManifest);
  const selection = useSelectionStore((s) => s.selection);
  const sheet = useMediaQuery(SHEET_QUERY, { noSsr: true });

  const invoker = useRef<string | null>(null);
  const restore = useRef<string | null>(null);
  const focus = useMemo<ManifestFocus>(
    () => ({
      remember: (testId) => {
        invoker.current = testId;
      },
    }),
    [],
  );

  const shown = armed === null && requestMatchesSelection(manifest, selection) ? manifest : null;

  const close = useCallback(() => {
    restore.current = invoker.current ?? '';
    invoker.current = null;
    closeManifest();
  }, [closeManifest]);

  useEffect(() => {
    if (shown !== null || restore.current === null) return;
    const wanted = restore.current;
    restore.current = null;
    for (const id of wanted ? [wanted, ...FALLBACK_TARGETS] : FALLBACK_TARGETS) {
      if (focusByTestId(id)) return;
    }
  });

  let content;
  if (shown === null) content = <CoreContextPanel />;
  else if (sheet)
    content = (
      <>
        <CoreContextPanel />
        <ManifestSheet request={shown} onClose={close} />
      </>
    );
  else content = <UnitManifest request={shown} variant="rail" onClose={close} />;

  return <ManifestFocusContext value={focus}>{content}</ManifestFocusContext>;
}
