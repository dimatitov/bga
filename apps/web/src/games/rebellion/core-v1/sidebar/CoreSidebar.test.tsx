import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../../board/model/selectionStore';
import { CS_CORELLIA, CS_SULLUST, L_LEIA, makeCoreView } from '../../test/coreFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { renderCore, resetCoreStores } from '../panels/test/harness';
import { CoreSidebar } from './CoreSidebar';

beforeEach(resetCoreStores);

describe('CoreSidebar rail (SWR-009 C2)', () => {
  it('order: turn panel → turn keys → inspector → tabs; aside named', () => {
    renderCore(<CoreSidebar log={<p>log</p>} gameInfo={<p>info</p>} />, makeCoreView());
    const aside = screen.getByTestId('core-sidebar');
    expect(aside.tagName).toBe('ASIDE');
    expect(aside).toHaveAccessibleName(/\S/);
    const order = [
      screen.getByTestId('turn-panel'),
      screen.getByTestId('turn-controls'),
      screen.getByTestId('core-context-panel'),
      screen.getByTestId('sidebar-tab-log'),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('fix 1: data-manifest-open follows the inspector rule (request matches the selection, no armed leader)', () => {
    renderCore(<CoreSidebar />, makeCoreView());
    const aside = screen.getByTestId('core-sidebar');
    expect(aside).toHaveAttribute('data-manifest-open', 'false');
    act(() => {
      useSelectionStore.getState().selectSystem(CS_CORELLIA);
      useCoreUiStore.getState().openManifest({ kind: 'system', systemId: CS_CORELLIA });
    });
    expect(aside).toHaveAttribute('data-manifest-open', 'true');
    // Another selection → the inspector shows the context panel again.
    act(() => useSelectionStore.getState().selectSystem(CS_SULLUST));
    expect(aside).toHaveAttribute('data-manifest-open', 'false');
    act(() => useSelectionStore.getState().selectSystem(CS_CORELLIA));
    expect(aside).toHaveAttribute('data-manifest-open', 'true');
    // QD-5: an armed leader turns the inspector back into the system panel.
    act(() => useCoreUiStore.getState().arm(L_LEIA));
    expect(aside).toHaveAttribute('data-manifest-open', 'false');
  });
});
