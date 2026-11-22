import { createContext, useContext } from 'react';

/**
 * Focus hand-off of the Unit Manifest (SWR-009 MF, AC-7 «Закрыть» returns to the object): a DOM marker that opens the
 * manifest remembers its `data-testid`; on close `UnitInspector` moves the focus back to it (or to the panel of the
 * selection when the manifest was opened from the map). Outside `UnitInspector` it is a no-op.
 */
export interface ManifestFocus {
  /** Remembers the `data-testid` of the control that opened the manifest. */
  remember(testId: string): void;
}

const NOOP: ManifestFocus = { remember: () => undefined };

export const ManifestFocusContext = createContext<ManifestFocus>(NOOP);

export function useManifestFocus(): ManifestFocus {
  return useContext(ManifestFocusContext);
}
